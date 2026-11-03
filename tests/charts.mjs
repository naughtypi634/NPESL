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
      levelButtons: [...document.querySelectorAll('#level-switch button')].map((button) => button.textContent.trim()),
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
  check('only two difficulty levels remain', structure.levelButtons.join(',') === '基础,进阶', structure.levelButtons.join(','));
  check('one tab is selected', structure.selected.length === 1, JSON.stringify(structure.selected));
  check('only the selected panel is visible', structure.visible.length === 1 && structure.visible[0] === 'line', JSON.stringify(structure.visible));
  check('first lab mounts', structure.firstMounted === 'true');
  check('no external scripts', structure.externalScripts === 0, String(structure.externalScripts));
  check('description is not empty', structure.description.length > 20, structure.description.slice(0, 40));

  const shell = await edge.evaluate(`(() => {
    const head = document.querySelector('.head-inner');
    const page = document.querySelector('.page');
    const grid = document.querySelector('#chart-line .panel-grid');
    const figure = document.querySelector('#chart-line .panel-figure');
    const reading = document.querySelector('#chart-line .panel-reading');
    return {
      headMax: getComputedStyle(head).maxWidth,
      pageMax: getComputedStyle(page).maxWidth,
      gridDisplay: getComputedStyle(grid).display,
      figureRect: figure.getBoundingClientRect().toJSON(),
      readingRect: reading.getBoundingClientRect().toJSON(),
      controls: !!document.querySelector('[data-chart-controls]'),
      replay: !!document.querySelector('#chart-line [data-replay]'),
      replayLabel: document.querySelector('#chart-line [data-replay]')?.getAttribute('aria-label')
    };
  })()`);
  check('header and page widths align', shell.headMax === shell.pageMax, JSON.stringify({ head: shell.headMax, page: shell.pageMax }));
  check('desktop uses a two-column lab grid', shell.gridDisplay === 'grid' && shell.readingRect.left >= shell.figureRect.right - 1, JSON.stringify({ grid: shell.gridDisplay, figure: shell.figureRect.right, reading: shell.readingRect.left }));
  check('empty toolbar span is gone', shell.controls === false);
  check('replay control is present and labeled', shell.replay === true && shell.replayLabel === '重播动画');

  const tip = await edge.evaluate(`(() => {
    const handle = document.querySelector('#chart-line .handle[data-index="1"]');
    handle.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
    const node = document.querySelector('#chart-line .chart-tip');
    return node ? { visible: node.dataset.visible, text: node.textContent } : null;
  })()`);
  check('hovering a point shows its value tooltip', tip && tip.visible === 'true' && /Q2 2025/.test(tip.text) && /RMB/.test(tip.text), JSON.stringify(tip));

  const lineLabels = await edge.evaluate(`(() => {
    const labels = [...document.querySelectorAll('#chart-line .value-label')];
    return labels.map((node) => ({ text: node.textContent, x: Number(node.getAttribute('x')), y: Number(node.getAttribute('y')) }));
  })()`);
  check('line value labels are decluttered', lineLabels.length > 0 && lineLabels.length <= 4, JSON.stringify(lineLabels));
  check('line value labels stay inside the plot', lineLabels.every((label) => label.x >= 40 && label.x <= 710 && label.y >= 20 && label.y <= 340), JSON.stringify(lineLabels));
  check('line x ticks match the periods', await edge.evaluate("document.querySelectorAll('#chart-line .tick-line').length") === 8);

  const quiet = await edge.evaluate(`(() => {
    const style = (selector) => {
      const node = document.querySelector(selector);
      return node ? getComputedStyle(node) : null;
    };
    return {
      focusRow: !!document.querySelector('.focus-row'),
      definition: !!document.querySelector('.definition'),
      notes: !!document.querySelector('.note'),
      model: !!document.querySelector('.model'),
      pieLegend: !!document.querySelector('#chart-pie .pie-legend'),
      descBorder: style('#chart-line .desc').borderLeftWidth,
      sentenceBorder: style('#chart-line .sentence').borderTopWidth,
      patternBorder: style('#chart-line .pattern-list li').borderTopWidth,
      vocabBorder: style('#chart-line .vocab-card').borderTopWidth,
      grammarBorder: style('#chart-line .grammar-card').borderTopWidth,
      errorBorder: style('.error-card').borderTopWidth,
      chartBorder: style('#chart-line .chart-card').borderTopWidth,
      chartBg: style('#chart-line .chart-card').backgroundColor,
      levelBorder: style('#level-switch').borderTopWidth,
      levelBg: style('#level-switch').backgroundColor
    };
  })()`);
  check('redundant explanatory blocks are removed', !quiet.definition && !quiet.notes && !quiet.model && !quiet.focusRow, JSON.stringify(quiet));
  check('duplicate pie legend is removed', quiet.pieLegend === false);
  check('per-item dividers are gone', [quiet.descBorder, quiet.sentenceBorder, quiet.patternBorder, quiet.vocabBorder, quiet.grammarBorder, quiet.errorBorder].every((width) => width === '0px'), JSON.stringify(quiet));
  check('default chart surface is quiet', quiet.chartBorder === '0px' && quiet.chartBg === 'rgba(0, 0, 0, 0)', JSON.stringify({ border: quiet.chartBorder, background: quiet.chartBg }));
  check('difficulty control is unboxed', quiet.levelBorder === '0px' && quiet.levelBg === 'rgba(0, 0, 0, 0)', JSON.stringify({ border: quiet.levelBorder, background: quiet.levelBg }));

  await edge.evaluate("document.querySelector('#chart-line [data-desc-lines] .sentence-en').__marker = 'reused'");
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
  check('description nodes are reused during drag', await edge.evaluate("document.querySelector('#chart-line [data-desc-lines] .sentence-en').__marker === 'reused'") === true);

  await selectType(edge, 'area');
  const areaBefore = await edge.evaluate("document.querySelector('[data-type=\"area\"] [data-desc-lines]').textContent");
  await drag(edge, '[data-type="area"] .handle[data-index="1"]', 0, -90);
  await sleep(180);
  const areaAfter = await edge.evaluate("document.querySelector('[data-type=\"area\"] [data-desc-lines]').textContent");
  check('area drag changes its description', areaBefore !== areaAfter);
  check('area uses a functional gradient', await edge.evaluate("document.querySelectorAll('#chart-area linearGradient').length") === 1);

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
  const hbarFocus = await edge.evaluate(`(() => {
    const active = document.activeElement;
    return {
      className: active && active.getAttribute('class'),
      category: active && active.getAttribute('data-category')
    };
  })()`);
  check('horizontal bar keeps focus after re-sorting', hbarFocus.category != null && /handle/.test(hbarFocus.className || ''), JSON.stringify(hbarFocus));
  check('horizontal bar uses a baseline rule', await edge.evaluate("document.querySelectorAll('#chart-hbar .bar-ghost-rule').length") > 0);
  check('horizontal bar labels stay inside the chart', await edge.evaluate(`(() => {
    const labels = [...document.querySelectorAll('#chart-hbar .value-label')];
    return labels.every((node) => Number(node.getAttribute('x')) <= 710);
  })()`) === true);

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
  check('table numbers are right-aligned', await edge.evaluate("getComputedStyle(document.querySelector('#chart-table .num-cell')).textAlign") === 'right');
  check('table has a real total row', await edge.evaluate("!!document.querySelector('#chart-table tfoot td')") === true);
  check('table headers carry units', await edge.evaluate("document.querySelector('#chart-table .th-unit')?.textContent.trim()") === 'RMB thousand');

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

  const arcBefore = await edge.evaluate('window.NPESLCharts.state.datasets.shares.parts.map((p) => p.value)');
  const arcDrag = await drag(edge, '[data-type="pie"] .handle[data-index="1"]', 0, 80);
  await sleep(200);
  const arcAfter = await edge.evaluate('window.NPESLCharts.state.datasets.shares.parts.map((p) => p.value)');
  const arcSum = arcAfter.reduce((a, b) => a + b, 0);
  check('pie drag follows the arc, not just left-right', arcDrag.ok === true && JSON.stringify(arcBefore) !== JSON.stringify(arcAfter), JSON.stringify({ arcBefore, arcAfter }));
  check('arc drag keeps shares at 100', Math.abs(arcSum - 100) < 0.01, String(arcSum));

  const pieLabels = await edge.evaluate(`(() => {
    const state = window.NPESLCharts.state.labs.pie.pieState;
    return {
      labels: [...document.querySelectorAll('#chart-pie .pie-label')].map((node) => ({
        text: node.textContent,
        x: Number(node.getAttribute('x')),
        y: Number(node.getAttribute('y'))
      })),
      leaders: document.querySelectorAll('#chart-pie .pie-leader').length,
      cx: state.cx,
      cy: state.cy,
      radius: state.radius,
      orientation: document.querySelector('#chart-pie .pie-handle').getAttribute('aria-orientation')
    };
  })()`);
  check('pie labels sit outside the slices', pieLabels.labels.every((label) => Math.hypot(label.x - pieLabels.cx, label.y - pieLabels.cy) > pieLabels.radius), JSON.stringify(pieLabels.labels));
  check('pie labels and leader lines are complete', pieLabels.labels.length === 5 && pieLabels.labels.every((label) => label.text.trim().length > 0) && pieLabels.leaders === 5, JSON.stringify({ count: pieLabels.labels.length, leaders: pieLabels.leaders }));
  check('pie handles are not marked horizontal', pieLabels.orientation == null);

  await edge.evaluate(`(() => {
    const dataset = window.NPESLCharts.state.datasets.shares;
    dataset.parts.forEach((part) => { part.value = 0; });
    const lab = window.NPESLCharts.state.labs.pie;
    lab.changed(true);
  })()`);
  await sleep(200);
  const pieEmpty = await edge.evaluate(`({
    empty: !!document.querySelector('#chart-pie .chart-empty'),
    nan: /NaN/.test(document.querySelector('#chart-pie')?.textContent || '')
  })`);
  check('all-zero pie shows an empty state', pieEmpty.empty === true && pieEmpty.nan === false, JSON.stringify(pieEmpty));
  await edge.evaluate("window.NPESLCharts.resetKey('shares')");
  await sleep(200);

  await selectType(edge, 'line');
  await edge.evaluate("document.querySelector('#tab-line').focus(); document.querySelector('#tab-line').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))");
  await sleep(150);
  const keyboardTab = await edge.evaluate(`({
    selected: document.querySelector('[role="tab"][aria-selected="true"]').id,
    visible: [...document.querySelectorAll('.chart-panel')].filter((panel) => !panel.hidden).map((panel) => panel.dataset.type)
  })`);
  check('arrow keys move between tabs', keyboardTab.selected === 'tab-area' && keyboardTab.visible.join(',') === 'area', JSON.stringify(keyboardTab));

  await selectType(edge, 'line');
  const basic = await edge.evaluate(`(() => {
    const lab = window.NPESLCharts.state.labs.line;
    return {
      shown: document.querySelectorAll('#chart-line [data-desc-lines] .sentence').length,
      total: lab.result.sentences.length,
      vocab: document.querySelectorAll('#chart-line [data-vocab] .vocab-card').length,
      patterns: document.querySelectorAll('#chart-line [data-patterns] li').length,
      grammar: document.querySelectorAll('#chart-line [data-grammar] .grammar-card').length
    };
  })()`);
  check('basic description shows every sentence', basic.shown === basic.total && basic.total > 0, JSON.stringify(basic));

  await edge.evaluate("document.querySelectorAll('#level-switch [data-level]').forEach((b) => { if (b.dataset.level === 'C1') b.click(); })");
  await sleep(150);
  const c1 = await edge.evaluate("document.querySelector('[data-type=\"line\"] [data-desc-lines]').textContent");
  check('level switch changes wording', c1 !== after && c1.length > 20);
  const advanced = await edge.evaluate(`(() => {
    const lab = window.NPESLCharts.state.labs.line;
    return {
      shown: document.querySelectorAll('#chart-line [data-desc-lines] .sentence').length,
      total: lab.result.sentences.length,
      vocab: document.querySelectorAll('#chart-line [data-vocab] .vocab-card').length,
      patterns: document.querySelectorAll('#chart-line [data-patterns] li').length,
      grammar: document.querySelectorAll('#chart-line [data-grammar] .grammar-card').length
    };
  })()`);
  check('advanced description shows every sentence', advanced.shown === advanced.total && advanced.total > 0, JSON.stringify(advanced));
  check('both levels show the full vocabulary', advanced.vocab === basic.vocab && advanced.vocab > 0, JSON.stringify({ basic: basic.vocab, advanced: advanced.vocab }));
  check('both levels show the full patterns', advanced.patterns === basic.patterns && advanced.patterns > 0, JSON.stringify({ basic: basic.patterns, advanced: advanced.patterns }));
  check('both levels show the full grammar', advanced.grammar === basic.grammar && advanced.grammar > 0, JSON.stringify({ basic: basic.grammar, advanced: advanced.grammar }));

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
  check('type tabs stay scrollable', mobile.switchScroll >= mobile.switchClient);

  const mobileLayout = await edge.evaluate(`(() => {
    const brand = document.querySelector('.brand').getBoundingClientRect();
    const tabs = document.querySelector('.type-switch').getBoundingClientRect();
    const figure = document.querySelector('#chart-line .panel-figure').getBoundingClientRect();
    const reading = document.querySelector('#chart-line .panel-reading').getBoundingClientRect();
    return {
      brandBottom: brand.bottom,
      tabsTop: tabs.top,
      figureBottom: figure.bottom,
      readingTop: reading.top
    };
  })()`);
  check('type tabs drop below the brand on mobile', mobileLayout.tabsTop >= mobileLayout.brandBottom - 1, JSON.stringify(mobileLayout));
  check('reading column stacks below the chart on mobile', mobileLayout.readingTop >= mobileLayout.figureBottom - 1, JSON.stringify(mobileLayout));

  await edge.send('Emulation.setDeviceMetricsOverride', {
    width: 320, height: 720, deviceScaleFactor: 2, mobile: true
  });
  await sleep(250);
  const narrow = await edge.evaluate(`({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    switchScroll: document.querySelector('.type-switch-scroll').scrollWidth,
    switchClient: document.querySelector('.type-switch-scroll').clientWidth,
    overflow: document.querySelector('.type-switch').getAttribute('data-overflow')
  })`);
  check('tabs fit or expose an overflow affordance', narrow.switchScroll <= narrow.switchClient + 1 || narrow.overflow !== 'none', JSON.stringify(narrow));
  check('no horizontal overflow at 320px', narrow.scrollWidth <= narrow.innerWidth + 1, JSON.stringify(narrow));

  const themeRadii = await edge.evaluate(`(() => {
    const card = document.querySelector('#chart-line .chart-card');
    const out = {};
    ['editorial', 'brutal', 'glass'].forEach((theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      out[theme] = getComputedStyle(card).borderRadius;
    });
    out.glassArt = getComputedStyle(document.body).getPropertyValue('--bg-art').trim();
    return out;
  })()`);
  check('directional themes reach the chart card', themeRadii.editorial === '0px' && themeRadii.brutal === '14px' && themeRadii.glass === '20px', JSON.stringify(themeRadii));
  check('glass keeps its aurora background layer', themeRadii.glassArt.length > 10, themeRadii.glassArt.slice(0, 40));

  await edge.evaluate("document.documentElement.setAttribute('data-theme', 'bright')");
  await sleep(120);
  const brightStroke = await edge.evaluate("getComputedStyle(document.querySelector('#chart-line .line-path')).stroke");
  await edge.evaluate("document.documentElement.setAttribute('data-theme', 'dark')");
  await sleep(120);
  const dark = await edge.evaluate(`({
    stroke: getComputedStyle(document.querySelector('#chart-line .line-path')).stroke,
    series: getComputedStyle(document.body).getPropertyValue('--series-1').trim(),
    bg: getComputedStyle(document.body).backgroundColor
  })`);
  check('dark theme switches chart colours', dark.stroke !== brightStroke && /^rgb/.test(dark.stroke), JSON.stringify({ brightStroke, dark }));

  await edge.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await edge.send('Page.reload');
  check('reduced-motion page becomes ready', await waitFor(edge, "document.documentElement.dataset.chartsReady === 'true'"));
  await edge.evaluate("document.querySelector('#tab-pie').click()");
  await sleep(120);
  const reduced = await edge.evaluate(`({
    state: window.NPESLCharts.state.reducedMotion,
    entering: !!document.querySelector('.chart-panel.is-entering')
  })`);
  check('reduced motion disables entrance animation', reduced.state === true && reduced.entering === false, JSON.stringify(reduced));

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
