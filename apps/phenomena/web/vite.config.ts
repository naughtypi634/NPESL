import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

// 部署在 /phenomena/ 下，和原来 31 个 HTML 的地址一一对应。
const BASE = '/phenomena/';

/** 入口是 scripts/build-entries.mjs 从 phenomena.json 生成的那些 HTML。 */
function entryHtml(): Record<string, string> {
  const names = readdirSync(here).filter(
    (name) => name === 'index.html' || /^\d{2}-[a-z0-9-]+\.html$/.test(name),
  );
  return Object.fromEntries(
    names.map((name) => [name.slice(0, -'.html'.length), resolve(here, name)]),
  );
}

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': resolve(here, 'src') },
  },
  server: {
    // 开发时直接读全站的字体目录，预览和线上一致。
    fs: { allow: [resolve(here, '..', '..', '..')] },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: entryHtml() },
  },
});
