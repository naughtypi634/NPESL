import { readFile } from 'node:fs/promises';
import { extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
// apps/data-viz/web → apps/data-viz → apps → repo root
const repo = resolve(here, '../../..');
const BASE = '/charts/';
const themeCss = resolve(repo, 'apps/site/theme.css').replaceAll('\\', '/');
const themeJs = resolve(repo, 'apps/site/theme.js').replaceAll('\\', '/');
const themeBoot = `<script>try{var t=localStorage.getItem('npesl-theme');if(t==='glass')t='dark';document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}</script>`;

export default defineConfig({
  base: BASE,
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
          `${themeBoot}\n<link rel="stylesheet" href="${BASE}@fs/${themeCss}">\n<script src="${BASE}@fs/${themeJs}"></script>\n</head>`,
        );
      },
    },
    {
      // 开发服务器也提供站点图标与 Geist 字体，预览时和线上一致。
      name: 'npesl-static-dev',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = (req.url || '').split('?')[0];
          if (!url.startsWith('/fonts/') && url !== '/favicon.ico'
            && !url.startsWith('/favicon-') && url !== '/apple-touch-icon.png'
            && url !== '/npesl-icon.png') {
            return next();
          }
          readFile(resolve(repo, 'apps/site', url.slice(1)))
            .then((buf) => {
              const ext = extname(url);
              const type = ext === '.woff2' ? 'font/woff2' : ext === '.ico' ? 'image/x-icon' : 'image/png';
              res.writeHead(200, { 'content-type': type });
              res.end(buf);
            })
            .catch(() => next());
        });
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
          if (id.includes('node_modules/ztd-charts')) return 'ztd';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
