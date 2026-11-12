// Charts state-machine regression test.
//
// Drives the built page with real CDP mouse events (not synthetic DOM events),
// so pointer capture and the click-vs-drag threshold are exercised the same way
// a person would. Uses the project's single-Edge launcher.
//
//   node tests/charts-state.mjs
//
// Exit code 0 = every transition stayed legal and observable.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { launchEdge } from '../tools/edge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = pathToFileURL(join(ROOT, 'apps/charts/index.html')).href;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = await launchEdge({ name: `edge-charts-${process.pid}`, url: 'about:blank' });
const { send, evaluate, close } = edge;

const errors = [];
edge.onEvent((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.text + ': '
      + (msg.params.exceptionDetails.exception?.description || ''));
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push(msg.params.entry.text);
  }
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');

async function waitFor(expression, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await evaluate(expression)) return true;
    } catch {}
    await sleep(80);
  }
  return false;
}

async function mouse(type, x, y, extra = {}) {
  const params = { type, x, y, clickCount: 1, ...extra };
  if (type !== 'mouseMoved') params.button = extra.button || 'left';
  await send('Input.dispatchMouseEvent', params);
}

async function clickAt(x, y) {
  await mouse('mousePressed', x, y);
  await mouse('mouseReleased', x, y);
}

async function centerOf(selector) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
}

async function activateType(predicate) {
  const id = await evaluate(`(() => {
    const types = NPESLCharts.state.data.types.sections;
    const t = types.find(${predicate});
    return t ? t.id : null;
  })()`);
  if (!id) return null;
  await evaluate(`document.getElementById('tab-' + ${JSON.stringify(id)}).click()`);
  // The panel entrance animation moves the chart for 620ms; waiting for it
  // keeps the measured pointer targets stable.
  await waitFor(`!document.getElementById('chart-' + ${JSON.stringify(id)}).classList.contains('is-entering')`, 2000);
  await sleep(80);
  return id;
}

// ------------------------------------------------------------------ boot

await send('Page.navigate', { url: PAGE });
const ready = await waitFor("document.documentElement.getAttribute('data-charts-ready') === 'true'");
check('boot', ready, ready ? 'data-charts-ready' : 'page never became ready');
if (!ready) {
  console.log(`FAIL  boot\n${errors.join('\n')}`);
  close();
  process.exit(1);
}

let snap = await evaluate('NPESLCharts.test.snapshot()');
const firstType = snap.activeType;
check('initial tab mounted', snap.labs[firstType]?.mountState === 'mounted',
  `${firstType}=${snap.labs[firstType]?.mountState}`);
check('inactive labs unmounted',
  Object.keys(snap.labs).filter((id) => id !== firstType)
    .every((id) => snap.labs[id].mountState === 'unmounted'),
  'lazy mount');

// ------------------------------------------------------- tab activation

const barId = await activateType("(t) => t.renderer === 'bar'");
snap = await evaluate('NPESLCharts.test.snapshot()');
check('tab activates and mounts', snap.activeType === barId && snap.labs[barId].mountState === 'mounted',
  `active=${snap.activeType} state=${snap.labs[barId]?.mountState}`);

// Re-clicking the active tab must not remount or reset the chart.
const before = await evaluate(`NPESLCharts.test.labs[${JSON.stringify(barId)}].section.getAttribute('data-mount-state')`);
await evaluate(`document.getElementById('tab-' + ${JSON.stringify(barId)}).click()`);
await sleep(80);
const after = await evaluate(`NPESLCharts.test.labs[${JSON.stringify(barId)}].section.getAttribute('data-mount-state')`);
check('active tab re-click is a no-op', before === 'mounted' && after === 'mounted', `${before} -> ${after}`);

// --------------------------------------------------------------- drag

const lineId = await activateType("(t) => t.renderer === 'line'");
await sleep(200);
const handlePoint = await centerOf(`#chart-${lineId} .handle`);
const original = await evaluate(`(() => {
  const lab = NPESLCharts.test.labs[${JSON.stringify(lineId)}];
  return NPESLCharts.state.datasets[lab.key].series[0].values[0];
})()`);
await mouse('mousePressed', handlePoint.x, handlePoint.y, { buttons: 1 });
await mouse('mouseMoved', handlePoint.x, handlePoint.y - 40, { buttons: 1 });
await mouse('mouseReleased', handlePoint.x, handlePoint.y - 40, { buttons: 0 });
await sleep(120);
const dragged = await evaluate(`(() => {
  const lab = NPESLCharts.test.labs[${JSON.stringify(lineId)}];
  return {
    value: NPESLCharts.state.datasets[lab.key].series[0].values[0],
    phase: document.querySelector('#chart-${lineId} .handle').getAttribute('data-phase')
  };
})()`);
check('drag commits a new value', dragged.value > original, `${original} -> ${dragged.value}`);
check('drag returns to idle', dragged.phase === 'idle', `phase=${dragged.phase}`);

// ------------------------------------------------------ click to edit

// The handle moved with the drag, so take its current position.
const tapPoint = await centerOf(`#chart-${lineId} .handle`);
await clickAt(tapPoint.x, tapPoint.y);
await sleep(80);
const editorOpen = await evaluate(`document.querySelector('#chart-${lineId} .plot').getAttribute('data-editor')`);
check('tap opens the numeric editor', editorOpen === 'open', `data-editor=${editorOpen}`);
await evaluate(`(() => {
  const input = document.querySelector('#chart-${lineId} .value-editor-input');
  if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
})()`);
await sleep(80);
const editorClosed = await evaluate(`document.querySelector('#chart-${lineId} .plot').getAttribute('data-editor')`);
check('Escape closes the editor', editorClosed === 'closed', `data-editor=${editorClosed}`);

// ------------------------------------------------------------- pie drag

const pieId = await activateType("(t) => t.renderer === 'pie'");
await sleep(200);
const piePoint = await centerOf(`#chart-${pieId} .pie-handle .dot`);
const pieBefore = await evaluate(`(() => {
  const lab = NPESLCharts.test.labs[${JSON.stringify(pieId)}];
  return lab.dataset.parts.map((p) => p.value);
})()`);
await mouse('mousePressed', piePoint.x, piePoint.y, { buttons: 1 });
await mouse('mouseMoved', piePoint.x + 28, piePoint.y + 18, { buttons: 1 });
await mouse('mouseReleased', piePoint.x + 28, piePoint.y + 18, { buttons: 0 });
await sleep(120);
const pieAfter = await evaluate(`(() => {
  const lab = NPESLCharts.test.labs[${JSON.stringify(pieId)}];
  return {
    values: lab.dataset.parts.map((p) => p.value),
    phase: document.querySelector('#chart-${pieId} .pie-handle').getAttribute('data-phase')
  };
})()`);
check('pie drag changes the split',
  pieAfter.values.some((v, i) => Math.abs(v - pieBefore[i]) > 0.01),
  `${pieBefore.map((v) => v.toFixed(1))} -> ${pieAfter.values.map((v) => v.toFixed(1))}`);
check('pie drag returns to idle', pieAfter.phase === 'idle', `phase=${pieAfter.phase}`);

// ------------------------------------------------ process step selection

const processId = await activateType("(t) => t.renderer === 'process'");
await sleep(150);
await evaluate(`document.querySelector('#chart-${processId} .process-step').click()`);
await sleep(80);
const stepBefore = await evaluate(`(() => {
  const lab = NPESLCharts.test.labs[${JSON.stringify(processId)}];
  const node = document.querySelector('#chart-${processId} .process-step');
  return { step: lab.processState.activeStep, pressed: node.getAttribute('aria-pressed') };
})()`);
check('process step selects', !!stepBefore.step && stepBefore.pressed === 'true',
  `step=${stepBefore.step} pressed=${stepBefore.pressed}`);
await evaluate(`document.querySelector('#chart-${processId} [data-value="passive"]').click()`);
await sleep(120);
const stepAfter = await evaluate(`(() => {
  const lab = NPESLCharts.test.labs[${JSON.stringify(processId)}];
  const node = document.querySelector('#chart-${processId} .process-step');
  return { step: lab.processState.activeStep, pressed: node.getAttribute('aria-pressed') };
})()`);
check('step survives a voice re-render', stepAfter.step === stepBefore.step && stepAfter.pressed === 'true',
  `step=${stepAfter.step} pressed=${stepAfter.pressed}`);

// --------------------------------------------------------- table scroll

const tableId = await activateType("(t) => t.renderer === 'table'");
await sleep(200);
const table = await evaluate(`(() => {
  const shell = document.querySelector('#chart-${tableId} .table-scroll-shell');
  const scroll = shell && shell.querySelector('.table-scroll');
  if (!scroll) return null;
  scroll.scrollLeft = 99999;
  scroll.dispatchEvent(new Event('scroll'));
  return {
    overflow: shell.getAttribute('data-overflow'),
    scroll: shell.getAttribute('data-scroll')
  };
})()`);
check('table overflow state is explicit',
  table && table.overflow != null && table.scroll != null,
  table ? `overflow=${table.overflow} scroll=${table.scroll}` : 'no table');

// --------------------------------------------------------- final state

snap = await evaluate('NPESLCharts.test.snapshot()');
check('snapshot is serializable', JSON.stringify(snap).length > 0, `active=${snap.activeType}`);
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' ; ') || 'clean');

close();

for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(32)} ${r.detail || ''}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
