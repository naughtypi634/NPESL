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
  await sleep(180);
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
      tableConverter: !!document.querySelector('#chart-table [data-converter]'),
      scenes: panels.map((panel) => panel.querySelector('.chart-scene')?.textContent.trim())
    };
  })()`);
  check('seven chart panels exist', structure.panels === 7, String(structure.panels));
  check('the seven requested types remain', structure.labels.join(',') === 'line,bar,pie,table,process,map,mixed', structure.labels.join(','));
  check('seven type tabs exist', structure.tabs === 7, String(structure.tabs));
  check('tabs carry no sequence numbers', structure.tabLabels.every((label) => !/^\d/.test(label)), structure.tabLabels.join(','));
  check('only two difficulty levels remain', structure.levelButtons.join(',') === '基础,进阶', structure.levelButtons.join(','));
  check('one tab is selected', structure.selected.length === 1, JSON.stringify(structure.selected));
  check('only the selected panel is visible', structure.visible.length === 1 && structure.visible[0] === 'line', JSON.stringify(structure.visible));
  check('first lab mounts', structure.firstMounted === 'true');
  check('no external scripts', structure.externalScripts === 0, String(structure.externalScripts));
  check('description is not empty', structure.description.length > 20, structure.description.slice(0, 40));
  check('every scene has a caption', structure.scenes.every((scene) => scene && scene.length > 4), JSON.stringify(structure.scenes));
  check('intro meta content is gone', structure.hero === false && structure.footer === false);
  check('vocabulary is not a standalone section', structure.standaloneVocab === false);
  check('grammar is not a standalone section', structure.standaloneGrammar === false);
  check('line panel carries vocabulary', structure.lineVocab > 0, String(structure.lineVocab));
  check('line panel carries grammar', structure.lineGrammar > 0, String(structure.lineGrammar));
  check('trend types carry the converter', structure.lineConverter === true);
  check('static types skip the converter', structure.tableConverter === false);

  const shell = await edge.evaluate(`(() => {
    const head = document.querySelector('.head-inner');
    const page = document.querySelector('.page');
    const grid = document.querySelector('#chart-line .panel-grid');
    const figure = document.querySelector('#chart-line .panel-figure');
    const reading = document.querySelector('#chart-line .panel-reading');
    const card = document.querySelector('#chart-line .chart-card');
    return {
      headMax: getComputedStyle(head).maxWidth,
      pageMax: getComputedStyle(page).maxWidth,
      gridDisplay: getComputedStyle(grid).display,
      figureRect: figure.getBoundingClientRect().toJSON(),
      readingRect: reading.getBoundingClientRect().toJSON(),
      controls: !!document.querySelector('[data-chart-controls]'),
      replay: !!document.querySelector('#chart-line [data-replay]'),
      replayLabel: document.querySelector('#chart-line [data-replay]')?.getAttribute('aria-label'),
      cardBorder: getComputedStyle(card).borderTopWidth,
      cardBg: getComputedStyle(card).backgroundColor
    };
  })()`);
  check('header and page widths align', shell.headMax === shell.pageMax, JSON.stringify({ head: shell.headMax, page: shell.pageMax }));
  check('desktop uses a two-column lab grid', shell.gridDisplay === 'grid' && shell.readingRect.left >= shell.figureRect.right - 1, JSON.stringify({ grid: shell.gridDisplay, figure: shell.figureRect.right, reading: shell.readingRect.left }));
  check('empty toolbar span is gone', shell.controls === false);
  check('replay control is present and labeled', shell.replay === true && shell.replayLabel === '重播动画');
  check('chart surface stays quiet', shell.cardBorder === '0px' && shell.cardBg === 'rgba(0, 0, 0, 0)', JSON.stringify({ border: shell.cardBorder, bg: shell.cardBg }));

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

  const lineBefore = await edge.evaluate("document.querySelector('#chart-line [data-desc-lines]').textContent");
  const lineValueBefore = await edge.evaluate("window.NPESLCharts.state.datasets.time.series[0].values[1]");
  await drag(edge, '#chart-line .handle[data-index="1"]', 0, -100);
  await sleep(220);
  const lineAfter = await edge.evaluate("document.querySelector('#chart-line [data-desc-lines]').textContent");
  const lineValueAfter = await edge.evaluate("window.NPESLCharts.state.datasets.time.series[0].values[1]");
  check('line drag changes the dataset', lineValueAfter !== lineValueBefore, `${lineValueBefore} -> ${lineValueAfter}`);
  check('line drag changes the description', lineBefore !== lineAfter);
  check('line description uses a stronger verb', /surged|soared|jumped|sharp|dramatic|surge|jump/i.test(lineAfter), lineAfter.slice(0, 120));

  await selectType(edge, 'bar');
  const barStructure = await edge.evaluate(`(() => ({
    modes: document.querySelectorAll('#chart-bar [data-modes] button').length,
    bars: document.querySelectorAll('#chart-bar .bar-current').length,
    segments: document.querySelectorAll('#chart-bar .bar-segment').length,
    direction: window.NPESLCharts.state.labs.bar.barState.direction,
    layout: window.NPESLCharts.state.labs.bar.barState.layout,
    legend: document.querySelectorAll('#chart-bar .legend-item').length,
    labels: [...document.querySelectorAll('#chart-bar .value-label')].map((node) => node.textContent)
  }))()`);
  check('bar offers four direction/layout combinations', barStructure.modes === 4, String(barStructure.modes));
  check('bar defaults to vertical grouped', barStructure.direction === 'vertical' && barStructure.layout === 'grouped', JSON.stringify(barStructure));
  check('grouped bar draws all product lines', barStructure.bars === 18 && barStructure.segments === 0, JSON.stringify(barStructure));
  check('bar legend names three product lines', barStructure.legend === 3, String(barStructure.legend));
  check('grouped bar labels individual bars', barStructure.labels.length === 18, JSON.stringify(barStructure.labels));

  const barBefore = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[0].values[0]');
  const barTextBefore = await edge.evaluate("document.querySelector('#chart-bar [data-desc-lines]').textContent");
  await drag(edge, '#chart-bar .handle[data-series="0"][data-index="0"]', 0, -60);
  await sleep(220);
  const barAfter = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[0].values[0]');
  const barTextAfter = await edge.evaluate("document.querySelector('#chart-bar [data-desc-lines]').textContent");
  check('bar drag changes the category dataset', barAfter !== barBefore, `${barBefore} -> ${barAfter}`);
  check('bar drag changes the description', barTextBefore !== barTextAfter);

  await edge.evaluate("document.querySelector('#chart-bar [data-modes] [data-value=\"horizontal\"]').click()");
  await sleep(250);
  const horizontal = await edge.evaluate(`({
    direction: window.NPESLCharts.state.labs.bar.barState.direction,
    bars: document.querySelectorAll('#chart-bar .bar-current').length,
    sorted: window.NPESLCharts.state.labs.bar.barState.order.slice(0, 3)
  })`);
  check('bar switches to horizontal', horizontal.direction === 'horizontal' && horizontal.bars === 18, JSON.stringify(horizontal));
  check('horizontal bars are ranked', horizontal.sorted[0] === 0 && horizontal.sorted[1] === 1, JSON.stringify(horizontal.sorted));

  await edge.evaluate("document.querySelector('#chart-bar [data-modes] [data-value=\"stacked\"]').click()");
  await sleep(250);
  const hStack = await edge.evaluate(`({
    layout: window.NPESLCharts.state.labs.bar.barState.layout,
    segments: document.querySelectorAll('#chart-bar .bar-segment').length,
    labels: [...document.querySelectorAll('#chart-bar .value-label')].map((node) => node.textContent)
  })`);
  check('horizontal bar switches to stacked segments', hStack.layout === 'stacked' && hStack.segments === 18, JSON.stringify(hStack));
  check('stacked horizontal bar labels the totals', hStack.labels.length === 6 && hStack.labels.every((label) => /^\d+$/.test(label)), JSON.stringify(hStack.labels));

  await edge.evaluate("document.querySelector('#chart-bar [data-modes] [data-value=\"vertical\"]').click()");
  await sleep(250);
  const vStack = await edge.evaluate(`({
    direction: window.NPESLCharts.state.labs.bar.barState.direction,
    layout: window.NPESLCharts.state.labs.bar.barState.layout,
    segments: document.querySelectorAll('#chart-bar .bar-segment').length,
    labels: [...document.querySelectorAll('#chart-bar .value-label')].map((node) => node.textContent)
  })`);
  check('vertical stacked bar keeps six totals', vStack.segments === 18 && vStack.labels.length === 6, JSON.stringify(vStack));

  await selectType(edge, 'pie');
  const pieBefore = await edge.evaluate('window.NPESLCharts.state.datasets.shares.parts.map((p) => p.value)');
  const pieDrag = await drag(edge, '#chart-pie .handle', 60, 0);
  await sleep(220);
  const pieAfter = await edge.evaluate('window.NPESLCharts.state.datasets.shares.parts.map((p) => p.value)');
  const pieSum = pieAfter.reduce((a, b) => a + b, 0);
  check('pie drag works', pieDrag.ok === true);
  check('pie shares still total 100', Math.abs(pieSum - 100) < 0.01, String(pieSum));
  check('pie shares respect the 3% floor', pieAfter.every((v) => v >= 2.99), JSON.stringify(pieAfter));
  check('pie shares changed', JSON.stringify(pieBefore) !== JSON.stringify(pieAfter));

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
      radius: state.radius
    };
  })()`);
  check('pie labels sit outside the slices', pieLabels.labels.every((label) => Math.hypot(label.x - pieLabels.cx, label.y - pieLabels.cy) > pieLabels.radius), JSON.stringify(pieLabels.labels));
  check('pie labels and leader lines are complete', pieLabels.labels.length === 5 && pieLabels.leaders === 5, JSON.stringify({ count: pieLabels.labels.length, leaders: pieLabels.leaders }));
  await edge.evaluate("window.NPESLCharts.resetKey('shares')");
  await sleep(200);

  await selectType(edge, 'table');
  const tableBefore = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[0].values[0]');
  await edge.evaluate(`(() => {
    const input = document.querySelector('#chart-table [data-plot] input');
    if (!input) return;
    input.value = String(Number(input.value) + 40);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(250);
  const tableAfter = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[0].values[0]');
  check('table edit updates the dataset', tableAfter === tableBefore + 40, `${tableBefore} -> ${tableAfter}`);
  check('table numbers are right-aligned', await edge.evaluate("getComputedStyle(document.querySelector('#chart-table .num-cell')).textAlign") === 'right');
  check('table has a real total row', await edge.evaluate("!!document.querySelector('#chart-table tfoot th')") === true);
  check('table headers carry units', await edge.evaluate("document.querySelector('#chart-table .th-unit')?.textContent.trim()") === 'RMB thousand');

  await selectType(edge, 'process');
  const process = await edge.evaluate(`({
    steps: document.querySelectorAll('#chart-process .process-step').length,
    modes: document.querySelectorAll('#chart-process [data-modes] button').length,
    voice: window.NPESLCharts.state.labs.process.mode.voice,
    desc: document.querySelector('#chart-process [data-desc-lines]').textContent
  })`);
  check('process shows six stages', process.steps === 6, String(process.steps));
  check('process offers active and passive voice', process.modes === 2 && process.voice === 'active', JSON.stringify(process));
  await edge.evaluate("document.querySelector('#chart-process [data-modes] [data-value=\"passive\"]').click()");
  await sleep(250);
  const passive = await edge.evaluate(`({
    voice: window.NPESLCharts.state.labs.process.mode.voice,
    desc: document.querySelector('#chart-process [data-desc-lines]').textContent
  })`);
  check('process voice toggle changes the description', passive.voice === 'passive' && passive.desc !== process.desc);
  check('process passive description uses be + participle', /is placed|is confirmed|is assigned|is handed/i.test(passive.desc), passive.desc.slice(0, 120));
  await edge.evaluate("document.querySelector('#chart-process .process-step[data-step=\"confirm\"]').click()");
  await sleep(180);
  const linked = await edge.evaluate(`({
    active: document.querySelectorAll('#chart-process .process-step.is-active').length,
    sentences: document.querySelectorAll('#chart-process .sentence.is-linked').length
  })`);
  check('selecting a process stage links its sentence', linked.active === 1 && linked.sentences === 1, JSON.stringify(linked));

  await selectType(edge, 'map');
  const map = await edge.evaluate(`({
    panels: document.querySelectorAll('#chart-map .map-panel').length,
    blocks: document.querySelectorAll('#chart-map .map-block').length,
    years: [...document.querySelectorAll('#chart-map .map-year')].map((node) => node.textContent),
    changed: document.querySelectorAll('#chart-map .map-block.is-new').length,
    desc: document.querySelector('#chart-map [data-desc-lines]').textContent
  })`);
  check('map shows before and after panels', map.panels === 2 && map.years.join(',') === '2015,2026', JSON.stringify(map));
  check('map marks the redeveloped sites', map.changed === 4, String(map.changed));
  check('map description mentions the factory', /factory/i.test(map.desc), map.desc.slice(0, 100));
  await edge.evaluate("document.querySelector('#chart-map [data-feature=\"factory\"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))");
  await sleep(180);
  const mapLinked = await edge.evaluate(`({
    active: document.querySelectorAll('#chart-map .map-block.is-active').length,
    sentences: document.querySelectorAll('#chart-map .sentence.is-linked').length
  })`);
  check('selecting a map site links its sentence', mapLinked.active === 2 && mapLinked.sentences === 1, JSON.stringify(mapLinked));

  await selectType(edge, 'mixed');
  const mixed = await edge.evaluate(`({
    bars: document.querySelectorAll('#chart-mixed .bar-current').length,
    line: document.querySelectorAll('#chart-mixed .mixed-line').length,
    dots: document.querySelectorAll('#chart-mixed .mixed-dot').length,
    legend: document.querySelectorAll('#chart-mixed .legend-item').length
  })`);
  check('mixed chart combines bars and a line', mixed.bars === 8 && mixed.line === 1 && mixed.dots === 8, JSON.stringify(mixed));
  check('mixed legend names both measures', mixed.legend === 2, String(mixed.legend));

  const mixedBarBefore = await edge.evaluate('window.NPESLCharts.state.datasets.mixed.bars.values[2]');
  await drag(edge, '#chart-mixed .handle[data-series="bar"][data-index="2"]', 0, -50);
  await sleep(220);
  const mixedBarAfter = await edge.evaluate('window.NPESLCharts.state.datasets.mixed.bars.values[2]');
  check('mixed bar drag changes revenue', mixedBarAfter !== mixedBarBefore, `${mixedBarBefore} -> ${mixedBarAfter}`);

  const mixedLineBefore = await edge.evaluate('window.NPESLCharts.state.datasets.mixed.line.values[2]');
  await drag(edge, '#chart-mixed .handle[data-series="line"][data-index="2"]', 0, -20);
  await sleep(220);
  const mixedLineAfter = await edge.evaluate('window.NPESLCharts.state.datasets.mixed.line.values[2]');
  check('mixed line drag changes margin', mixedLineAfter !== mixedLineBefore, `${mixedLineBefore} -> ${mixedLineAfter}`);

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
  await sleep(180);
  const advanced = await edge.evaluate(`(() => {
    const lab = window.NPESLCharts.state.labs.line;
    return {
      desc: document.querySelector('#chart-line [data-desc-lines]').textContent,
      shown: document.querySelectorAll('#chart-line [data-desc-lines] .sentence').length,
      total: lab.result.sentences.length,
      vocab: document.querySelectorAll('#chart-line [data-vocab] .vocab-card').length,
      patterns: document.querySelectorAll('#chart-line [data-patterns] li').length,
      grammar: document.querySelectorAll('#chart-line [data-grammar] .grammar-card').length
    };
  })()`);
  check('level switch changes wording', advanced.desc !== lineAfter && advanced.desc.length > 20);
  check('advanced description shows every sentence', advanced.shown === advanced.total && advanced.total > 0, JSON.stringify(advanced));
  check('both levels show the full vocabulary', advanced.vocab === basic.vocab && advanced.vocab > 0, JSON.stringify({ basic: basic.vocab, advanced: advanced.vocab }));
  check('both levels show the full patterns', advanced.patterns === basic.patterns && advanced.patterns > 0, JSON.stringify({ basic: basic.patterns, advanced: advanced.patterns }));
  check('both levels show the full grammar', advanced.grammar === basic.grammar && advanced.grammar > 0, JSON.stringify({ basic: basic.grammar, advanced: advanced.grammar }));

  await edge.evaluate("document.querySelector('#tab-line').focus(); document.querySelector('#tab-line').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))");
  await sleep(180);
  const keyboardTab = await edge.evaluate(`({
    selected: document.querySelector('[role="tab"][aria-selected="true"]').id,
    visible: [...document.querySelectorAll('.chart-panel')].filter((panel) => !panel.hidden).map((panel) => panel.dataset.type)
  })`);
  check('arrow keys move between tabs', keyboardTab.selected === 'tab-bar' && keyboardTab.visible.join(',') === 'bar', JSON.stringify(keyboardTab));

  await edge.send('Emulation.setDeviceMetricsOverride', {
    width: 375, height: 812, deviceScaleFactor: 2, mobile: true
  });
  await sleep(300);
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
    const figure = document.querySelector('#chart-bar .panel-figure').getBoundingClientRect();
    const reading = document.querySelector('#chart-bar .panel-reading').getBoundingClientRect();
    return {
      brandBottom: brand.bottom,
      tabsTop: tabs.top,
      figureBottom: figure.bottom,
      readingTop: reading.top
    };
  })()`);
  check('type tabs drop below the brand on mobile', mobileLayout.tabsTop >= mobileLayout.brandBottom - 1, JSON.stringify(mobileLayout));
  check('reading column stacks below the chart on mobile', mobileLayout.readingTop >= mobileLayout.figureBottom - 1, JSON.stringify(mobileLayout));

  await edge.evaluate("document.querySelector('#tab-map').click()");
  await sleep(300);
  const compactMap = await edge.evaluate(`({
    svgs: document.querySelectorAll('#chart-map .map-stack svg').length,
    panels: document.querySelectorAll('#chart-map .map-panel').length,
    width: document.querySelector('#chart-map .map-stack svg')?.getBoundingClientRect().width
  })`);
  check('map stacks two full-width maps on mobile', compactMap.svgs === 2 && compactMap.panels === 2 && compactMap.width > 200, JSON.stringify(compactMap));

  await edge.send('Emulation.setDeviceMetricsOverride', {
    width: 320, height: 720, deviceScaleFactor: 2, mobile: true
  });
  await sleep(300);
  const narrow = await edge.evaluate(`({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    switchScroll: document.querySelector('.type-switch-scroll').scrollWidth,
    switchClient: document.querySelector('.type-switch-scroll').clientWidth
  })`);
  check('no horizontal overflow at 320px', narrow.scrollWidth <= narrow.innerWidth + 1, JSON.stringify(narrow));
  check('tabs remain scrollable at 320px', narrow.switchScroll >= narrow.switchClient, JSON.stringify(narrow));

  await edge.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
  });
  await sleep(250);
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
  await sleep(140);
  const brightStroke = await edge.evaluate("getComputedStyle(document.querySelector('#chart-line .line-path')).stroke");
  await edge.evaluate("document.documentElement.setAttribute('data-theme', 'dark')");
  await sleep(140);
  const dark = await edge.evaluate(`({
    stroke: getComputedStyle(document.querySelector('#chart-line .line-path')).stroke,
    series: getComputedStyle(document.body).getPropertyValue('--series-1').trim(),
    bg: getComputedStyle(document.body).backgroundColor
  })`);
  check('dark theme switches chart colors', dark.stroke !== brightStroke && /^rgb/.test(dark.stroke), JSON.stringify({ brightStroke, dark }));

  await edge.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await edge.send('Page.reload');
  check('reduced-motion page becomes ready', await waitFor(edge, "document.documentElement.dataset.chartsReady === 'true'"));
  await edge.evaluate("document.querySelector('#tab-pie').click()");
  await sleep(140);
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
