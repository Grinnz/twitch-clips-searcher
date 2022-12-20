#!/usr/bin/env perl

use 5.020;
use Mojolicious::Lite -signatures;
use List::Util 1.45 'uniqstr';
use Mojo::Promise;
use Mojo::URL;
use Mojo::UserAgent;

plugin 'Config';
app->secrets(app->config->{secrets}) if defined app->config->{secrets};
app->log->path(app->config->{logfile}) if defined app->config->{logfile};

my $ua;
helper ua => sub ($c) { $ua //= Mojo::UserAgent->new };

my ($access_token, $access_token_expire);
helper access_token => sub ($c) {
  return Mojo::Promise->resolve($access_token) if defined $access_token and $access_token_expire > time;
  my $client_id = $c->app->config('twitch_client_id') // die "No twitch_client_id configured for your application\n";
  my $client_secret = $c->app->config('twitch_client_secret') // die "No twitch_client_secret configured for your application\n";
  $c->ua->post_p('https://id.twitch.tv/oauth2/token', form => {
    client_id => $client_id,
    client_secret => $client_secret,
    grant_type => 'client_credentials',
  })->then(sub ($tx) {
    my $result = $tx->result;
    if (my $err = $result->error) {
      die "API error retrieving oauth2 access token: $err->{code} $err->{message}\n";
    }
    my $response = $result->json;
    $access_token = $response->{access_token} // die "oauth2 access token request did not return a token\n";
    $access_token_expire = time + ($response->{expires_in} // 0);
    return $access_token;
  });
};

helper clear_access_token => sub ($c) { undef $access_token };

helper api_request => sub ($c, $method, $endpoint, $url_params = undef, $body_json = undef, $is_retry = 0) {
  my $url = Mojo::URL->new('https://api.twitch.tv/helix/')->path($endpoint);
  $url->query($url_params) if $url_params;
  my @body;
  @body = (json => $body_json) if $body_json;
  my $client_id = $c->app->config('twitch_client_id') // die "No twitch_client_id configured for your application\n";
  $c->access_token->then(sub ($access_token) {
    my $headers = {
      Authorization => "Bearer $access_token",
      'Client-Id' => $client_id,
    };
    my $tx = $c->ua->build_tx(uc($method), $url, $headers, @body);
    $c->ua->start_p($tx)->then(sub ($tx) {
      my $result = $tx->result;
      if (my $err = $result->error) {
        if ($err->{code} == 401 and !$is_retry) {
          $c->clear_access_token;
          return $c->api_request($method, $endpoint, $url_params, $body_json, 1);
        }
        die "API error in $method $endpoint: $err->{code} $err->{message}\n";
      }
      return $result->json;
    });
  });
};

helper get_user_clips => sub ($c, $broadcaster_id, $cursor = undef) {
  my %params = (broadcaster_id => $broadcaster_id, first => 100);
  $params{after} = $cursor if defined $cursor;
  $c->api_request(GET => 'clips', \%params)->then(sub ($response) {
    return $response // {};
  });
};

helper get_users_by_name => sub ($c, $usernames) {
  my @usernames = ref $usernames eq 'ARRAY' ? @$usernames : $usernames;
  $c->api_request(GET => 'users', {login => \@usernames})->then(sub ($response) {
    my %users;
    foreach my $user (@{$response->{data} // []}) {
      my $username = $user->{login} // next;
      $users{lc $username} = $user;
    }
    return \%users;
  });
};

helper get_games_by_id => sub ($c, $ids) {
  my @ids = ref $ids eq 'ARRAY' ? @$ids : $ids;
  $c->api_request(GET => 'games', {id => \@ids})->then(sub ($response) {
    my %games;
    foreach my $game (@{$response->{data} // []}) {
      my $id = $game->{id} // next;
      $games{$id} = $game;
    }
    return \%games;
  });
};

get '/api/clips/:username' => {username => ''} => sub ($c) {
  my $username = $c->param('username');
  return $c->render(json => {error => 'No user specified'}) unless length $username;
  $c->get_users_by_name([$username])->then(sub ($users) {
    my $user = $users->{lc $username} // die "Unknown user $username\n";
    $c->get_user_clips($user->{id})->then(sub ($response) {
      my $clips = $response->{data} // [];
      my @game_ids = uniqstr map { $_->{game_id} } @$clips;
      $c->get_games_by_id(\@game_ids)->then(sub ($games) {
        $_->{game} = $games->{$_->{game_id}}{name} for @$clips;
        $c->render(json => {clips => $clips});
      });
    });
  })->catch(sub ($error) {
    $c->render(json => {error => $error});
  });
};

get '/' => 'index';

app->start;
