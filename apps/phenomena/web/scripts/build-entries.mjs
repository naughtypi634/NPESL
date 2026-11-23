// 从 Python 产出的 phenomena.json 生成 31 个入口 HTML。
//
// 章节地址必须和原来一模一样（/phenomena/01-your-stop-is-next.html），
// 所以这里是多页构建而不是单页应用：一章一个 HTML 壳，共用一个 JS 包。
// 换内容时不用手写这些文件，重跑即可。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const dataPath = join(app, 'src', 'generated', 'phenomena.json');

let data;
try {
  data = JSON.parse(readFileSync(dataPath, 'utf8'));
} catch {
  console.error(
    `找不到 ${dataPath}\n先跑：.venv\\Scripts\\python.exe -I apps\\phenomena\\source\\build.py --skip-audio`,
  );
  process.exit(1);
}

// 首屏前定主题，避免闪一下。只认浅色/深色；老的 glass 归到深色。
const BOOT =
  "<script>try{var t=localStorage.getItem('npesl-theme');" +
  "if(t==='glass')t='dark';" +
  "document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');" +
  "}catch(e){document.documentElement.setAttribute('data-theme','light');}</script>";

/** 极薄的入口壳：`.page` 是站点装配插返回链接用的锚点，`#root` 交给 React。 */
function shell({ title, page, slug }) {
  const attrs = [`data-page="${page}"`];
  if (slug) attrs.push(`data-slug="${slug}"`);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
${BOOT}
</head>
<body>
<div class="page"><div id="root" ${attrs.join(' ')}></div></div>
<script type="module" src="/src/main.tsx"></script>
</body>
</html>
`;
}

writeFileSync(
  join(app, 'index.html'),
  shell({ title: '常见发音现象(AmE)', page: 'index' }),
  'utf8',
);

for (const lesson of data.lessons) {
  writeFileSync(
    join(app, `${lesson.slug}.html`),
    shell({
      title: `${lesson.title_en} ${lesson.title_zh} · 常见发音现象`,
      page: 'chapter',
      slug: lesson.slug,
    }),
    'utf8',
  );
}

console.log(`entries: 1 目录页 + ${data.lessons.length} 章`);
