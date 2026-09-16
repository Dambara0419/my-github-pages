// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

// https://astro.build/config
export default defineConfig({
  site: 'https://dambara0419.github.io',
  base: '/my-github-pages',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
})
