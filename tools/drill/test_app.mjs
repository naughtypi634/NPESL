// Headless Edge smoke test for the generated single-file app.
// Usage: node tools/drill/test_app.mjs [--serve] [--screenshot]
//   --serve  发布目录用本地 HTTP 打开，音档能正常加载（file:// 下音频会 404）
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EDGE_BY_PLATFORM = {
  win32: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  darwin: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
};
const EDGE = process.env.EDGE_PATH || EDGE_BY_PLATFORM[process.platform];
const APP = process.env.APP_PATH || join(ROOT, 'apps/drill/中译英问题生成器.html');
const APP_NAME = APP.split(/[\\/]/).pop();
const PORT = 9300 + (process.pid % 500);
const PROFILE = join(ROOT, 'build', 'drill-tests', `edge-profile-${process.pid}`);

let testServer = null;
const url = await (async () => {
  if (!process.argv.includes('--serve')) return pathToFileURL(APP).href;
  const types = { '.html': 'text/html; charset=utf-8', '.mp3': 'audio/mpeg' };
  const root = dirname(APP);
  const server = createServer(async (req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || APP_NAME;
    if (rel === 'favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      const body = await readFile(join(root, rel));
      res.writeHead(200, { 'content-type': types[extname(rel)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  testServer = server;
  return `http://127.0.0.1:${server.address().port}/${encodeURIComponent(APP_NAME)}`;
})();
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, url,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && decodeURIComponent(t.url).includes(APP_NAME));
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('DevTools target never appeared');
}

let ws;
try {
  const page = await target();
  console.error('target:', page.url);
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.text + ': ' + (msg.params.exceptionDetails.exception?.description || ''));
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push(msg.params.entry.text);
    }
  };

  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Runtime.enable');
  await send('Log.enable');

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result.result.value;
  };

  for (let i = 0; i < 40; i++) {
    if (await evaluate('document.readyState') === 'complete') break;
    await sleep(100);
  }
  for (let i = 0; i < 50; i++) {
    if (await evaluate("!!document.querySelector('.masthead')")) break;
    await sleep(100);
  }
  await sleep(300);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(400);

  const out = await evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const $ = (id) => document.getElementById(id);
    const result = {};
    result.h1 = document.querySelector('h1').textContent.trim();
    result.backCount = document.querySelectorAll('.npesl-back').length;
    result.backText = document.querySelector('.npesl-back')?.textContent.trim();
    result.backHref = document.querySelector('.npesl-back')?.getAttribute('href');
    result.catButtons = [...document.querySelectorAll('#cats .catBtn')].map((b) => b.textContent);
    result.activeCat = document.querySelector('#cats .catBtn[aria-pressed="true"]')?.dataset.cat;
    result.emptyBrowse = !!$('browse');
    $('browse').click();
    await sleep(250);
    result.emptyBrowseOpens = !$('browser').hidden;
    result.emptyBrowseMeta = $('browserMeta').textContent;
    $('browserClose').click();
    await sleep(250);
    $('gen').click();
    await sleep(80);
    result.zh1 = $('zh').textContent;
    result.scene1 = $('scene').textContent;
    result.chip1 = $('chip').textContent;
    result.cardVisible = !$('card').hidden;
    result.emptyDisplay = getComputedStyle($('empty')).display;
    result.cardDisplay = getComputedStyle($('card')).display;
    result.answersHiddenBeforeReveal = $('answers').hidden;
    result.revealVisible = !$('reveal').hidden;
    result.prevDisabledInitial = $('prev').disabled;
    result.prevLabel = $('prev').textContent.trim();
    $('reveal').click();
    await sleep(80);
    result.revealHiddenAfter = $('reveal').hidden;
    result.nextVisible = !$('next').hidden;
    result.answers1 = [...document.querySelectorAll('#answers li')].map((li) => ({
      en: li.querySelector('.en').textContent,
      note: li.querySelector('.note').textContent,
    }));
    result.answersVisible = !$('answers').hidden;
    const firstLi = document.querySelector('#answers li');
    result.playBtns = [...firstLi.querySelectorAll('.playBtn')].map((b) => b.dataset.voice + ':' + b.textContent);
    if (${process.argv.includes('--serve')}) {
      firstLi.querySelector('.playBtn[data-voice="m"]').click();
      await sleep(400);
      result.audioSrc = player.src;
      result.audioErr = player.error ? player.error.code : 0;
      player.pause();
    }
    $('next').click();
    await sleep(80);
    result.zh2 = $('zh').textContent;
    result.activeAfterNext = document.activeElement
      ? (document.activeElement.id || document.activeElement.tagName)
      : 'none';
    result.prevEnabledAfterNext = !$('prev').disabled;
    $('prev').click();
    await sleep(100);
    result.zhAfterPrev = $('zh').textContent;
    result.prevRevealed = !$('answers').hidden;
    result.prevNextVisible = !$('next').hidden;
    result.prevAnswersAfter = [...document.querySelectorAll('#answers li .en')]
      .map((el) => el.textContent);
    result.prevDisabledAtStart = $('prev').disabled;
    $('prev').click();
    await sleep(80);
    result.zhAfterEmptyPrev = $('zh').textContent;

    result.browseLabel = $('browseCount').textContent;
    $('browse').click();
    await sleep(250);
    result.browserOpen = !$('browser').hidden;
    result.browserTitle = $('browserTitle').textContent;
    result.browserMeta = $('browserMeta').textContent;
    result.browserRendered = document.querySelectorAll('#questionList .qItem').length;
    const firstItem = document.querySelector('#questionList .qItem');
    result.firstQ = firstItem.querySelector('.qZh').textContent;
    result.firstScene = firstItem.querySelector('.qScene').textContent;
    result.currentHighlighted = !!document.querySelector('#questionList .qItem[aria-current="true"]');
    const search = $('browserSearch');
    const visibleRows = () => [...document.querySelectorAll('#questionList .qItem')];
    search.value = '公园';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(220);
    result.searchVisible = parseInt($('browserMeta').textContent, 10);
    result.searchRendered = visibleRows().length;
    result.searchFirst = document.querySelector('#questionList .qItem')?.querySelector('.qZh')?.textContent || '';
    result.searchMeta = $('browserMeta').textContent;
    result.searchAllMatch = visibleRows().every((btn) =>
      (btn.querySelector('.qZh').textContent + ' ' + btn.querySelector('.qScene').textContent).includes('公园'));
    search.value = '不存在xyz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(220);
    result.searchNone = parseInt($('browserMeta').textContent, 10);
    result.searchEmptyShown = !$('browserEmpty').hidden;
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(220);
    result.searchReset = parseInt($('browserMeta').textContent, 10);
    result.searchResetMeta = $('browserMeta').textContent;
    const target = [...document.querySelectorAll('#questionList .qItem')]
      .find((b) => b.getAttribute('aria-current') !== 'true');
    result.targetZh = target.querySelector('.qZh').textContent;
    target.click();
    await sleep(350);
    result.browserClosed = $('browser').hidden;
    result.zhFromBrowser = $('zh').textContent;
    result.browserRevealed = !$('answers').hidden;
    result.prevEnabledFromBrowser = !$('prev').disabled;
    $('browse').click();
    await sleep(250);
    result.reopenCurrent = document.querySelector('#questionList .qItem[aria-current="true"] .qZh')?.textContent || '';
    $('browserClose').click();
    await sleep(300);
    result.closedByX = $('browser').hidden;
    const pick = document.querySelectorAll('#cats .catBtn')[1];
    pick.click();
    await sleep(80);
    result.filterChip = $('chip').textContent;
    result.filterValue = pick.dataset.cat;
    result.filterPressed = pick.getAttribute('aria-pressed');
    result.otherPressed = [...document.querySelectorAll('#cats .catBtn')]
      .filter((b) => b !== pick && b.getAttribute('aria-pressed') === 'true').length;
    return result;
  })()`);

  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok, detail });
  check('masthead has only the title', out.h1 === 'Question Drill', out.h1);
  check('back to NPESL button', out.backCount === 1 && out.backText === 'NPESL' &&
    out.backHref === '../', `${out.backCount}/${out.backText}/${out.backHref}`);
  check('category buttons', out.catButtons.length >= 16, `${out.catButtons.length} buttons`);
  check('all category active by default', out.activeCat === 'all', String(out.activeCat));
  check('question generated', out.zh1.length > 0 && out.cardVisible, out.zh1);
  check('empty state actually hidden', out.emptyDisplay === 'none', out.emptyDisplay);
  check('card actually displayed', out.cardDisplay !== 'none', out.cardDisplay);
  check('scene rendered', out.scene1.length > 0, out.scene1);
  check('answers hidden before reveal', out.answersHiddenBeforeReveal === true);
  check('reveal button visible', out.revealVisible === true);
  check('reveal swaps buttons', out.revealHiddenAfter === true && out.nextVisible === true);
  check('2-3 answers revealed', out.answers1.length >= 2 && out.answers1.length <= 3, `${out.answers1.length}`);
  check('every answer has note', out.answers1.every((a) => a.en && a.note.length >= 10), JSON.stringify(out.answers1));
  check('answers visible', out.answersVisible);
  check('every answer has two voice buttons', out.playBtns.join(',') === 'f:女声,m:男声', out.playBtns.join(','));
  if (out.audioSrc !== undefined) {
    check('male button points at its sprite',
      /\/audio\/sprites\/[0-9a-f]+-m\.mp3$/.test(out.audioSrc), out.audioSrc);
    check('clip loads', out.audioErr === 0, `media error ${out.audioErr}`);
  }
  check('next question differs', out.zh2 && out.zh2 !== out.zh1, `${out.zh1} -> ${out.zh2}`);
  check('focus leaves hidden next button', out.activeAfterNext !== 'next', out.activeAfterNext);
  check('prev button present and disabled first', out.prevLabel === '上一题' && out.prevDisabledInitial === true,
    `${out.prevLabel}/${out.prevDisabledInitial}`);
  check('prev enabled after next', out.prevEnabledAfterNext === true);
  check('prev restores previous question', out.zhAfterPrev === out.zh1, `${out.zh2} -> ${out.zhAfterPrev}`);
  check('prev restores revealed answers', out.prevRevealed === true && out.prevNextVisible === true &&
    out.prevAnswersAfter.join('|') === out.answers1.map((a) => a.en).join('|'),
    out.prevAnswersAfter.join(' | '));
  check('prev disabled at start of history', out.prevDisabledAtStart === true);
  check('prev does nothing with empty history', out.zhAfterEmptyPrev === out.zh1, out.zhAfterEmptyPrev);
  check('browse count shown', /1370/.test(out.browseLabel) && out.browseLabel.includes('题'), out.browseLabel);
  check('browse opens the dialog',
    out.browserOpen === true && /1370/.test(out.browserMeta) &&
    out.browserRendered > 0 && out.browserRendered < 60,
    `${out.browserRendered} rendered / ${out.browserMeta}`);
  check('browse header has category and count',
    out.browserTitle === '全部场景' && /1370/.test(out.browserMeta),
    `${out.browserTitle} / ${out.browserMeta}`);
  check('browse shows question and scene separately',
    out.firstQ.length > 0 && out.firstScene.length > 0 && out.firstQ !== out.firstScene,
    `${out.firstQ} | ${out.firstScene}`);
  check('browse highlights the current question', out.currentHighlighted === true);
  check('selecting from browse closes it',
    out.browserClosed === true && out.zhFromBrowser === out.targetZh,
    `${out.targetZh} -> ${out.zhFromBrowser}`);
  check('browser question starts unrevealed with history',
    out.browserRevealed === false && out.prevEnabledFromBrowser === true,
    `${out.browserRevealed}/${out.prevEnabledFromBrowser}`);
  check('reopen highlights the selected question', out.reopenCurrent === out.zhFromBrowser,
    `${out.zhFromBrowser} vs ${out.reopenCurrent}`);
  check('browse closes with the X button', out.closedByX === true);
  check('empty state has a browse button',
    out.emptyBrowse === true && out.emptyBrowseOpens === true && /1370/.test(out.emptyBrowseMeta),
    `${out.emptyBrowse}/${out.emptyBrowseOpens}/${out.emptyBrowseMeta}`);
  check('search filters the list',
    out.searchVisible > 0 && out.searchVisible < 1370 && out.searchAllMatch === true,
    `${out.searchVisible} / ${out.searchFirst}`);
  check('search updates the count', out.searchMeta.includes('/'), out.searchMeta);
  check('search shows the no-results state',
    out.searchNone === 0 && out.searchEmptyShown === true,
    `${out.searchNone}/${out.searchEmptyShown}`);
  check('clearing search restores the list',
    out.searchReset === 1370 && out.searchResetMeta === '1370 个问题',
    `${out.searchReset} / ${out.searchResetMeta}`);
  check('filter applies', out.filterChip === out.filterValue, `${out.filterChip} vs ${out.filterValue}`);
  check('filter button pressed', out.filterPressed === 'true' && out.otherPressed === 0,
    `${out.filterPressed}/${out.otherPressed}`);
  check('no console errors', errors.length === 0, errors.join(' | '));

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  const darkBg = await evaluate('getComputedStyle(document.body).backgroundColor');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  const lightBg = await evaluate('getComputedStyle(document.body).backgroundColor');
  check('dark mode tokens', darkBg === 'rgb(0, 0, 0)', darkBg);
  check('light mode tokens', lightBg === 'rgb(255, 255, 255)', lightBg);

  if (process.argv.includes('--screenshot')) {
    await send('Page.enable');
    await evaluate(`(() => { document.getElementById('reveal').click(); })()`);
    await sleep(400);
    await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });
    await sleep(200);
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(ROOT, 'build', 'drill-tests', 'app-desktop.png'), Buffer.from(shot.result.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(300);
    shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(ROOT, 'build', 'drill-tests', 'app-mobile.png'), Buffer.from(shot.result.data, 'base64'));
    console.log('screenshots written');
  }

  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  —  ' + c.detail : ''}`);
  console.log(`\n${checks.filter((c) => c.ok).length}/${checks.length} checks passed`);
  process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
} finally {
  try { ws?.close(); } catch {}
  if (proc.pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try { proc.kill(); } catch {}
    }
  }
  await sleep(300);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  try { testServer?.close(); } catch {}
}
