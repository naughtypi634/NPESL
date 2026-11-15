// Headless Edge check for the Business Charts page.
//
//   node tests/charts.mjs
//
// One browser, one page, always closed. Opens the built file:// page, drives
// it with real CDP mouse and key events, checks the console, and saves
// screenshots (desktop, phone, glass theme) under build/charts-shots/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { launchEdge } from '../tools/edge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(join(ROOT, 'apps/charts/index.html')).href;
const SHOTS = join(ROOT, 'build/charts-shots');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const consoleErrors = [];

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const edge = await launchEdge({ name: `edge-charts-${process.pid}`, url: 'about:blank' });
const { send, evaluate, close } = edge;

edge.onEvent((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    consoleErrors.push(`${d.text} ${d.exception?.description || ''}`);
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    consoleErrors.push(msg.params.entry.text);
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
  }
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');

async function setViewport(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile,
  });
}

async function waitFor(expression, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await evaluate(expression)) return true;
    } catch {}
    await sleep(80);
  }
  return false;
}

async function rectOf(selector) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`);
}

async function mouse(type, x, y, extra = {}) {
  const params = { type, x, y, clickCount: 1, ...extra };
  if (type !== 'mouseMoved') params.button = 'left';
  await send('Input.dispatchMouseEvent', params);
}

async function dragBy(selector, dy) {
  // Bring the target to the middle of the screen first: the sticky type bar
  // would otherwise sit on top of it after earlier scrolling.
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center' })`);
  await sleep(350);
  const r = await rectOf(selector);
  if (!r) return false;
  await mouse('mouseMoved', r.x, r.y);
  await mouse('mousePressed', r.x, r.y);
  const steps = 6;
  for (let k = 1; k <= steps; k += 1) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y + (dy * k) / steps, button: 'left', buttons: 1 });
    await sleep(15);
  }
  await mouse('mouseReleased', r.x, r.y + dy);
  await sleep(60);
  return true;
}

async function key(keyName, code, keyCode) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: keyCode });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: keyCode });
  await sleep(40);
}

const APP = 'window.NPESLCharts.app.state';

console.log('charts: load (desktop)');
await setViewport(1280, 860);
await send('Page.navigate', { url: PAGE });
check('page becomes ready', await waitFor("document.documentElement.getAttribute('data-charts-ready') === 'true'"));
check('six chart tabs', (await evaluate("document.querySelectorAll('.type-tab').length")) === 6);
check('first chart is active', (await evaluate("document.querySelector('.type-tab.is-on').id")) === 'tab-line');

const typeIds = ['line', 'bar', 'pie', 'table', 'process', 'combo'];
for (const id of typeIds) {
  await evaluate(`document.getElementById('tab-${id}').click()`);
  await sleep(120);
  const info = await evaluate(`(() => {
    const panel = document.getElementById('panel-${id}');
    const sentences = [...panel.querySelectorAll('.sentence .en')].map(n => n.textContent);
    const zh = [...panel.querySelectorAll('.sentence .zh')].map(n => n.textContent);
    const text = panel.textContent;
    return {
      visible: !panel.hidden,
      plotChildren: panel.querySelector('[data-plot]').children.length,
      marks: panel.querySelectorAll('[data-mark]').length,
      sentences: sentences.length,
      emptyZh: zh.filter(t => !t).length,
      leftoverToken: /\\{\\w+\\}/.test(text),
      countText: /\d+\s*(个|条|种|张)/.test(panel.querySelector('.figure-head').textContent + panel.querySelector('.note').textContent)
    };
  })()`);
  check(`${id}: panel renders`, info.visible && info.plotChildren > 0 && info.marks > 0, JSON.stringify(info));
  check(`${id}: sentences filled`, info.sentences >= 3 && info.emptyZh === 0, JSON.stringify(info));
  check(`${id}: no unresolved slots`, !info.leftoverToken, JSON.stringify(info));
  check(`${id}: no count text`, !info.countText);
}

console.log('charts: interactions');
await evaluate("document.getElementById('tab-line').click()");
await sleep(400);
const firstEn = () => evaluate("document.querySelector('#panel-line .sentence .en').textContent");
const beforeOrders = await evaluate(`JSON.stringify(${APP}.datasets.orders.values)`);

// Real mouse drag on the last point: raise it.
const dragged = await dragBy('#panel-line .point[data-mark="p:7"] .hit', -40);
const afterOrders = await evaluate(`JSON.stringify(${APP}.datasets.orders.values)`);
check('drag moves a line point', dragged && afterOrders !== beforeOrders,
  `${beforeOrders} -> ${afterOrders}`);
check('dirty state shows reset', await evaluate("!document.querySelector('#panel-line [data-reset]').hidden"));
const resetVisibleAfterDrag = await evaluate("!document.querySelector('#panel-line [data-reset]').hidden");
check('reset visible after edit', resetVisibleAfterDrag);

// Keyboard on a point.
await evaluate("document.querySelector('#panel-line .point[data-mark=\"p:0\"]').focus()");
const v0 = (await evaluate(`${APP}.datasets.orders.values[0]`));
await key('ArrowUp', 'ArrowUp', 38);
const v1 = (await evaluate(`${APP}.datasets.orders.values[0]`));
check('arrow key nudges a point', v1 === v0 + 1, `${v0} -> ${v1}`);

// Reset restores the original numbers.
await evaluate("document.querySelector('#panel-line [data-reset]').click()");
await sleep(60);
check('reset restores data', (await evaluate(`JSON.stringify(${APP}.datasets.orders.values)`)) === beforeOrders);
check('reset hides again', await evaluate("document.querySelector('#panel-line [data-reset]').hidden"));

// Sentence -> chart: choosing a sentence dims marks outside it.
await evaluate("document.querySelectorAll('#panel-line .sentence')[1].click()");
await sleep(40);
const dimmed = await evaluate("document.querySelectorAll('#panel-line .is-dim').length");
check('sentence click dims other marks', dimmed > 0, `dimmed=${dimmed}`);

// Chart -> sentence: hovering a mark selects its sentence.
const hoverTarget = await rectOf('#panel-line .point[data-mark="p:7"] .hit');
await mouse('mouseMoved', hoverTarget.x, hoverTarget.y);
await sleep(80);
const activeMark = await evaluate(`(() => {
  const s = ${APP}.activeSentence.line;
  const list = ${APP}.sentences.line;
  return list[s] ? list[s].marks.join(',') : '';
})()`);
check('hover selects a sentence that mentions the mark', activeMark.includes('p:7'), activeMark);

// Level switch changes the wording.
const basicFirst = await firstEn();
await evaluate("document.querySelector('#panel-line [data-level=\"advanced\"]').click()");
await sleep(60);
const advancedFirst = await firstEn();
check('advanced level rewrites sentences', basicFirst !== advancedFirst, `${basicFirst} | ${advancedFirst}`);
await evaluate("document.querySelector('#panel-line [data-level=\"basic\"]').click()");
await sleep(40);

// Bar chart: drag, and the table on the same data must follow.
await evaluate("document.getElementById('tab-bar').click()");
await sleep(400);
const barBefore = await evaluate(`${APP}.datasets.sales.series[0].values[0]`);
await dragBy('#panel-bar .col[data-mark="b:0:0"] .hit', -30);
const barAfter = await evaluate(`${APP}.datasets.sales.series[0].values[0]`);
check('bar drag updates the value', barAfter !== barBefore, `${barBefore} -> ${barAfter}`);
await evaluate("document.getElementById('tab-table').click()");
await sleep(400);
const cellValue = await evaluate("document.querySelector('#panel-table td[data-mark=\"b:0:0\"] input').value");
check('table reflects the bar edit', Number(cellValue) === barAfter, `table=${cellValue} data=${barAfter}`);

// Table edit flows back into the dataset and the bar chart.
await evaluate(`(() => {
  const input = document.querySelector('#panel-table td[data-mark="b:1:1"] input');
  input.value = '150';
  input.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(40);
check('table edit writes the dataset', (await evaluate(`${APP}.datasets.sales.series[1].values[1]`)) === 150);
check('table edit redraws the bar', (await evaluate(`document.querySelector('#panel-bar .col[data-mark="b:1:1"] .val').textContent`)) === '150');

// Pie: drag a boundary; the total stays 100 and every share stays at 3+.
await evaluate("document.getElementById('tab-pie').click()");
await sleep(400);
const pieBefore = await evaluate(`${APP}.datasets.share.parts.map(p => p.value).join(',')`);
await dragBy('#panel-pie .handle[data-mark="s:0"] .hit', -60);
const pieAfter = await evaluate(`${APP}.datasets.share.parts.map(p => p.value)`);
check('pie boundary drag changes shares', pieAfter.join(',') !== pieBefore, `${pieBefore} -> ${pieAfter.join(',')}`);
check('pie shares still total 100', pieAfter.reduce((a, b) => a + b, 0) === 100);
check('pie keeps the minimum share', pieAfter.every((v) => v >= 3));

// Process: change a step's minutes.
await evaluate("document.getElementById('tab-process').click()");
await sleep(400);
await evaluate(`(() => {
  const input = document.querySelector('#panel-process .step[data-mark="st:3"] input');
  input.value = '20';
  input.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
check('process minutes update', (await evaluate(`${APP}.datasets.steps.steps[3].minutes`)) === 20);

// Combo: drag a bar; the line stays put.
await evaluate("document.getElementById('tab-combo').click()");
await sleep(400);
const comboBefore = await evaluate(`${APP}.datasets.combo.bars.values[2]`);
await dragBy('#panel-combo .col[data-mark="bar:2"] .hit', -30);
check('combo bar drag updates', (await evaluate(`${APP}.datasets.combo.bars.values[2]`)) !== comboBefore);

// Reference dialog.
await evaluate("document.querySelector('[data-open-ref]').click()");
await sleep(60);
check('reference dialog opens', await evaluate("document.getElementById('ref').open === true"));
await evaluate("document.querySelector('[data-ref-tab=\"vocab\"]').click()");
await sleep(40);
check('vocabulary tab renders', (await evaluate("document.querySelectorAll('#ref-body .vocab').length")) > 0);
await evaluate("document.querySelector('[data-ref-tab=\"errors\"]').click()");
await sleep(40);
check('errors tab renders', (await evaluate("document.querySelectorAll('#ref-body .error').length")) > 0);
await evaluate("document.querySelector('[data-ref-close]').click()");
await sleep(40);
check('reference dialog closes', await evaluate("document.getElementById('ref').open === false"));

// Keep the edited state from leaking into the screenshots: reset everything.
for (const id of ['orders', 'sales', 'share', 'steps', 'combo']) {
  await evaluate(`window.NPESLCharts.app.reset('${id}')`);
}

console.log('charts: layout and theme');
for (const id of typeIds) {
  await evaluate(`document.getElementById('tab-${id}').click()`);
  await sleep(100);
  await setViewport(390, 844, true);
  await sleep(120);
  const phoneOverflow = await evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');
  check(`${id}: no horizontal overflow on a phone`, phoneOverflow <= 0, `overflow=${phoneOverflow}`);
  if (id === 'line' || id === 'pie') {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(join(SHOTS, `phone-${id}.png`), Buffer.from(shot.result.data, 'base64'));
  }
  await setViewport(1280, 860);
  await sleep(60);
}

await evaluate("document.getElementById('tab-line').click()");
await sleep(100);
await setViewport(1280, 860);
let shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(SHOTS, 'desktop-line.png'), Buffer.from(shot.result.data, 'base64'));

for (const id of ['table', 'process']) {
  await evaluate(`document.getElementById('tab-${id}').click()`);
  await sleep(300);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `desktop-${id}.png`), Buffer.from(shot.result.data, 'base64'));
}
await evaluate("document.documentElement.setAttribute('data-theme', 'glass')");
await evaluate("document.getElementById('tab-combo').click()");
await sleep(150);
shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(SHOTS, 'glass-combo.png'), Buffer.from(shot.result.data, 'base64'));

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));

close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall charts checks passed');
process.exit(failures.length ? 1 : 0);
