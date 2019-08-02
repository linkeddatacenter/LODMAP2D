import Vue from 'vue'
import App from './App.vue'
import Error from './views/errors/500.vue'
import router from './router'
import store from './store'
import vuetify from './plugins/vuetify';
import { bgoStore, fetcher, ns } from './models/bgo.js';
try {

  fetcher.load("http://localhost:8080/sample.ttl").then(

    response => {
      new Vue({
        router,
        store,
        vuetify,
        render: h => h(App)
      }).$mount('#app')
    },

    error => {
      new Vue({
        vuetify,
        render: h => h(Error)
      }).$mount('#app')
    }
  ).catch(err=>{
    console.log("errore")
  })
  ;

} catch (error) {

  new Vue({
    vuetify,
    render: h => h(Error)
  }).$mount('#app')

}



