import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
// apps/data-viz/web → apps/data-viz → apps → repo root
const repo = resolve(here, '../../..');
const themeCss = resolve(repo, 'apps/site/theme.css').replaceAll('\\', '/');
const themeJs = resolve(repo, 'apps/site/theme.js').replaceAll('\\', '/');
const themeBoot = `<script>try{var t=localStorage.getItem('npesl-theme');document.documentElement.setAttribute('data-theme',t&&['light','dark','glass'].indexOf(t)>-1?t:'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}</script>`;

export default defineConfig({
  base: '/data-viz/',
  plugins: [
    react(),
    tailwindcss(),
    {
      // 本地开发时临时挂上全站主题；部署时由 build_cloudflare_site 注入。
      name: 'npesl-theme-dev',
      apply: 'serve',
      transformIndexHtml(html) {
        return html.replace(
          '</head>',
          `${themeBoot}\n<link rel="stylesheet" href="/@fs/${themeCss}">\n<script src="/@fs/${themeJs}"></script>\n</head>`,
        );
      },
    },
  ],
  server: {
    fs: { allow: [repo] },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) return 'echarts';
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'motion';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
