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
      title_search: null,
      views_min: null,
      views_max: null,
      clips_filter_category: "",
      clips_filter_clipper: "",
    }
  },
  computed: {
    clips_filtered() {
      if (this.clips === null) { return []; }
      let filtered = this.clips;
      if (this.clips_filter_category !== null && this.clips_filter_category !== "") {
        filtered = filtered.filter(clip => this.clips_filter_category === clip.game);
      }
      if (this.clips_filter_clipper !== null && this.clips_filter_clipper !== "") {
        filtered = filtered.filter(clip => this.clips_filter_clipper === clip.creator_name);
      }
      if ((this.views_min !== null && this.views_min !== "") || (this.views_max !== null && this.views_max !== "")) {
        let min = this.views_min === "" ? null : this.views_min;
        let max = this.views_max === "" ? null : this.views_max;
        filtered = filtered.filter(clip => (min === null || clip.view_count >= min) && (max === null || clip.view_count <= max));
      }
      if (this.title_search !== null && this.title_search !== "") {
        filtered = filtered.filter(clip => clip.title.toLowerCase().includes(this.title_search.toLowerCase()));
      }
      return filtered;
    },
    clips_page() {
      if (this.clips === null) { return []; }
      return this.clips_filtered.slice((this.current_page - 1) * this.page_size, this.current_page * this.page_size);
    },
    clip_categories() {
      if (this.clips === null) { return []; }
      return [...new Set(this.clips.map(clip => clip.game))].sort();
    },
    clip_clippers() {
      if (this.clips === null) { return []; }
      return [...new Set(this.clips.map(clip => clip.creator_name))].sort();
    },
    page_nums() {
      if (this.clips === null) { return []; }
      return Array.from(new Array(Math.floor((this.clips_filtered.length - 1) / this.page_size) + 1), (x, i) => i + 1);
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
              this.clips_user = data.username;
              this.populate_clips(data.clips);
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
    },
    populate_clips(clips) {
      this.current_page = 1;
      this.title_search = null;
      this.views_min = null;
      this.views_max = null;
      this.clips_filter_category = "";
      this.clips_filter_clipper = "";
      this.clips = clips;
    },
  }
}).mount('#app');
