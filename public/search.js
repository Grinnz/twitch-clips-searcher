'use strict';

const { createApp } = Vue

createApp({
  data() {
    return {
      username: null,
      start_date: null,
      end_date: null,
      search_error: null,
      fetching_clips: false,
      page_size: 100,
      clips: null,
      current_page: 1,
      clips_user: null,
    }
  },
  computed: {
    clips_page() {
      if (this.clips === null) { return []; }
      return this.clips.slice((this.current_page - 1) * this.page_size, this.current_page * this.page_size);
    },
    page_nums() {
      if (this.clips === null) { return []; }
      return Array.from(new Array(Math.floor((this.clips.length - 1) / this.page_size) + 1), (x, i) => i + 1);
    },
    pagination_prev_class() {
      return {
        'page-link': true,
        disabled: this.current_page <= 1,
      }
    },
    pagination_next_class() {
      return {
        'page-link': true,
        disabled: this.current_page >= this.page_nums.length,
      }
    },
  },
  methods: {
    fetch_clips() {
      this.search_error = null;
      let url_params = new URLSearchParams();
      if (this.start_date !== null && this.start_date !== '') {
        let start = Date.parse(this.start_date);
        if (Number.isNaN(start)) {
          this.search_error = 'Invalid start date';
          return;
        } else {
          url_params.append('start_ts', start / 1000);
        }
      }
      if (this.end_date !== null && this.end_date !== '') {
        let end = Date.parse(this.end_date);
        if (Number.isNaN(end)) {
          this.search_error = 'Invalid end date';
          return;
        } else {
          url_params.append('end_ts', end / 1000);
        }
      }
      if (this.username === null) { this.username = ''; }
      this.fetching_clips = true;
      fetch('/api/clips/' + encodeURIComponent(this.username) + '?' + url_params.toString())
        .then((response) => {
          if (response.ok) {
            return response.json().then((data) => {
              this.current_page = 1;
              this.clips = data.clips;
              this.clips_user = data.username;
            });
          } else {
            return response.json().then((data) => {
              this.search_error = data.error;
            }).catch((error) => {
              this.search_error = response.status + ' ' + response.statusText;
            });
          }
          return response.json();
        }).catch((error) => {
          this.search_error = 'Internal error';
          console.log(error);
        }).finally(() => { this.fetching_clips = false; });
    }
  }
}).mount('#app');
