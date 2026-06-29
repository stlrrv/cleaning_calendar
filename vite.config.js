import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import bitrix24UI from '@bitrix24/b24ui-nuxt/vite'

export default defineConfig({
  plugins: [
    vue(),
    bitrix24UI({
      prefix: 'B24'
    })
  ]
})
