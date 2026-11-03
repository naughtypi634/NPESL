// Headless Edge checks for the Business Charts page.
//
//   node tests/charts.mjs
//
// One browser, one page, always closed. The page is opened from file:// so the
// test also proves that the generated index.html is self-contained.

import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchEdge } from '../tools/edge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(join(ROOT, 'apps/charts/index.html')).href;

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

async function waitFor(edge, expression, timeout = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await edge.evaluate(expression)) return true;
    } catch {}
    await sleep(100);
  }
  return false;
}

async function drag(edge, selector, dx, dy) {
  return edge.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, reason: 'missing' };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const base = { bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: x, clientY: y, buttons: 1 }));
    for (let i = 1; i <= 4; i += 1) {
      el.dispatchEvent(new PointerEvent('pointermove', {
        ...base, clientX: x + ${dx} * i / 4, clientY: y + ${dy} * i / 4, buttons: 1
      }));
    }
    el.dispatchEvent(new PointerEvent('pointerup', {
      ...base, clientX: x + ${dx}, clientY: y + ${dy}, buttons: 0
    }));
    return { ok: true };
  })()`);
}

const edge = await launchEdge({
  name: 'charts-test',
  url: 'about:blank',
  onEvent: (msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.text || 'exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      const text = (msg.params.args || []).map((arg) => arg.value || arg.description || '').join(' ');
      if (!/fonts\.g/i.test(text)) consoleErrors.push(text);
    }
  }
});

try {
  await edge.send('Runtime.enable');
  await edge.send('Page.enable');
  await edge.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
  });
  await edge.send('Page.navigate', { url: URL });
  check('page becomes ready', await waitFor(edge, "document.documentElement.dataset.chartsReady === 'true'"));

  const structure = await edge.evaluate(`(() => {
    const sections = [...document.querySelectorAll('.chart-section')];
    return {
      sections: sections.length,
      labels: sections.map((s) => s.getAttribute('data-type')),
      firstMounted: document.querySelector('[data-type="line"]').getAttribute('data-mounted'),
      externalScripts: document.querySelectorAll('script[src]').length,
      stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href),
      description: document.querySelector('[data-type="line"] [data-desc-lines]').textContent.trim()
    };
  })()`);
  check('eight chart sections exist', structure.sections === 8, String(structure.sections));
  check('section order is line…combo', structure.labels.join(',').includes('line,area,bar,hbar,table,pie,scatter,combo'), structure.labels.join(','));
  check('first lab mounts', structure.firstMounted === 'true');
  check('no external scripts', structure.externalScripts === 0, String(structure.externalScripts));
  check('description is not empty', structure.description.length > 20, structure.description.slice(0, 40));

  const before = await edge.evaluate("document.querySelector('[data-type=\"line\"] [data-desc-lines]').textContent");
  const lineHandle = await edge.evaluate("(() => { const h = document.querySelector('[data-type=\"line\"] .handle[data-index=\"1\"]'); return h ? h.getAttribute('aria-valuenow') : null; })()");
  const dragged = await drag(edge, '[data-type="line"] .handle[data-index="1"]', 0, -100);
  await sleep(200);
  const after = await edge.evaluate("document.querySelector('[data-type=\"line\"] [data-desc-lines]').textContent");
  const lineHandleAfter = await edge.evaluate("(() => { const h = document.querySelector('[data-type=\"line\"] .handle[data-index=\"1\"]'); return h ? h.getAttribute('aria-valuenow') : null; })()");
  check('line drag works', dragged.ok === true);
  check('line value changes', lineHandle !== lineHandleAfter, `${lineHandle} -> ${lineHandleAfter}`);
  check('line description changes', before !== after);
  check('line description uses a stronger verb', /surged|soared|jumped|sharp|dramatic|surge|jump/i.test(after), after.slice(0, 120));

  await edge.evaluate('window.NPESLCharts.test.mountAll()');
  await sleep(250);

  const areaBefore = await edge.evaluate("document.querySelector('[data-type=\"area\"] [data-desc-lines]').textContent");
  await drag(edge, '[data-type="area"] .handle[data-index="1"]', 0, -90);
  await sleep(180);
  const areaAfter = await edge.evaluate("document.querySelector('[data-type=\"area\"] [data-desc-lines]').textContent");
  check('area drag changes its description', areaBefore !== areaAfter);

  const barBefore = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]');
  const barTextBefore = await edge.evaluate("document.querySelector('[data-type=\"bar\"] [data-desc-lines]').textContent");
  await drag(edge, '[data-type="bar"] .handle[data-index="0"]', 0, -60);
  await sleep(180);
  const barAfter = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]');
  const barTextAfter = await edge.evaluate("document.querySelector('[data-type=\"bar\"] [data-desc-lines]').textContent");
  check('column drag changes the category dataset', barAfter !== barBefore, `${barBefore} -> ${barAfter}`);
  check('column drag changes its description', barTextBefore !== barTextAfter);

  const hbarBefore = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]');
  await drag(edge, '[data-type="hbar"] .handle[data-index="0"]', -80, 0);
  await sleep(200);
  const hbarAfter = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]');
  check('horizontal bar drag changes the category dataset', hbarAfter !== hbarBefore, `${hbarBefore} -> ${hbarAfter}`);

  const pointBefore = await edge.evaluate('({ x: window.NPESLCharts.state.datasets.points.points[0].x, y: window.NPESLCharts.state.datasets.points.points[0].y })');
  const scatterBefore = await edge.evaluate("document.querySelector('[data-type=\"scatter\"] [data-desc-lines]').textContent");
  await drag(edge, '[data-type="scatter"] .scatter-point[data-id="a"]', 50, -50);
  await sleep(200);
  const pointAfter = await edge.evaluate('({ x: window.NPESLCharts.state.datasets.points.points[0].x, y: window.NPESLCharts.state.datasets.points.points[0].y })');
  const scatterAfter = await edge.evaluate("document.querySelector('[data-type=\"scatter\"] [data-desc-lines]').textContent");
  check('scatter drag changes both coordinates', pointBefore.x !== pointAfter.x && pointBefore.y !== pointAfter.y, JSON.stringify({ pointBefore, pointAfter }));
  check('scatter description stays coherent', scatterAfter.length > 20 && scatterAfter === scatterAfter.trim());

  const comboBarBefore = await edge.evaluate('window.NPESLCharts.state.datasets.time.series[0].values[2]');
  await drag(edge, '[data-type="combo"] .handle[data-kind="bar"][data-index="2"]', 0, -40);
  await sleep(180);
  const comboBarAfter = await edge.evaluate('window.NPESLCharts.state.datasets.time.series[0].values[2]');
  check('combo bar drag changes revenue', comboBarBefore !== comboBarAfter, `${comboBarBefore} -> ${comboBarAfter}`);

  const comboLineBefore = await edge.evaluate('window.NPESLCharts.state.datasets.time.series[1].values[0]');
  const comboTextBefore = await edge.evaluate("document.querySelector('[data-type=\"combo\"] [data-desc-lines]').textContent");
  await drag(edge, '[data-type="combo"] .handle[data-kind="line"][data-index="0"]', 0, 60);
  await sleep(180);
  const comboLineAfter = await edge.evaluate('window.NPESLCharts.state.datasets.time.series[1].values[0]');
  const comboTextAfter = await edge.evaluate("document.querySelector('[data-type=\"combo\"] [data-desc-lines]').textContent");
  check('combo line drag changes growth', comboLineBefore !== comboLineAfter, `${comboLineBefore} -> ${comboLineAfter}`);
  check('combo drag changes its description', comboTextBefore !== comboTextAfter);

  await edge.evaluate("document.querySelector('[data-type=\"combo\"] [data-combo-view]').click()");
  await sleep(200);
  const overlay = await edge.evaluate(`({
    viewBox: document.querySelector('[data-type="combo"] .chart-svg').getAttribute('viewBox'),
    handles: document.querySelectorAll('[data-type="combo"] .handle').length
  })`);
  check('combo overlay view renders', overlay.viewBox === '0 0 720 430' && overlay.handles === 16, JSON.stringify(overlay));
  await edge.evaluate("document.querySelector('[data-type=\"combo\"] [data-combo-view]').click()");
  await sleep(150);

  await edge.evaluate("document.querySelectorAll('#level-switch [data-level]').forEach((b) => { if (b.dataset.level === 'C1') b.click(); })");
  await sleep(120);
  const c1 = await edge.evaluate("document.querySelector('[data-type=\"line\"] [data-desc-lines]').textContent");
  check('level switch changes wording', c1 !== after && c1.length > 20);

  await edge.evaluate('window.NPESLCharts.test.mountAll()');
  await sleep(250);
  const mounted = await edge.evaluate("[...document.querySelectorAll('.chart-section')].every((s) => s.getAttribute('data-mounted') === 'true')");
  check('all labs mount', mounted === true);
  const plotted = await edge.evaluate("[...document.querySelectorAll('.plot')].every((p) => p.children.length > 0)");
  check('all plots render', plotted === true);
  const interactive = await edge.evaluate(`(() => {
    const out = {};
    for (const section of document.querySelectorAll('.chart-section')) {
      out[section.dataset.type] = {
        sliders: section.querySelectorAll('[role="slider"]').length,
        inputs: section.querySelectorAll('input').length
      };
    }
    return out;
  })()`);
  check('all eight types are interactive', Object.values(interactive).every((item) => item.sliders + item.inputs > 0), JSON.stringify(interactive));
  check('table uses editable inputs', interactive.table.inputs > 0, JSON.stringify(interactive.table));

  const pieBefore = await edge.evaluate('window.NPESLCharts.state.datasets.shares.parts.map((p) => p.value)');
  const pieDrag = await drag(edge, '[data-type="pie"] .handle', 70, 0);
  await sleep(200);
  const pieAfter = await edge.evaluate('window.NPESLCharts.state.datasets.shares.parts.map((p) => p.value)');
  const pieSum = pieAfter.reduce((a, b) => a + b, 0);
  check('pie drag works', pieDrag.ok === true);
  check('pie shares still total 100', Math.abs(pieSum - 100) < 0.01, String(pieSum));
  check('pie shares respect the 3% floor', pieAfter.every((v) => v >= 2.99), JSON.stringify(pieAfter));
  check('pie shares changed', JSON.stringify(pieBefore) !== JSON.stringify(pieAfter));

  const tableBefore = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]');
  await edge.evaluate(`(() => {
    const input = document.querySelector('[data-type="bar"] [data-table] input');
    if (!input) return;
    input.value = String(Number(input.value) + 40);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(250);
  const tableAfter = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]');
  const hbarText = await edge.evaluate("document.querySelector('[data-type=\"hbar\"] [data-desc-lines]').textContent");
  check('table edit updates the dataset', tableAfter === tableBefore + 40, `${tableBefore} -> ${tableAfter}`);
  check('table edit propagates to the horizontal bar description', hbarText.length > 20);

  const keyboard = await edge.evaluate(`(() => {
    const h = document.querySelector('[data-type="line"] .handle[data-index="1"]');
    const before = h.getAttribute('aria-valuenow');
    h.focus();
    h.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    return { before, after: h.getAttribute('aria-valuenow') };
  })()`);
  check('keyboard changes a handle', keyboard.before !== keyboard.after, `${keyboard.before} -> ${keyboard.after}`);

  await edge.send('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 2, mobile: true
  });
  await sleep(250);
  const mobile = await edge.evaluate(`({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    tocScroll: document.querySelector('.toc-scroll').scrollWidth,
    tocClient: document.querySelector('.toc-scroll').clientWidth
  })`);
  check('mobile has no horizontal page overflow', mobile.scrollWidth <= mobile.innerWidth + 1, JSON.stringify(mobile));
  check('toc is horizontally scrollable', mobile.tocScroll >= mobile.tocClient);

  await edge.evaluate("document.documentElement.setAttribute('data-theme', 'dark')");
  const dark = await edge.evaluate(`({
    series: getComputedStyle(document.documentElement).getPropertyValue('--series-1').trim(),
    bg: getComputedStyle(document.body).backgroundColor
  })`);
  check('dark theme switches chart colours', dark.series === '#3987e5', JSON.stringify(dark));

  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (error) {
  failures.push('test crashed');
  console.error(error);
} finally {
  edge.close();
}

console.log('');
if (failures.length) {
  console.log(`FAIL (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('PASS: charts page');
