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

async function selectType(edge, id) {
  await edge.evaluate(`document.querySelector('#tab-${id}').click()`);
  const ready = await waitFor(edge, `(() => {
    const panel = document.querySelector('#chart-${id}');
    return panel && !panel.hidden && panel.dataset.mounted === 'true';
  })()`);
  check(`tab ${id} activates its panel`, ready === true);
  await sleep(120);
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
    const panels = [...document.querySelectorAll('.chart-panel')];
    const tabs = [...document.querySelectorAll('#type-buttons [role="tab"]')];
    const visible = panels.filter((panel) => !panel.hidden);
    return {
      panels: panels.length,
      labels: panels.map((panel) => panel.dataset.type),
      tabs: tabs.length,
      tabLabels: tabs.map((tab) => tab.textContent.trim()),
      selected: tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').map((tab) => tab.textContent.trim()),
      visible: visible.map((panel) => panel.dataset.type),
      firstMounted: document.querySelector('[data-type="line"]').getAttribute('data-mounted'),
      externalScripts: document.querySelectorAll('script[src]').length,
      description: document.querySelector('[data-type="line"] [data-desc-lines]').textContent.trim(),
      hero: !!document.querySelector('.hero'),
      footer: !!document.querySelector('.footer'),
      standaloneVocab: !!document.querySelector('#vocab'),
      standaloneGrammar: !!document.querySelector('#grammar'),
      lineVocab: document.querySelectorAll('#chart-line [data-vocab] .vocab-card').length,
      lineGrammar: document.querySelectorAll('#chart-line [data-grammar] .grammar-card').length,
      lineConverter: !!document.querySelector('#chart-line [data-converter]'),
      hbarConverter: !!document.querySelector('#chart-hbar [data-converter]')
    };
  })()`);
  check('six chart panels exist', structure.panels === 6, String(structure.panels));
  check('only chart types remain', structure.labels.join(',') === 'line,area,bar,hbar,table,pie', structure.labels.join(','));
  check('six type tabs exist', structure.tabs === 6, String(structure.tabs));
  check('tabs carry no sequence numbers', structure.tabLabels.every((label) => !/^\\d/.test(label)), structure.tabLabels.join(','));
  check('one tab is selected', structure.selected.length === 1, JSON.stringify(structure.selected));
  check('only the selected panel is visible', structure.visible.length === 1 && structure.visible[0] === 'line', JSON.stringify(structure.visible));
  check('first lab mounts', structure.firstMounted === 'true');
  check('no external scripts', structure.externalScripts === 0, String(structure.externalScripts));
  check('description is not empty', structure.description.length > 20, structure.description.slice(0, 40));
  check('intro meta content is gone', structure.hero === false && structure.footer === false);
  check('vocabulary is not a standalone section', structure.standaloneVocab === false);
  check('grammar is not a standalone section', structure.standaloneGrammar === false);
  check('line panel carries vocabulary', structure.lineVocab > 0, String(structure.lineVocab));
  check('line panel carries grammar', structure.lineGrammar > 0, String(structure.lineGrammar));
  check('dynamic types carry the converter', structure.lineConverter === true);
  check('static types skip the converter', structure.hbarConverter === false);

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

  await selectType(edge, 'area');
  const areaBefore = await edge.evaluate("document.querySelector('[data-type=\"area\"] [data-desc-lines]').textContent");
  await drag(edge, '[data-type="area"] .handle[data-index="1"]', 0, -90);
  await sleep(180);
  const areaAfter = await edge.evaluate("document.querySelector('[data-type=\"area\"] [data-desc-lines]').textContent");
  check('area drag changes its description', areaBefore !== areaAfter);

  await selectType(edge, 'bar');
  const barBefore = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]');
  const barTextBefore = await edge.evaluate("document.querySelector('[data-type=\"bar\"] [data-desc-lines]').textContent");
  await drag(edge, '[data-type="bar"] .handle[data-index="0"]', 0, -60);
  await sleep(180);
  const barAfter = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]');
  const barTextAfter = await edge.evaluate("document.querySelector('[data-type=\"bar\"] [data-desc-lines]').textContent");
  check('column drag changes the category dataset', barAfter !== barBefore, `${barBefore} -> ${barAfter}`);
  check('column drag changes its description', barTextBefore !== barTextAfter);

  await selectType(edge, 'hbar');
  const hbarBefore = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]');
  await drag(edge, '[data-type="hbar"] .handle[data-index="0"]', -80, 0);
  await sleep(200);
  const hbarAfter = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]');
  check('horizontal bar drag changes the category dataset', hbarAfter !== hbarBefore, `${hbarBefore} -> ${hbarAfter}`);

  await selectType(edge, 'table');
  const tableBefore = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]');
  await edge.evaluate(`(() => {
    const input = document.querySelector('[data-type="table"] [data-plot] input');
    if (!input) return;
    input.value = String(Number(input.value) + 40);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(250);
  const tableAfter = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]');
  check('table edit updates the dataset', tableAfter === tableBefore + 40, `${tableBefore} -> ${tableAfter}`);

  await selectType(edge, 'pie');
  const pieBefore = await edge.evaluate('window.NPESLCharts.state.datasets.shares.parts.map((p) => p.value)');
  const pieDrag = await drag(edge, '[data-type="pie"] .handle', 70, 0);
  await sleep(200);
  const pieAfter = await edge.evaluate('window.NPESLCharts.state.datasets.shares.parts.map((p) => p.value)');
  const pieSum = pieAfter.reduce((a, b) => a + b, 0);
  check('pie drag works', pieDrag.ok === true);
  check('pie shares still total 100', Math.abs(pieSum - 100) < 0.01, String(pieSum));
  check('pie shares respect the 3% floor', pieAfter.every((v) => v >= 2.99), JSON.stringify(pieAfter));
  check('pie shares changed', JSON.stringify(pieBefore) !== JSON.stringify(pieAfter));

  await selectType(edge, 'line');
  await edge.evaluate("document.querySelector('#tab-line').focus(); document.querySelector('#tab-line').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))");
  await sleep(150);
  const keyboardTab = await edge.evaluate(`({
    selected: document.querySelector('[role="tab"][aria-selected="true"]').id,
    visible: [...document.querySelectorAll('.chart-panel')].filter((panel) => !panel.hidden).map((panel) => panel.dataset.type)
  })`);
  check('arrow keys move between tabs', keyboardTab.selected === 'tab-area' && keyboardTab.visible.join(',') === 'area', JSON.stringify(keyboardTab));

  await selectType(edge, 'line');
  await edge.evaluate("document.querySelectorAll('#level-switch [data-level]').forEach((b) => { if (b.dataset.level === 'C1') b.click(); })");
  await sleep(150);
  const c1 = await edge.evaluate("document.querySelector('[data-type=\"line\"] [data-desc-lines]').textContent");
  check('level switch changes wording', c1 !== after && c1.length > 20);
  const vocabularyAfterLevel = await edge.evaluate("document.querySelectorAll('#chart-line [data-vocab] .vocab-card').length");
  check('vocabulary follows the level switch', vocabularyAfterLevel > 0, String(vocabularyAfterLevel));

  await edge.send('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 2, mobile: true
  });
  await sleep(250);
  const mobile = await edge.evaluate(`({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    switchScroll: document.querySelector('.type-switch-scroll').scrollWidth,
    switchClient: document.querySelector('.type-switch-scroll').clientWidth
  })`);
  check('mobile has no horizontal page overflow', mobile.scrollWidth <= mobile.innerWidth + 1, JSON.stringify(mobile));
  check('type tabs scroll horizontally on narrow screens', mobile.switchScroll > mobile.switchClient, JSON.stringify(mobile));

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
