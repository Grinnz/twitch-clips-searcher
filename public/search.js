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
      filter_category: "any",
      filter_clipper: "any",
      sort_by: null,
      sort_dir: null,
    }
  },
  computed: {
    clips_filtered() {
      this.current_page = 1;
      if (this.clips === null) { return []; }
      let filtered = this.clips;
      if (this.filter_category !== null && this.filter_category !== "any") {
        filtered = filtered.filter(clip => this.filter_category === clip.game_id);
      }
      if (this.filter_clipper !== null && this.filter_clipper !== "any") {
        filtered = filtered.filter(clip => this.filter_clipper === clip.creator_id);
      }
      if ((this.views_min !== null && this.views_min !== "") || (this.views_max !== null && this.views_max !== "")) {
        let min = this.views_min === "" ? null : this.views_min;
        let max = this.views_max === "" ? null : this.views_max;
        filtered = filtered.filter(clip => (min === null || clip.view_count >= min) && (max === null || clip.view_count <= max));
      }
      if (this.title_search !== null && this.title_search !== "") {
        filtered = filtered.filter(clip => (clip.title || '').toLowerCase().includes(this.title_search.toLowerCase()));
      }
      if (this.sort_by === 'title') {
        if (this.sort_dir === 'desc') {
          filtered.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
        } else {
          filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        }
      } else if (this.sort_by === 'views') {
        if (this.sort_dir === 'desc') {
          filtered.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
        } else {
          filtered.sort((a, b) => (a.view_count || 0) - (b.view_count || 0));
        }
      } else if (this.sort_by === 'category') {
        if (this.sort_dir === 'desc') {
          filtered.sort((a, b) => (b.game || '').localeCompare(a.game || ''));
        } else {
          filtered.sort((a, b) => (a.game || '').localeCompare(b.game || ''));
        }
      } else if (this.sort_by === 'clipper') {
        if (this.sort_dir === 'desc') {
          filtered.sort((a, b) => (b.creator_name || '').localeCompare(a.creator_name || ''));
        } else {
          filtered.sort((a, b) => (a.creator_name || '').localeCompare(b.creator_name || ''));
        }
      } else if (this.sort_by === 'date') {
        if (this.sort_dir === 'desc') {
          filtered.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        } else {
          filtered.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
        }
      }
      return filtered;
    },
    clips_page() {
      if (this.clips === null) { return []; }
      return this.clips_filtered.slice((this.current_page - 1) * this.page_size, this.current_page * this.page_size);
    },
    clip_categories() {
      if (this.clips === null) { return []; }
      let categories = {};
      this.clips.forEach((clip) => { let id = clip.game_id === null ? '' : clip.game_id; categories[id] = clip.game === null ? '' : clip.game; });
      return Object.keys(categories).map((game_id) => ({ id: game_id, name: categories[game_id] })).sort((a, b) => a.name.localeCompare(b.name));
    },
    clip_clippers() {
      if (this.clips === null) { return []; }
      let clippers = {};
      this.clips.forEach((clip) => { let id = clip.creator_id === null ? '' : clip.creator_id; clippers[id] = clip.creator_name === null ? '' : clip.creator_name; });
      return Object.keys(clippers).map((creator_id) => ({ id: creator_id, name: clippers[creator_id] })).sort((a, b) => a.name.localeCompare(b.name));
    },
    page_nums() {
      if (this.clips === null || this.clips_filtered.length < 1) { return []; }
      let last_page = Math.floor((this.clips_filtered.length - 1) / this.page_size) + 1;
      let pages = [];
      let page = this.current_page < 5 ? 1 : this.current_page > last_page - 5 ? last_page - 9 : this.current_page - 5;
      if (page < 1) { page = 1; }
      while ((page < this.current_page + 5 || pages.length < 10) && page <= last_page) {
        pages.push(page);
        page++;
      }
      if (pages[0] !== 1) { pages.unshift(1); }
      if (pages[pages.length - 1] !== last_page) { pages.push(last_page); }
      return pages;
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
        disabled: this.current_page >= this.page_nums[this.page_nums.length - 1],
      }
    },
  },
  methods: {
    set_sort_by(sort_key) {
      if (sort_key === this.sort_by) {
        this.sort_dir = this.sort_dir === 'desc' ? 'asc' : 'desc';
      } else {
        this.sort_by = sort_key;
        this.sort_dir = null;
      }
    },
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
      this.filter_category = "any";
      this.filter_clipper = "any";
      this.sort_by = null;
      this.sort_dir = null;
      this.clips = clips;
    },
  }
}).mount('#app');
