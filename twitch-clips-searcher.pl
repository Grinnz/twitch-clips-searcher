#!/usr/bin/env perl

use 5.020;
use Mojolicious::Lite -signatures;
use List::Util 1.45 'uniqstr';
use Mojo::Promise;
use Mojo::URL;
use Mojo::UserAgent;
use Time::Moment;

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

my %games_by_id;
helper get_user_clips => sub ($c, $broadcaster_id, $started_at = undef, $ended_at = undef, $cursor = undef) {
  my %params = (broadcaster_id => $broadcaster_id, first => 100);
  $params{after} = $cursor if defined $cursor;
  $params{started_at} = $started_at if defined $started_at;
  $params{ended_at} = $ended_at if defined $ended_at;
  $c->api_request(GET => 'clips', \%params)->then(sub ($response) {
    my %games_to_fetch;
    foreach my $clip (@{$response->{data} // []}) {
      next unless defined $clip->{game_id};
      if (exists $games_by_id{$clip->{game_id}}) {
        $clip->{game} = $games_by_id{$clip->{game_id}};
      } else {
        $games_to_fetch{$clip->{game_id}} = 1;
      }
    }
    if (keys %games_to_fetch) {
      return $c->get_games_by_id([keys %games_to_fetch])->then(sub ($games) {
        $games_by_id{$_} = $games->{$_}{name} for keys %$games;
        $_->{game} //= $games_by_id{$_->{game_id}} for grep {defined $_->{game_id}} @{$response->{data} // []};
        return $response;
      });
    } else {
      return Mojo::Promise->resolve($response);
    }
  })->then(sub ($response) {
    my $next_cursor = $response->{pagination}{cursor};
    if (defined $next_cursor) {
      $c->get_user_clips($broadcaster_id, $started_at, $ended_at, $next_cursor)->then(sub ($next_clips) {
        return [@{$response->{data} // []}, @$next_clips];
      });
    } else {
      return $response->{data} // [];
    }
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
  return $c->render(status => 400, json => {error => 'No user specified'}) unless length $username;
  return $c->render(status => 400, json => {error => 'Invalid username'}) unless $username =~ m/\A[a-zA-Z0-9][a-zA-Z0-9_]*\z/;
  my $start_ts = $c->req->param('start_ts');
  my $started_at = length $start_ts ? Time::Moment->from_epoch($start_ts)->to_string : undef;
  my $end_ts = $c->req->param('end_ts');
  my $ended_at = length $end_ts ? Time::Moment->from_epoch($end_ts)->to_string : undef;
  $started_at = Time::Moment->from_epoch(0)->to_string if defined $ended_at and !defined $started_at;
  $ended_at = Time::Moment->now_utc->to_string if defined $started_at and !defined $ended_at;
  $c->get_users_by_name([$username])->then(sub ($users) {
    my $user = $users->{lc $username} // die "User not found\n";
    $c->get_user_clips($user->{id}, $started_at, $ended_at)->then(sub ($clips) {
      return $c->render(json => {username => $user->{display_name}, clips => $clips});
    });
  })->catch(sub ($error) {
    chomp $error;
    $c->render(status => 500, json => {error => $error});
  });
};

get '/' => 'index';

app->start;
