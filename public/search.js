const { createApp } = Vue

createApp({
  data() {
    return {
      username: '',
      clips: [],
      
    }
  },
  methods: {
    fetch_clips() {
      fetch('/api/clips/' + encodeURIComponent(this.username))
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Error retrieving clips: ${response.status} ${response.statusText}`);
          }
          return response.json();
        }).then((data) => {
          this.clips = data.clips;
        }).catch((error) => {
          console.log(error);
        });
    }
  }
}).mount('#app');
