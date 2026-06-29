import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import B24UIPlugin from '@bitrix24/b24ui-nuxt/vue-plugin'
import App from './App.vue'
import './style.css'
import './app.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: []
})

createApp(App).use(router).use(B24UIPlugin).mount('#app')
