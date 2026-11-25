// 数据英语表达图鉴：一次无头 Edge 跑完页面与交互巡检。
//
//   node tests/dataviz-ui.mjs
//
// 前提：先构建页面（build_all.py --only data-viz,site 或 npm --prefix
// apps/data-viz/web run build）。本脚本自己起静态服务器，把 dist 挂在
// /charts/ 下，和线上路径一致。跑完一定关浏览器。

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchEdge } from '../tools/edge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'apps/data-viz/dist');
const PREFIX = '/charts/';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer(async (req, res) => {
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (!rel.startsWith(PREFIX)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  rel = rel.slice(PREFIX.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  let buf;
  try {
    buf = await readFile(join(DIST, rel));
  } catch {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[extname(rel)] || 'application/octet-stream',
    'content-length': buf.length,
  });
  res.end(buf);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const edge = await launchEdge({ name: `edge-dataviz-${process.pid}`, url: 'about:blank' });
const { send, evaluate } = edge;

let pageErrors = [];
const addError = (message) => {
  if (/favicon\.ico/.test(message)) return;
  if (pageErrors.length < 20) pageErrors.push(message);
};
edge.onEvent((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    addError(`JS ${d.text}: ${d.exception?.description || ''}`);
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    addError(`console ${msg.params.entry.text}`);
  } else if (msg.method === 'Network.responseReceived') {
    const r = msg.params.response;
    if (r.status >= 400 && r.url.startsWith(BASE)) addError(`HTTP ${r.status} ${r.url}`);
  }
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 900, deviceScaleFactor: 1, mobile: false,
});

const waitFor = async (expression, timeout = 10000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await evaluate(expression)) return true;
    } catch {}
    await sleep(100);
  }
  return false;
};

async function gotoHash(hash) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(120);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(22)} ${detail}`);
}

// ---- 首页 ----------------------------------------------------------------

pageErrors = [];
await send('Page.navigate', { url: `${BASE}${PREFIX}` });
const homeReady = await waitFor("document.querySelectorAll('.entry').length === 9");
record('home chart types', homeReady, `${await evaluate("document.querySelectorAll('.entry').length")} type cards`);
const cardSnap = await evaluate(`(() => {
  const el = document.querySelector('.entries');
  if (!el) return null;
  const style = getComputedStyle(el);
  return {
    type: style.scrollSnapType,
    overflow: style.overflowX,
    scrollable: el.scrollWidth > el.clientWidth + 2,
  };
})()`);
record('card snapping', !!cardSnap && cardSnap.type.includes('mandatory') && cardSnap.overflow === 'auto' && cardSnap.scrollable, `${cardSnap?.type || 'none'}, ${cardSnap?.scrollable ? 'scrollable' : 'not scrollable'}`);
record('home console', pageErrors.length === 0, pageErrors.join(' | ') || 'clean');
const skip = await evaluate(`(() => {
  const before = location.hash;
  document.querySelector('.skip')?.click();
  return { before, after: location.hash, focused: document.activeElement?.id };
})()`);
record('skip stays on page', skip.before === skip.after && skip.focused === 'main', `${skip.before || '(empty)'} → ${skip.after || '(empty)'}, focus ${skip.focused}`);
const typeJump = await evaluate("(() => { const card = document.querySelector('.entry'); if (!card) return false; card.click(); return true; })()");
await waitFor("!!document.querySelector('.chart-page') && !!document.querySelector('.figure-canvas svg')", 6000);
const typeHash = await evaluate('location.hash');
record('type card opens chart', typeJump && typeHash.startsWith('#/charts/'), typeHash);

// ---- 图表目录 ------------------------------------------------------------

pageErrors = [];
await gotoHash('#/charts');
const chartsReady = await waitFor("document.querySelectorAll('.chart-card').length >= 47");
const families = await evaluate("document.querySelectorAll('.family').length");
record('chart catalog', chartsReady, `${await evaluate("document.querySelectorAll('.chart-card').length")} cards, ${families} families`);
record('catalog console', pageErrors.length === 0, pageErrors.join(' | ') || 'clean');
const bigJump = await evaluate(`(() => {
  const el = [...document.querySelectorAll('button,a')].find((item) => item.textContent.includes('看一张图'));
  if (!el) return false;
  el.click();
  return true;
})()`);
await waitFor("location.hash.startsWith('#/charts/')", 3000);
const jumpHash = await evaluate('location.hash');
record('one-click chart', bigJump && jumpHash.startsWith('#/charts/') && !jumpHash.includes('family'), jumpHash);
await gotoHash('#/no-such-page');
const missing = await evaluate("document.body.innerText.includes('这个地址没有对应的页面。')");
record('unknown route explained', missing, missing ? 'Chinese message shown' : 'no message');

// ---- 图表详情 ------------------------------------------------------------

pageErrors = [];
await gotoHash('#/charts/line');
const lineReady = await waitFor("!!document.querySelector('.chart-page') && !!document.querySelector('.figure-canvas svg')");
const lineText = await evaluate('document.body.innerText');
record('chart page', lineReady, 'line chart and lesson rendered');
const directEdit = await evaluate(`(() => ({
  hint: document.body.innerText.includes('点图上的点、柱子或色块'),
  noButton: !document.querySelector('.edit-data-button'),
}))()`);
record('edit on chart', directEdit.hint && directEdit.noButton, directEdit.noButton ? 'no extra button' : 'old button still present');
record('chart sections', ['How to read it', 'Key observations', 'How to describe it', 'Complete descriptions', 'Useful language notes'].every((s) => lineText.includes(s)), 'all five sections present');
record('no quiz prompts', !/your turn|try to describe|what can you see|which one is|can you describe|试一试|你来答|答题|答对/i.test(lineText), 'no task-style prompt');
record('demo data label', lineText.includes('Demo data · 模拟数据'), 'chart caption and footer keep the label');
record('chart console', pageErrors.length === 0, pageErrors.join(' | ') || 'clean');

// ---- 全部图表页 ----------------------------------------------------------

const chartIndex = await evaluate(
  `fetch(${JSON.stringify(`${PREFIX}data/index.json`)}).then((r) => r.json()).then((d) => d.charts.map((c) => c.id))`,
);
const badCharts = [];
for (const chartId of chartIndex) {
  pageErrors = [];
  await gotoHash(`#/charts/${chartId}`);
  const ok = await waitFor(
    "(!!document.querySelector('.figure-canvas svg') || !!document.querySelector('.figure-canvas canvas'))",
    8000,
  );
  const lesson = ok ? await evaluate(`(() => {
    const versions = [...document.querySelectorAll('.chart-learning-content .version')];
    return versions.length === 3 && versions.every((item) =>
      item.querySelector('.version-en')?.innerText.trim() && item.querySelector('.version-zh')?.innerText.trim());
  })()`) : false;
  if (!ok || pageErrors.length || !lesson) badCharts.push(`${chartId}:${ok ? '' : 'no chart'}${lesson ? '' : ' no 3 versions'}${pageErrors.length ? ` ${pageErrors[0]}` : ''}`);
}
record('all chart pages', badCharts.length === 0, badCharts.length ? badCharts.join(' | ') : `${chartIndex.length}/${chartIndex.length} rendered`);

// ---- 表达 ----------------------------------------------------------------

pageErrors = [];
await gotoHash('#/expressions');
const groupsReady = await waitFor("document.querySelectorAll('.group-card').length >= 16");
record('expression index', groupsReady, `${await evaluate("document.querySelectorAll('.group-card').length")} groups`);
await gotoHash('#/expressions/trend-up');
const groupReady = await waitFor("document.querySelectorAll('.expression').length >= 6");
const groupCount = await evaluate("document.querySelectorAll('.expression').length");
record('expression page', groupReady, `${groupCount} expressions rendered`);
const filterWorks = await evaluate(`(() => {
  const button = [...document.querySelectorAll('.filter')].find((b) => b.textContent.trim() === '学术写作');
  if (!button) return false;
  button.click();
  return true;
})()`);
await sleep(200);
const visibleAfter = await evaluate("document.querySelectorAll('.expression').length");
record('scene filter', filterWorks && visibleAfter > 0 && visibleAfter <= groupCount, `${visibleAfter} visible after Academic filter`);
record('expression console', pageErrors.length === 0, pageErrors.join(' | ') || 'clean');

// ---- 场景 ----------------------------------------------------------------

pageErrors = [];
await gotoHash('#/contexts');
const contextsReady = await waitFor("document.querySelectorAll('.context-card').length >= 7");
record('context index', contextsReady, `${await evaluate("document.querySelectorAll('.context-card').length")} contexts`);
await gotoHash('#/contexts/ielts');
const contextReady = await waitFor("!!document.querySelector('.worked') && !!document.querySelector('.worked .figure-canvas svg')");
record('context page', contextReady, 'worked example chart rendered');
const pitfallCount = await evaluate("document.querySelectorAll('.pitfalls li').length");
record('context pitfalls', pitfallCount >= 2, `${pitfallCount} pitfalls`);
record('context console', pageErrors.length === 0, pageErrors.join(' | ') || 'clean');

// ---- 主题与窄屏 ----------------------------------------------------------

for (const theme of ['dark', 'light']) {
  pageErrors = [];
  await evaluate(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)})`);
  await sleep(350);
  const figure = await evaluate("!!document.querySelector('.figure-canvas svg')");
  record(`theme ${theme}`, figure && pageErrors.length === 0, pageErrors.join(' | ') || 'chart still rendered');
}

await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 780, deviceScaleFactor: 2, mobile: true,
});
for (const [label, hash] of [['home', '#/'], ['chart', '#/charts/line'], ['expression', '#/expressions/trend-up'], ['context', '#/contexts/ielts']]) {
  await gotoHash(hash);
  await waitFor("document.readyState === 'complete'");
  await sleep(350);
  const expectFigure = label === 'chart' || label === 'context';
  const overflow = await evaluate(`(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
    figure: ${expectFigure} ? !!document.querySelector('.figure-canvas svg') : true,
  }))()`);
  record(`phone ${label}`, overflow.scroll <= overflow.inner + 2 && overflow.figure, `width ${overflow.scroll}/${overflow.inner}`);
  if (label === 'home') {
    const phoneSnap = await evaluate(`(() => {
      const el = document.querySelector('.entries');
      if (!el) return false;
      return getComputedStyle(el).scrollSnapType.includes('mandatory') && el.scrollWidth > el.clientWidth + 2;
    })()`);
    record('phone card snapping', phoneSnap, phoneSnap ? 'one card at a time' : 'not scrollable');
  }
}

const failed = results.filter((result) => !result.ok);
edge.close();
server.close();
console.log(`\n${failed.length ? 'FAILED' : 'PASSED'}  ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
