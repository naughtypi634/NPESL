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

async function hoverMark(edge, selector) {
  return edge.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, reason: 'missing' };
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerover', {
      bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
    }));
    return { ok: true };
  })()`);
}

async function clickMark(edge, selector) {
  return edge.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, reason: 'missing' };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const base = { bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: x, clientY: y, buttons: 1 }));
    el.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: x, clientY: y, buttons: 0 }));
    // A real click also fires click; synthetic pointer events do not.
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    return { ok: true };
  })()`);
}

async function commitEditor(edge, panel, value) {
  await edge.evaluate(`(() => {
    const input = document.querySelector('#chart-${panel} .value-editor input');
    if (!input) return;
    input.value = String(${value});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#chart-${panel} .value-editor-ok').click();
  })()`);
  await sleep(250);
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
      dataPanels: document.querySelectorAll('[data-data-panel]').length,
      cefr: (document.body.innerText.match(/\\b(A2|B1|B2|C1)\\b/g) || []).length,
      typeStyle: getComputedStyle(document.querySelector('.deck')).borderTopWidth,
      levelStyle: getComputedStyle(document.querySelector('#level-switch button[aria-pressed="true"]')).borderBottomWidth,
      lineVocab: document.querySelectorAll('#chart-line [data-vocab] .vocab-card').length,
      vocabBadges: document.querySelectorAll('#chart-line [data-vocab] .badge').length,
      linePatterns: document.querySelectorAll('#chart-line [data-patterns] li').length,
      patternLevels: document.querySelectorAll('#chart-line .pattern-level').length,
      grammar: document.querySelectorAll('[data-grammar-section], .grammar-card').length,
      vocabOpen: document.querySelector('#chart-line [data-vocab-section]')?.tagName,
      errorGroups: document.querySelectorAll('.error-group').length,
      errorCards: document.querySelectorAll('.error-card').length,
      actionButtons: document.querySelectorAll('#chart-bar [data-reset]').length,
      sectionHeads: document.querySelectorAll('#chart-line .section-head').length,
      figureTitle: document.querySelector('#chart-line .figure-title')?.textContent.trim() || '',
      figureTitleZh: document.querySelector('#chart-line .figure-title-zh')?.textContent.trim() || '',
      levelInReading: !!document.querySelector('#chart-line .rail #level-switch'),
      handleRestOpacity: getComputedStyle(document.querySelector('#chart-line .handle .dot')).opacity,
      steps: document.querySelectorAll('#chart-line [data-desc-lines] .sentence').length,
      activeSteps: document.querySelectorAll('#chart-line [data-desc-lines] .sentence.is-active').length,
      stepCount: document.querySelector('#chart-line [data-step-count]')?.textContent.trim() || '',
      statValue: document.querySelector('#chart-line [data-stat] .stat-value')?.textContent.trim() || '',
      deckGlyphs: document.querySelectorAll('#type-buttons .deck-glyph svg').length
    };
  })()`);
  check('six chart panels exist', structure.panels === 6, String(structure.panels));
  check('map is gone', structure.labels.join(',') === 'line,bar,pie,table,process,mixed', structure.labels.join(','));
  check('six type tabs exist', structure.tabs === 6, String(structure.tabs));
  check('tabs carry no sequence numbers', structure.tabLabels.every((label) => !/^\d/.test(label)), structure.tabLabels.join(','));
  check('only two difficulty levels remain', structure.levelButtons.join(',') === '基础,进阶', structure.levelButtons.join(','));
  check('one tab is selected', structure.selected.length === 1, JSON.stringify(structure.selected));
  check('only the selected panel is visible', structure.visible.length === 1 && structure.visible[0] === 'line', JSON.stringify(structure.visible));
  check('first lab mounts', structure.firstMounted === 'true');
  check('no external scripts', structure.externalScripts === 0, String(structure.externalScripts));
  check('description is not empty', structure.description.length > 20, structure.description.slice(0, 40));
  check('the separate data panel is gone', structure.dataPanels === 0, String(structure.dataPanels));
  check('no CEFR labels anywhere', structure.cefr === 0, String(structure.cefr));
  check('type deck is a ruled strip', structure.typeStyle === '1px', structure.typeStyle);
  check('level switch marks the active level', structure.levelStyle === '2px', structure.levelStyle);
  check('line panel carries all vocabulary', structure.lineVocab > 20, String(structure.lineVocab));
  check('vocabulary has no level badges', structure.vocabBadges === 0, String(structure.vocabBadges));
  check('vocabulary is open, not collapsed', structure.vocabOpen === 'SECTION', structure.vocabOpen);
  check('patterns stay', structure.linePatterns === 4, String(structure.linePatterns));
  check('patterns have no level badges', structure.patternLevels === 0, String(structure.patternLevels));
  check('grammar is gone', structure.grammar === 0, String(structure.grammar));
  check('errors are grouped by category', structure.errorGroups >= 5 && structure.errorCards > 10, JSON.stringify({ groups: structure.errorGroups, cards: structure.errorCards }));
  check('the chart type is not repeated as a page heading', structure.sectionHeads === 0, String(structure.sectionHeads));
  check('the figure carries the data title', structure.figureTitle.length > 0 && structure.figureTitleZh.length > 0, JSON.stringify({ en: structure.figureTitle, zh: structure.figureTitleZh }));
  check('the level switch lives with the description', structure.levelInReading === true);
  check('chart handles stay out of the way at rest', structure.handleRestOpacity === '0', structure.handleRestOpacity);
  check('only the restore action remains', structure.actionButtons === 1, String(structure.actionButtons));
  check('the rail starts on the first step', structure.steps > 2 && structure.activeSteps === 1, JSON.stringify({ steps: structure.steps, active: structure.activeSteps }));
  check('the step counter is visible', /^01 \/ \d\d$/.test(structure.stepCount), structure.stepCount);
  check('the headline number is rendered', structure.statValue.length > 0, structure.statValue);
  check('the type deck carries glyphs', structure.deckGlyphs === 6, String(structure.deckGlyphs));

  const revealed = await edge.evaluate(`(() => {
    const handle = document.querySelector('#chart-line .handle');
    handle.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    return handle.classList.contains('is-visible');
  })()`);
  check('hovering a mark reveals its handle', revealed === true, JSON.stringify({ revealed }));

  const stepState = await edge.evaluate(`(() => {
    const rows = [...document.querySelectorAll('#chart-line [data-desc-lines] .sentence')];
    rows[1].click();
    return {
      active: rows.findIndex((row) => row.classList.contains('is-active')),
      count: document.querySelector('#chart-line [data-step-count]').textContent.trim(),
      band: !!document.querySelector('#chart-line .focus-band'),
      kind: rows[1].getAttribute('data-focus-kind')
    };
  })()`);
  check('selecting a sentence advances the rail', stepState.active === 1 && /^02/.test(stepState.count), JSON.stringify(stepState));
  check('the chart highlights the sentence region', stepState.band === true, JSON.stringify(stepState));
  await edge.evaluate("document.querySelector('#chart-line [data-step-prev]').click()");
  await sleep(80);
  const stepBack = await edge.evaluate(`({
    active: [...document.querySelectorAll('#chart-line [data-desc-lines] .sentence')].findIndex((row) => row.classList.contains('is-active')),
    count: document.querySelector('#chart-line [data-step-count]').textContent.trim()
  })`);
  check('rail navigation steps backwards', stepBack.active === 0 && /^01/.test(stepBack.count), JSON.stringify(stepBack));

  await edge.evaluate("document.querySelector('[data-reference]').click()");
  await sleep(220);
  const sheet = await edge.evaluate(`({
    open: !document.querySelector('[data-sheet]').hidden,
    patterns: document.querySelectorAll('[data-sheet-section="patterns"] .pattern-list li').length,
    sections: document.querySelectorAll('[data-sheet-section]').length
  })`);
  check('the reference sheet opens with the chart patterns', sheet.open === true && sheet.patterns === 4 && sheet.sections === 3, JSON.stringify(sheet));
  await edge.evaluate("document.querySelector('[data-sheet-tab=\"vocab\"]').click()");
  await sleep(120);
  const sheetVocab = await edge.evaluate(`({
    visible: !document.querySelector('[data-sheet-section="vocab"]').hidden,
    cards: document.querySelectorAll('[data-sheet-section="vocab"] .vocab-card').length
  })`);
  check('the sheet switches to vocabulary', sheetVocab.visible === true && sheetVocab.cards > 20, JSON.stringify(sheetVocab));
  await edge.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await sleep(120);
  check('the sheet closes with Escape', await edge.evaluate("document.querySelector('[data-sheet]').hidden") === true);

  const shell = await edge.evaluate(`(() => {
    const head = document.querySelector('.head-inner');
    const layout = document.querySelector('#chart-line .panel-layout');
    const stage = document.querySelector('#chart-line .stage');
    const rail = document.querySelector('#chart-line .rail');
    return {
      headMax: getComputedStyle(head).maxWidth,
      layoutMax: getComputedStyle(layout).maxWidth,
      layoutDisplay: getComputedStyle(layout).display,
      stageRect: stage.getBoundingClientRect().toJSON(),
      railRect: rail.getBoundingClientRect().toJSON(),
      stageBorder: getComputedStyle(stage).borderTopWidth,
      stageBg: getComputedStyle(stage).backgroundColor
    };
  })()`);
  check('header and studio widths align', shell.headMax === shell.layoutMax, JSON.stringify({ head: shell.headMax, layout: shell.layoutMax }));
  check('desktop splits the stage and the reading rail', shell.layoutDisplay === 'grid' && shell.railRect.left >= shell.stageRect.right - 1, JSON.stringify({ display: shell.layoutDisplay, stage: shell.stageRect.right, rail: shell.railRect.left }));
  check('the stage reads as its own card', shell.stageBorder === '1px' && shell.stageBg !== 'rgba(0, 0, 0, 0)', JSON.stringify({ border: shell.stageBorder, bg: shell.stageBg }));

  const tip = await edge.evaluate(`(() => {
    const handle = document.querySelector('#chart-line .handle[data-index="1"]');
    handle.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
    const node = document.querySelector('#chart-line .chart-tip');
    return node ? { visible: node.dataset.visible, text: node.textContent } : null;
  })()`);
  check('hovering a point shows its value tooltip', tip && tip.visible === 'true' && /Q2 2025/.test(tip.text) && /RMB/.test(tip.text), JSON.stringify(tip));

  const lineBefore = await edge.evaluate("document.querySelector('#chart-line [data-desc-lines]').textContent");
  const lineValueBefore = await edge.evaluate("window.NPESLCharts.state.datasets.time.series[0].values[1]");
  await drag(edge, '#chart-line .handle[data-index="1"]', 0, -100);
  await sleep(220);
  const lineAfter = await edge.evaluate("document.querySelector('#chart-line [data-desc-lines]').textContent");
  const lineValueAfter = await edge.evaluate("window.NPESLCharts.state.datasets.time.series[0].values[1]");
  check('line drag changes the dataset', lineValueAfter !== lineValueBefore, `${lineValueBefore} -> ${lineValueAfter}`);
  check('line drag changes the description', lineBefore !== lineAfter);

  await clickMark(edge, '#chart-line .handle[data-index="1"]');
  await sleep(200);
  const lineEditor = await edge.evaluate(`({
    open: !!document.querySelector('#chart-line .value-editor'),
    value: document.querySelector('#chart-line .value-editor input')?.value,
    label: document.querySelector('#chart-line .value-editor-label')?.textContent
  })`);
  check('clicking a line point opens a number editor', lineEditor.open === true && lineEditor.label === 'Q2 2025', JSON.stringify(lineEditor));
  await commitEditor(edge, 'line', 80);
  check('confirming the editor changes the value', await edge.evaluate('window.NPESLCharts.state.datasets.time.series[0].values[1]') === 80);
  check('the editor closes after confirming', await edge.evaluate("!document.querySelector('#chart-line .value-editor')") === true);
  check('editing reveals the restore action', await edge.evaluate("!document.querySelector('#chart-line [data-reset]').hidden") === true);
  await edge.evaluate("document.querySelector('#chart-line [data-reset]').click()");
  await sleep(220);
  const restored = await edge.evaluate(`({
    value: window.NPESLCharts.state.datasets.time.series[0].values[1],
    hidden: document.querySelector('#chart-line [data-reset]').hidden
  })`);
  check('restore brings back the original data', restored.value === 46 && restored.hidden === true, JSON.stringify(restored));

  await selectType(edge, 'bar');
  check('the level switch follows the active panel', await edge.evaluate("!!document.querySelector('#chart-bar .rail #level-switch') && !document.querySelector('#chart-line #level-switch')"));
  const barStructure = await edge.evaluate(`(() => ({
    modes: document.querySelectorAll('#chart-bar [data-modes] button').length,
    bars: document.querySelectorAll('#chart-bar .bar-current').length,
    segments: document.querySelectorAll('#chart-bar .bar-segment').length,
    direction: window.NPESLCharts.state.labs.bar.barState.direction,
    layout: window.NPESLCharts.state.labs.bar.barState.layout,
    segmentBorder: getComputedStyle(document.querySelector('#chart-bar .segment-btn[aria-pressed="true"]')).borderBottomWidth,
    segmentCount: document.querySelectorAll('#chart-bar .segment').length
  }))()`);
  check('bar offers four direction/layout combinations', barStructure.modes === 4, String(barStructure.modes));
  check('bar defaults to vertical grouped', barStructure.direction === 'vertical' && barStructure.layout === 'grouped', JSON.stringify(barStructure));
  check('grouped bar draws all product lines', barStructure.bars === 18 && barStructure.segments === 0, JSON.stringify(barStructure));
  check('mode controls mark the active option with a rule', barStructure.segmentBorder === '2px' && barStructure.segmentCount === 2, JSON.stringify({ border: barStructure.segmentBorder, groups: barStructure.segmentCount }));

  await hoverMark(edge, '#chart-bar .bar-current[data-series="coffee"][data-index="0"]');
  await sleep(160);
  const barLink = await edge.evaluate(`(() => {
    const linked = [...document.querySelectorAll('#chart-bar .sentence.is-linked')];
    return { count: linked.length, text: linked[0] ? linked[0].querySelector('.sentence-en').textContent : '' };
  })()`);
  check('pointing at a bar names the sentence that covers it', barLink.count === 1 && /Coffee/.test(barLink.text), JSON.stringify(barLink));

  const barBefore = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[0].values[0]');
  await clickMark(edge, '#chart-bar .bar-current[data-series="coffee"][data-index="0"]');
  await sleep(200);
  check('clicking a bar opens a number editor', await edge.evaluate("!!document.querySelector('#chart-bar .value-editor')") === true);
  const barClicked = await edge.evaluate(`(() => {
    const rows = [...document.querySelectorAll('#chart-bar .sentence')];
    const active = rows.findIndex((row) => row.classList.contains('is-active'));
    return { active, text: active >= 0 ? rows[active].querySelector('.sentence-en').textContent : '' };
  })()`);
  check('clicking a bar activates the sentence that names it', /Coffee/.test(barClicked.text), JSON.stringify(barClicked));
  await commitEditor(edge, 'bar', 350);
  const barAfter = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[0].values[0]');
  check('bar editor changes the dataset', barAfter === 350, `${barBefore} -> ${barAfter}`);

  await edge.evaluate("document.querySelector('#chart-bar [data-modes] [data-value=\"stacked\"]').click()");
  await sleep(250);
  const stack = await edge.evaluate(`({
    segments: document.querySelectorAll('#chart-bar .bar-segment').length,
    labels: [...document.querySelectorAll('#chart-bar .value-label')].map((node) => node.textContent)
  })`);
  check('bar switches to stacked segments', stack.segments === 18, JSON.stringify(stack));
  check('stacked bar labels the six totals', stack.labels.length === 6, JSON.stringify(stack.labels));

  await clickMark(edge, '#chart-bar .bar-segment[data-series="bakery"][data-index="0"]');
  await sleep(200);
  check('clicking a stacked segment opens a number editor', await edge.evaluate("!!document.querySelector('#chart-bar .value-editor')") === true);
  await commitEditor(edge, 'bar', 150);
  check('stacked segment edit updates the dataset', await edge.evaluate('window.NPESLCharts.state.datasets.category.series[1].values[0]') === 150);

  const stackDragBefore = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[0].values[0]');
  await drag(edge, '#chart-bar .handle[data-series="0"][data-index="0"]', 0, -30);
  await sleep(220);
  const stackDragAfter = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[0].values[0]');
  check('stacked segments can also be dragged', stackDragAfter !== stackDragBefore, `${stackDragBefore} -> ${stackDragAfter}`);

  await edge.evaluate("document.querySelector('#chart-bar [data-modes] [data-value=\"horizontal\"]').click()");
  await sleep(250);
  const horizontal = await edge.evaluate(`({
    direction: window.NPESLCharts.state.labs.bar.barState.direction,
    bars: document.querySelectorAll('#chart-bar .bar-current').length,
    segments: document.querySelectorAll('#chart-bar .bar-segment').length
  })`);
  check('bar switches to horizontal', horizontal.direction === 'horizontal' && (horizontal.bars + horizontal.segments) === 18, JSON.stringify(horizontal));
  await edge.evaluate("document.querySelector('#chart-bar [data-modes] [data-value=\"vertical\"]').click()");
  await sleep(200);
  await edge.evaluate("document.querySelector('#chart-bar [data-modes] [data-value=\"grouped\"]').click()");
  await sleep(200);

  await selectType(edge, 'pie');
  const pieBefore = await edge.evaluate('window.NPESLCharts.state.datasets.shares.parts.map((p) => p.value)');
  await clickMark(edge, '#chart-pie .pie-label');
  await sleep(200);
  check('clicking a pie label opens a number editor', await edge.evaluate("!!document.querySelector('#chart-pie .value-editor')") === true);
  await commitEditor(edge, 'pie', 60);
  const pieAfter = await edge.evaluate('window.NPESLCharts.state.datasets.shares.parts.map((p) => p.value)');
  const pieSum = pieAfter.reduce((a, b) => a + b, 0);
  check('pie editor changes the split', JSON.stringify(pieBefore) !== JSON.stringify(pieAfter), JSON.stringify({ pieBefore, pieAfter }));
  check('pie shares still total 100', Math.abs(pieSum - 100) < 0.01, String(pieSum));

  const pieDragBefore = await edge.evaluate('window.NPESLCharts.state.datasets.shares.parts.map((p) => p.value)');
  await drag(edge, '#chart-pie .handle', 60, 0);
  await sleep(220);
  const pieDragAfter = await edge.evaluate('window.NPESLCharts.state.datasets.shares.parts.map((p) => p.value)');
  const pieDragSum = pieDragAfter.reduce((a, b) => a + b, 0);
  check('pie drag still works', JSON.stringify(pieDragBefore) !== JSON.stringify(pieDragAfter));
  check('pie drag keeps shares at 100', Math.abs(pieDragSum - 100) < 0.01, String(pieDragSum));

  await selectType(edge, 'table');
  const tableBefore = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[0].values[0]');
  await edge.evaluate(`(() => {
    const input = document.querySelector('#chart-table [data-plot] input');
    if (!input) return;
    input.value = String(Number(input.value) + 10);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(250);
  const tableAfter = await edge.evaluate('window.NPESLCharts.state.datasets.category.series[0].values[0]');
  check('table cells remain editable in place', tableAfter === tableBefore + 10, `${tableBefore} -> ${tableAfter}`);
  check('table numbers are right-aligned', await edge.evaluate("getComputedStyle(document.querySelector('#chart-table .num-cell')).textAlign") === 'right');
  check('table has a real total row', await edge.evaluate("!!document.querySelector('#chart-table tfoot th')") === true);

  await selectType(edge, 'process');
  const process = await edge.evaluate(`({
    steps: document.querySelectorAll('#chart-process .process-step').length,
    modes: document.querySelectorAll('#chart-process [data-modes] button').length,
    voice: window.NPESLCharts.state.labs.process.mode.voice,
    desc: document.querySelector('#chart-process [data-desc-lines]').textContent,
    reset: !!document.querySelector('#chart-process [data-reset]')
  })`);
  check('process shows six stages', process.steps === 6, String(process.steps));
  check('process offers active and passive voice', process.modes === 2 && process.voice === 'active', JSON.stringify(process));
  check('process has no meaningless reset button', process.reset === false);
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
  const detail = await edge.evaluate(`({
    hidden: document.querySelector('#chart-process .process-detail').hidden,
    en: document.querySelector('#chart-process .process-detail-en').textContent.trim(),
    zh: document.querySelector('#chart-process .process-detail-zh').textContent.trim()
  })`);
  check('selecting a process stage shows its detail', detail.hidden === false && detail.en.length > 10 && detail.zh.length > 4, JSON.stringify(detail));

  await selectType(edge, 'mixed');
  const mixed = await edge.evaluate(`({
    bars: document.querySelectorAll('#chart-mixed .bar-current').length,
    line: document.querySelectorAll('#chart-mixed .mixed-line').length,
    dots: document.querySelectorAll('#chart-mixed .mixed-dot').length
  })`);
  check('mixed chart combines bars and a line', mixed.bars === 8 && mixed.line === 1 && mixed.dots === 8, JSON.stringify(mixed));

  const mixedBefore = await edge.evaluate('window.NPESLCharts.state.datasets.mixed.bars.values[2]');
  await clickMark(edge, '#chart-mixed .bar-current[data-index="2"]');
  await sleep(200);
  check('clicking a mixed bar opens a number editor', await edge.evaluate("!!document.querySelector('#chart-mixed .value-editor')") === true);
  await commitEditor(edge, 'mixed', 70);
  check('mixed bar editor changes revenue', await edge.evaluate('window.NPESLCharts.state.datasets.mixed.bars.values[2]') === 70, `${mixedBefore} -> 70`);

  await selectType(edge, 'line');
  const learning = await edge.evaluate(`(() => ({
    vocab: document.querySelector('#chart-line [data-vocab]').innerHTML,
    patterns: document.querySelector('#chart-line [data-patterns]').innerHTML,
    desc: document.querySelector('#chart-line [data-desc-lines]').textContent
  }))()`);
  await edge.evaluate("document.querySelectorAll('#level-switch [data-level]').forEach((b) => { if (b.dataset.level === 'C1') b.click(); })");
  await sleep(180);
  const advanced = await edge.evaluate(`(() => ({
    vocab: document.querySelector('#chart-line [data-vocab]').innerHTML,
    patterns: document.querySelector('#chart-line [data-patterns]').innerHTML,
    desc: document.querySelector('#chart-line [data-desc-lines]').textContent
  }))()`);
  check('level toggle changes the description only', advanced.desc !== learning.desc, advanced.desc.slice(0, 80));
  check('level toggle leaves vocabulary untouched', advanced.vocab === learning.vocab);
  check('level toggle leaves patterns untouched', advanced.patterns === learning.patterns);

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
    switchScroll: document.querySelector('#type-buttons').scrollWidth,
    switchClient: document.querySelector('#type-buttons').clientWidth
  })`);
  check('mobile has no horizontal page overflow', mobile.scrollWidth <= mobile.innerWidth + 1, JSON.stringify(mobile));
  check('type tabs stay scrollable', mobile.switchScroll >= mobile.switchClient);

  const mobileLayout = await edge.evaluate(`(() => {
    const deck = document.querySelector('.deck').getBoundingClientRect();
    const stage = document.querySelector('#chart-bar .stage').getBoundingClientRect();
    const rail = document.querySelector('#chart-bar .rail').getBoundingClientRect();
    return {
      deckPosition: getComputedStyle(document.querySelector('.deck')).position,
      deckBottom: deck.bottom,
      stageBottom: stage.bottom,
      railTop: rail.top,
      viewport: window.innerHeight
    };
  })()`);
  check('the type deck floats at the bottom', mobileLayout.deckPosition === 'fixed' && mobileLayout.deckBottom <= mobileLayout.viewport + 1 && mobileLayout.deckBottom > mobileLayout.viewport - 72, JSON.stringify(mobileLayout));
  check('reading rail stacks below the chart on mobile', mobileLayout.railTop >= mobileLayout.stageBottom - 1, JSON.stringify(mobileLayout));
  const mobileLabel = await edge.evaluate(`(() => {
    const node = document.querySelector('#chart-bar .axis-label');
    return node ? node.getBoundingClientRect().height : 0;
  })()`);
  check('chart labels stay legible on a phone', mobileLabel >= 6.5, String(mobileLabel));

  await edge.send('Emulation.setDeviceMetricsOverride', {
    width: 320, height: 720, deviceScaleFactor: 2, mobile: true
  });
  await sleep(300);
  const narrow = await edge.evaluate(`({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    switchScroll: document.querySelector('#type-buttons').scrollWidth,
    switchClient: document.querySelector('#type-buttons').clientWidth
  })`);
  check('no horizontal overflow at 320px', narrow.scrollWidth <= narrow.innerWidth + 1, JSON.stringify(narrow));
  check('tabs remain scrollable at 320px', narrow.switchScroll >= narrow.switchClient, JSON.stringify(narrow));

  await edge.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
  });
  await sleep(250);
  const themeRadii = await edge.evaluate(`(() => {
    const out = {};
    ['editorial', 'brutal', 'glass'].forEach((theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      out[theme] = getComputedStyle(document.documentElement).getPropertyValue('--radius-card').trim();
    });
    out.glassArt = getComputedStyle(document.body).getPropertyValue('--bg-art').trim();
    return out;
  })()`);
  check('directional themes still reach the token layer', themeRadii.editorial === '0px' && themeRadii.brutal === '14px' && themeRadii.glass === '20px', JSON.stringify(themeRadii));
  check('glass keeps its aurora background layer', themeRadii.glassArt.length > 10, themeRadii.glassArt.slice(0, 40));

  await edge.evaluate("document.documentElement.setAttribute('data-theme', 'bright')");
  await sleep(140);
  const brightStroke = await edge.evaluate("getComputedStyle(document.querySelector('#chart-line .line-path')).stroke");
  await edge.evaluate("document.documentElement.setAttribute('data-theme', 'dark')");
  await sleep(140);
  const dark = await edge.evaluate(`({
    stroke: getComputedStyle(document.querySelector('#chart-line .line-path')).stroke,
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
