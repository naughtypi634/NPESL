// 数据图鉴：47 种图表的实时分析、编辑联动、预览与布局巡检。
//
//   node tests/dataviz-live.mjs
//
// 一次无头 Edge，跑完自动关闭。前提：先构建 dist。

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
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer(async (req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (!rel.startsWith(PREFIX)) { res.writeHead(404); res.end(); return; }
  rel = rel.slice(PREFIX.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  try {
    const buf = await readFile(join(DIST, rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const edge = await launchEdge({ name: `edge-live-${process.pid}`, url: 'about:blank' });
const { send, evaluate } = edge;
let pageErrors = [];
const addError = (message) => {
  if (/favicon\.ico/.test(message)) return;
  if (pageErrors.length < 10) pageErrors.push(message);
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

const waitFor = async (expression, timeout = 10000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await evaluate(expression)) return true;
    } catch {}
    await sleep(90);
  }
  return false;
};

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${detail}`);
}

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}${PREFIX}` });
await waitFor("document.querySelectorAll('.entry').length === 3");
await evaluate("location.hash = '#/charts'");
await waitFor("document.querySelectorAll('.chart-card').length === 47");

// ---- 总览预览 --------------------------------------------------------------

const previewCount = await evaluate(
  "document.querySelectorAll('.chart-card-preview img').length",
);
record('preview images', previewCount === 47, `${previewCount}/47 cards have an image`);

await evaluate(`(() => {
  for (const img of document.querySelectorAll('.chart-card-preview img')) img.loading = 'eager';
  window.scrollTo(0, document.body.scrollHeight);
})()`);
await sleep(1200);
await evaluate('window.scrollTo(0, 0)');
await sleep(400);
const loaded = await evaluate(
  "[...document.querySelectorAll('.chart-card-preview img')].filter((img) => img.complete && img.naturalWidth > 0).length",
);
record('preview loaded', loaded === 47, `${loaded}/47 images decoded`);

const ids = await evaluate(
  "fetch('/charts/data/index.json').then((r) => r.json()).then((d) => d.charts.map((c) => c.id))",
);
record('chart ids', ids.length === 47, `${ids.length} charts`);

// ---- 47 种图表的实时分析 + 编辑联动 ---------------------------------------

const focusScript = `(() => {
  const inputs = [...document.querySelectorAll('.editor-table td.is-metric input.editor-cell-input')];
  const input = inputs[0] || document.querySelector('.editor-cell-input');
  if (!input) return null;
  input.focus();
  return { before: input.value };
})()`;

const liveFailures = [];
for (const chartId of ids) {
  pageErrors = [];
  await evaluate(`location.hash = '#/charts/${chartId}'`);
  const ready = await waitFor(
    `location.hash === '#/charts/${chartId}' && document.querySelectorAll('.live-english .live-stat').length >= 2`,
    8000,
  );
  const fallback = await evaluate("document.body.innerText.includes('暂时无法生成实时分析')");
  const liveText = await evaluate("document.querySelector('.live-english')?.innerText || ''");
  if (!ready || fallback || liveText.length < 40) {
    liveFailures.push(`${chartId}: ${fallback ? 'fallback' : 'no live stats'}`);
    continue;
  }

  const chartBefore = await evaluate("document.querySelector('.figure-canvas svg')?.outerHTML || document.querySelector('.figure-canvas canvas')?.toDataURL?.() || ''");
  const editOpen = await evaluate("(() => { document.querySelector('.edit-data-button')?.click(); return true; })()");
  const editorReady = await waitFor("!!document.querySelector('.data-editor') && document.querySelectorAll('.editor-cell-input').length > 0", 5000);
  if (!editOpen || !editorReady) {
    liveFailures.push(`${chartId}: editor did not open`);
    continue;
  }
  const editorBefore = await evaluate("document.querySelector('.data-editor')?.innerText || ''");
  const changed = await evaluate(focusScript);
  if (!changed) {
    liveFailures.push(`${chartId}: no numeric cell`);
    continue;
  }
  const numeric = Number(changed.before);
  const next = Number.isFinite(numeric) ? numeric + Math.max(1, Math.round(Math.abs(numeric) * 0.5)) : 1;
  await send('Input.insertText', { text: String(next) });
  await sleep(140);
  const typed = await evaluate("document.querySelector('.editor-table td.is-metric input.editor-cell-input')?.value || ''");
  if (typed !== String(next)) liveFailures.push(`${chartId}: typing did not replace the old number (${typed})`);
  await evaluate('document.activeElement?.blur()');
  await sleep(450);
  const editorAfter = await evaluate("document.querySelector('.data-editor')?.innerText || ''");
  const chartAfter = await evaluate("document.querySelector('.figure-canvas svg')?.outerHTML || document.querySelector('.figure-canvas canvas')?.toDataURL?.() || ''");
  const chinese = await evaluate("document.querySelector('.editor-live-zh')?.innerText || ''");
  if (editorAfter === editorBefore) liveFailures.push(`${chartId}: English/stats did not change`);
  // barRace 只展示最后一帧；改第一格（2024-Q1）不会改变最后一帧的SVG，
  // 但上面的实时分析已经验证它跟着数字变了，所以不对这张图断言画面变化。
  if (chartAfter === chartBefore && chartId !== 'barRace') liveFailures.push(`${chartId}: chart did not change`);
  if (!chinese.trim()) liveFailures.push(`${chartId}: missing Chinese`);

  await evaluate(`(() => {
    const reset = [...document.querySelectorAll('.editor-head-actions .editor-reset')]
      .find((button) => button.textContent.trim() === '全部恢复原来的数字');
    reset?.click();
  })()`);
  await sleep(350);
  const resetStatus = await evaluate("document.querySelector('.editor-status')?.innerText || ''");
  const editorReset = await evaluate("document.querySelector('.data-editor')?.innerText || ''");
  if (!resetStatus.includes('原始数据') || editorReset !== editorBefore) {
    liveFailures.push(`${chartId}: reset did not restore`);
  }
  if (pageErrors.length) liveFailures.push(`${chartId}: ${pageErrors[0]}`);

  await evaluate("document.querySelector('.edit-data-button')?.click()");
  await sleep(120);
}

record(
  '47 chart edit loops',
  liveFailures.length === 0,
  liveFailures.length ? liveFailures.slice(0, 6).join(' | ') : 'all charts recomputed and reset',
);

// ---- 撤销与主题预览 --------------------------------------------------------

await evaluate("location.hash = '#/charts/line'");
await waitFor("document.querySelector('.chart-head h1')?.textContent.trim() === 'Line chart'", 5000);
await evaluate("document.querySelector('.edit-data-button')?.click()");
await waitFor("!!document.querySelector('.data-editor')");
await evaluate("(() => { const input = document.querySelector('.editor-table td.is-metric input'); input.focus(); })()");
await send('Input.insertText', { text: '777' });
await sleep(140);
await evaluate('document.activeElement?.blur()');
await sleep(400);
const editedStatus = await evaluate("document.querySelector('.editor-status')?.innerText || ''");
await evaluate(`(() => {
  const undo = [...document.querySelectorAll('.editor-head-actions .editor-reset')]
    .find((button) => button.textContent.trim() === '撤销刚才那一步');
  undo?.click();
})()`);
await sleep(350);
const undoStatus = await evaluate("document.querySelector('.editor-status')?.innerText || ''");
record('undo restores data', editedStatus.includes('已改动') && undoStatus.includes('原始数据'), `${editedStatus} → ${undoStatus}`);
await evaluate("(() => { const input = document.querySelector('.editor-table td.is-metric input.editor-cell-input'); input.focus(); })()");
await send('Input.insertText', { text: 'abc' });
await sleep(200);
const badInput = await evaluate(`(() => ({
  message: document.querySelector('.editor-error')?.innerText || '',
  invalid: document.activeElement?.getAttribute('aria-invalid') === 'true',
}))()`);
record('bad input explained', badInput.message.includes('这里要填数字') && badInput.invalid, badInput.message || 'no message');
await evaluate('document.activeElement?.blur()');
await sleep(200);
await evaluate("document.querySelector('.edit-data-button')?.click()");

await evaluate("location.hash = '#/charts'");
await waitFor("document.querySelectorAll('.chart-card-preview img').length === 47");
await evaluate("document.documentElement.setAttribute('data-theme', 'dark')");
await sleep(300);
const darkSrc = await evaluate("document.querySelector('.chart-card-preview img')?.getAttribute('src') || ''");
await evaluate("document.documentElement.setAttribute('data-theme', 'light')");
await sleep(300);
const lightSrc = await evaluate("document.querySelector('.chart-card-preview img')?.getAttribute('src') || ''");
record('theme-aware previews', darkSrc.includes('-dark.svg') && lightSrc.includes('-light.svg'), `${darkSrc.split('/').pop()} / ${lightSrc.split('/').pop()}`);

// ---- 布局与导航 ------------------------------------------------------------

await evaluate("location.hash = '#/charts/line'");
await waitFor("document.querySelector('.chart-head h1')?.textContent.trim() === 'Line chart'", 5000);
await waitFor("!!document.querySelector('.chart-learning-layout') && !!document.querySelector('.figure-canvas svg')");

const layout = await evaluate(`(() => {
  const grid = getComputedStyle(document.querySelector('.chart-learning-layout'));
  const workspace = getComputedStyle(document.querySelector('.chart-workspace'));
  const ids = ['read', 'expressions', 'versions', 'live-english', 'observations', 'notes', 'related'];
  const tops = ids.map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity);
  return {
    columns: grid.gridTemplateColumns,
    position: workspace.position,
    ordered: tops.every((top, index) => index === 0 || top > tops[index - 1]),
  };
})()`);
record('desktop two columns', layout.columns.split(' ').length === 2, layout.columns);
record('sticky chart', layout.position === 'sticky', layout.position);
record('content order', layout.ordered, 'read → expressions → versions → live → notes');

await evaluate("document.querySelector('.edit-data-button')?.click()");
await waitFor("!!document.querySelector('.data-editor')");
const editingVersions = await evaluate("document.querySelectorAll('.chart-learning-content .version').length");
record('versions stay while editing', editingVersions === 3, `${editingVersions} versions with editor open`);
await evaluate("document.querySelector('.edit-data-button')?.click()");

// ---- 手机宽度 --------------------------------------------------------------

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await evaluate("location.hash = '#/charts/line'");
await sleep(500);
await evaluate("window.scrollTo(0, 0)");
const mobile = await evaluate(`(() => {
  const grid = getComputedStyle(document.querySelector('.chart-learning-layout'));
  return {
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
    columns: grid.gridTemplateColumns,
  };
})()`);
record('phone layout', mobile.scroll <= mobile.inner + 2 && mobile.columns.split(' ').length === 1, `${mobile.scroll}/${mobile.inner} · ${mobile.columns}`);

await evaluate("document.querySelector('.edit-data-button')?.click()");
await waitFor("!!document.querySelector('.data-editor')");
await sleep(300);
const phoneEditor = await evaluate(`(() => ({
  scroll: document.documentElement.scrollWidth,
  inner: window.innerWidth,
  table: !!document.querySelector('.editor-table'),
  chart: !!document.querySelector('.figure-canvas svg'),
  versions: document.querySelectorAll('.chart-learning-content .version').length,
}))()`);
record('phone editor', phoneEditor.scroll <= phoneEditor.inner + 2 && phoneEditor.table && phoneEditor.chart && phoneEditor.versions === 3, `${phoneEditor.scroll}/${phoneEditor.inner} · ${phoneEditor.versions} versions`);

const failed = results.filter((result) => !result.ok);
edge.close();
server.close();
console.log(`\n${failed.length ? 'FAILED' : 'PASSED'}  ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);