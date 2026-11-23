// Result-oriented runtime verification for the built site.
//
//   node tests/verify_runtime.mjs
//   node tests/verify_runtime.mjs --only phonics
//   node tests/verify_runtime.mjs --skip-pages      # playback only
//   node tests/verify_runtime.mjs --skip-playback   # page crawl only
//
// One headless Edge.  First every page is opened at phone width and checked
// for console errors, failed requests, blank output and horizontal overflow.
// Then each app is driven through a real playback case using the element's own
// declared start/end times, with audio served from build/cloudflare-audio
// instead of the production CDN.  No content counts or pixel snapshots.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchEdge } from '../tools/edge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SITE = resolve(ROOT, argOf('--dir', 'build/cloudflare-site'));
const AUDIO = resolve(ROOT, argOf('--audio', 'build/cloudflare-audio'));
const FALLBACK = argOf('--fallback', null);
const ONLY = argOf('--only', null);
const LIMIT = Number(argOf('--limit', '0')) || 0;
const SKIP_PAGES = args.includes('--skip-pages');
const SKIP_PLAYBACK = args.includes('--skip-playback');
const LOAD_IMAGES = args.includes('--load-images');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const TEXT_EXT = new Set(['.html', '.css', '.js', '.mjs', '.json']);
const AUDIO_PREFIX = 'https://npesl-audio.pages.dev/audio/';
const AUDIO_PREFIX_HTTP = 'http://npesl-audio.pages.dev/audio/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listPages(dir, base = '') {
  const out = [];
  for (const entry of readdirSync(join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listPages(dir, rel));
    else if (entry.name.endsWith('.html')) out.push(rel);
  }
  return out.sort();
}

const server = createServer(async (req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel.startsWith('/__audio/')) {
    const target = join(AUDIO, 'audio', rel.slice('/__audio/'.length));
    try {
      const buf = await readFile(target);
      res.writeHead(200, {
        'content-type': MIME[extname(target)] || 'application/octet-stream',
        'content-length': buf.length,
      });
      res.end(buf);
      return;
    } catch {
      res.writeHead(404);
      res.end('not found');
      return;
    }
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const candidates = [rel, rel + '.html', rel + '/index.html'];
  for (const base of [SITE, FALLBACK].filter(Boolean)) {
    for (const candidate of candidates) {
      let buf;
      try {
        buf = await readFile(join(base, candidate.replace(/^\/+/, '')));
      } catch {
        continue;
      }
      const type = MIME[extname(candidate)] || 'application/octet-stream';
      if (TEXT_EXT.has(extname(candidate))) {
        let text = buf.toString('utf8');
        text = text.replaceAll(AUDIO_PREFIX, '/__audio/')
          .replaceAll(AUDIO_PREFIX_HTTP, '/__audio/');
        res.writeHead(200, {
          'content-type': type,
          'content-length': Buffer.byteLength(text),
        });
        res.end(text);
        return;
      }
      res.writeHead(200, { 'content-type': type, 'content-length': buf.length });
      res.end(buf);
      return;
    }
  }
  res.writeHead(404);
  res.end('not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const edge = await launchEdge({ name: `edge-verify-${process.pid}`, url: 'about:blank' });
const { send, ws } = edge;
const evaluate = edge.evaluate;

let pageErrors = [];
let lastNav = null;
const addError = (message) => {
  if (/favicon\.ico/.test(message)) return;
  if (pageErrors.length < 20) pageErrors.push(message);
};
edge.onEvent((msg) => {
  if (msg.method === 'Page.frameNavigated' && !msg.params.frame.parentId) {
    lastNav = msg.params.frame.url;
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    addError(`JS ${d.text}: ${d.exception?.description || ''}`);
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    addError(`console ${msg.params.entry.text}`);
  } else if (msg.method === 'Network.loadingFailed') {
    const d = msg.params;
    if (d.errorText && !/ERR_ABORTED|cancelled|ERR_BLOCKED_BY_CLIENT/i.test(d.errorText)) {
      addError(`网络 ${d.errorText} ${d.requestId}`);
    }
  } else if (msg.method === 'Network.responseReceived') {
    const r = msg.params.response;
    if (r.status >= 400) addError(`HTTP ${r.status} ${r.url}`);
  }
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');
if (!LOAD_IMAGES) {
  // 静态层已经验证每张图片存在；运行时没必要把 1,395 张 webp 全下载一遍。
  // 卡片有固定的 aspect-ratio，屏蔽图片不会改变布局与溢出判断。
  await send('Network.setBlockedURLs', {
    urls: ['*.webp', '*.png', '*.jpg', '*.jpeg', '*.gif', '*.ico'],
  });
}
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 780, deviceScaleFactor: 2, mobile: true,
});

const HOOK = `(() => {
  window.__played = window.__played || [];
  window.__mediaErrors = window.__mediaErrors || [];
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    window.__played.push(this);
    window.__lastAudio = this;
    return orig.apply(this, arguments);
  };
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'MEDIA' || t.tagName === 'AUDIO')) {
      window.__mediaErrors.push((t.currentSrc || t.src || '') + ' ' + (t.error && t.error.code));
    }
  }, true);
})();`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

async function goto(path) {
  pageErrors = [];
  lastNav = null;
  await send('Page.navigate', { url: BASE + path });
  await sleep(100);
  for (let i = 0; i < 120; i++) {
    try {
      const state = await evaluate('({ ready: document.readyState, url: location.href })');
      // 级别索引页会跳到 /conversation/#a1，不能要求原 pathname。
      if (state.ready === 'complete' && lastNav && lastNav.startsWith(BASE)) break;
      if (state.ready === 'complete' && state.url.startsWith(BASE) && path === '/') break;
    } catch {}
    await sleep(60);
  }
  await sleep(100);
}

const waitFor = async (expression, timeout = 8000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await evaluate(expression)) return true;
    } catch {}
    await sleep(100);
  }
  return false;
};

const click = (selector) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  el.click();
  return true;
})()`);

const started = (timeout = 10000) => waitFor(
  '!!(window.__lastAudio && !window.__lastAudio.paused'
  + ' && window.__lastAudio.currentTime > 0.03)', timeout);

const audioState = () => evaluate(`(() => {
  const a = window.__lastAudio;
  return a ? {
    t: a.currentTime, paused: a.paused,
    src: a.currentSrc || a.src,
    errors: (window.__mediaErrors || []).slice(-3),
  } : null;
})()`);

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(12)} ${detail}`);
}

// ---------------------------------------------------------------- page crawl
// 先跑点读再全站巡检：连续导航两百多页之后，Edge 的媒体播放会退化，
// 播放断言会拿到 null。巡检放最后不影响它自己的 console/溢出检查。
async function crawlPages() {
  const pages = listPages(SITE);
  const slice = LIMIT ? pages.slice(0, LIMIT) : pages;
  let bad = 0;
  for (let i = 0; i < slice.length; i++) {
    const rel = slice[i];
    const pageStart = Date.now();
    await goto('/' + rel);
    const pageMs = Date.now() - pageStart;
    const info = await evaluate(`(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      text: document.body.innerText.trim().length,
      title: document.title,
    }))()`);
    const problems = [];
    if (!info || info.text < 20) problems.push('页面几乎为空');
    if (info && info.overflow > 1) problems.push(`手机宽度横向溢出 ${info.overflow}px`);
    if (pageErrors.length) problems.push(pageErrors.slice(0, 2).join(' | '));
    if (problems.length) {
      bad += 1;
      if (bad <= 12) console.log(`FAIL  page ${rel}  ${problems.join(' | ')}`);
    }
    if (pageMs > 1800) console.log(`… slow ${rel} ${pageMs}ms`);
    if ((i + 1) % 25 === 0) console.log(`… 已检查 ${i + 1}/${slice.length} 页`);
  }
  record('pages', bad === 0, `${slice.length - bad}/${slice.length} 页通过，失败 ${bad}`);
}

// ---------------------------------------------------------------- playback
const probeFailures = [];
async function probe(name, fn) {
  if (ONLY && name !== ONLY) return;
  try {
    const r = await fn();
    record(name, r.ok, r.detail);
    if (!r.ok) probeFailures.push(name);
  } catch (err) {
    const detail = String(err.message || err).replace(/\s+/g, ' ').slice(0, 240);
    record(name, false, detail);
    probeFailures.push(name);
  }
}

async function probePhonics() {
  await goto('/phonics/lessons/01-i.html');
  if (!await click('button.chunk')) return { ok: false, detail: '没有 chunk 按钮' };
  const ok1 = await started();
  const a1 = await audioState();
  const end = await evaluate("parseFloat(document.querySelector('button.chunk')?.dataset.endF) || 0");
  const firstOk = ok1 && a1 && a1.t > 0 && (!end || a1.t <= end + 1.2)
    && (!a1.errors || a1.errors.length === 0);
  await goto('/phonics/lessons/01-i.html');
  await evaluate("document.querySelector('#voiceSeg [data-voice=\"m\"]')?.click()");
  const maleStart = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button.chunk')]
      .find((x) => parseFloat(x.dataset.startM) > 0.1);
    if (!b) return null;
    b.setAttribute('data-probe', '1');
    return parseFloat(b.dataset.startM);
  })()`);
  if (maleStart === null) return { ok: false, detail: '没有男声中段' };
  await click('button.chunk[data-probe="1"]');
  const ok2 = await started();
  const a2 = await audioState();
  const maleOk = ok2 && a2 && /-m\.mp3/.test(a2.src || '') && a2.t >= maleStart - 0.2
    && (!a2.errors || a2.errors.length === 0);
  return {
    ok: firstOk && maleOk,
    detail: `f t=${a1?.t?.toFixed(2)} end=${end} · m t=${a2?.t?.toFixed(2)} want≥${maleStart}`,
  };
}

async function probeIpa() {
  await goto('/ipa/');
  const info = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button.word')]
      .find((x) => parseFloat(x.getAttribute('data-start-f')) > 0
        && parseFloat(x.getAttribute('data-start-m')) > 0);
    if (!b) return null;
    b.setAttribute('data-probe', '1');
    return {
      f: parseFloat(b.getAttribute('data-start-f')),
      m: parseFloat(b.getAttribute('data-start-m')),
    };
  })()`);
  if (!info) return { ok: false, detail: '没有中段录音可点' };
  await click('button.word[data-probe="1"]');
  const ok1 = await started();
  const a1 = await audioState();
  await evaluate(`(() => {
    const b = document.querySelector('button.word[data-probe="1"]');
    const v = b && b.closest('.card')?.querySelector('.voice button[data-voice="m"]');
    if (v) v.click();
  })()`);
  await click('button.word[data-probe="1"]');
  const ok2 = await started();
  const a2 = await audioState();
  const ok = ok1 && ok2 && a1 && a2
    && a1.t >= info.f - 0.2 && a2.t >= info.m - 0.2 && a2.src !== a1.src
    && (!a1.errors || a1.errors.length === 0) && (!a2.errors || a2.errors.length === 0);
  return { ok, detail: `f t=${a1?.t?.toFixed(2)} want≥${info.f} · m t=${a2?.t?.toFixed(2)} want≥${info.m}` };
}

async function probeDrill() {
  await goto('/drill/');
  if (!await waitFor("!!document.querySelector('#gen')", 8000)) {
    return { ok: false, detail: '没有生成按钮' };
  }
  await click('#gen');
  if (!await waitFor("!!document.querySelector('#reveal') && !document.querySelector('#reveal').hidden", 6000)) {
    return { ok: false, detail: '没有显示英文按钮' };
  }
  await click('#reveal');
  if (!await waitFor("!!document.querySelector('#answers .playBtn')", 6000)) {
    return { ok: false, detail: '没有播放按钮' };
  }
  const start = await evaluate(`(() => {
    const b = [...document.querySelectorAll('#answers .playBtn')].pop();
    if (!b) return null;
    b.setAttribute('data-probe', '1');
    const at = parseFloat(b.dataset.start);
    return isFinite(at) ? at : null;
  })()`);
  if (start === null) return { ok: false, detail: '播放按钮没有时间偏移' };
  await click('#answers .playBtn[data-probe="1"]');
  const ok = await started();
  const a = await audioState();
  return {
    ok: ok && a && a.t >= start - 0.2 && (!a.errors || a.errors.length === 0),
    detail: `t=${a?.t?.toFixed(2)} want≥${start}`,
  };
}

async function probeConversationAt(path) {
  await goto(path);
  const info = await evaluate(`(() => {
    const b = [...document.querySelectorAll('.story .s.ktv')]
      .find((x) => parseFloat(x.getAttribute('data-start-f')) > 0);
    if (!b) return null;
    b.setAttribute('data-probe', '1');
    return {
      start: parseFloat(b.getAttribute('data-start-f')),
      end: parseFloat(b.getAttribute('data-end-f')),
      text: b.getAttribute('data-text'),
    };
  })()`);
  if (!info) return { ok: false, detail: '没有逐词句子' };
  await click('.story .s.ktv[data-probe="1"]');
  const okStart = await started(15000);
  const dock = await waitFor("!!document.querySelector('[data-kplayer]')"
    + " && !document.querySelector('[data-kplayer]').hidden", 8000);
  const lit = await waitFor("!!document.querySelector('.story .s.ktv.playing .w.read')", 8000);
  const duration = Math.max(info.end - info.start, 0.4);
  const stopped = await waitFor('!!(window.__lastAudio && window.__lastAudio.paused)',
    Math.ceil(duration / 0.7 * 1000) + 3000);
  const a = await audioState();
  const spanOk = a && a.t >= info.start - 0.2 && a.t <= info.end + 1.2;
  const ok = okStart && dock && lit && stopped && spanOk
    && (!a?.errors || a.errors.length === 0);
  if (await evaluate("!!document.querySelector('[data-kp-close]')")) {
    await click('[data-kp-close]');
  }
  return {
    ok,
    detail: `span=${info.start.toFixed(2)}-${info.end.toFixed(2)} t=${a?.t?.toFixed(2)} `
      + `dock=${dock} word=${lit} stopped=${stopped}`,
  };
}

const probeConversation = () => probeConversationAt('/conversation/a1/01-01-family.html');
const probeEslse = () => probeConversationAt('/conversation/eslse/01-01-family.html');

async function probePlayAll() {
  await goto('/conversation/a1/01-01-family.html');
  if (!await click('[data-play-all]')) return { ok: false, detail: '没有朗读全文' };
  const playing = await waitFor("!!document.querySelector('.story .s.playing')", 15000);
  const first = await evaluate("(document.querySelector('.story .s.playing') || {}).dataset?.text || ''");
  const advanced = await waitFor(`(() => {
    const b = document.querySelector('.story .s.playing');
    return !!(b && b.dataset.text !== ${JSON.stringify(first)});
  })()`, 15000);
  await click('[data-play-all]');
  const stopped = await waitFor(`(() => {
    const b = document.querySelector('[data-play-all]');
    return b && b.getAttribute('aria-pressed') === 'false'
      && window.__lastAudio && window.__lastAudio.paused;
  })()`, 3000);
  return { ok: playing && advanced && stopped, detail: `play=${playing} advance=${advanced} stop=${stopped}` };
}

async function probeCollocation() {
  await goto('/collocation/');
  if (!await click('.prow')) return { ok: false, detail: '没有词条行' };
  const hasCard = await waitFor("!!document.querySelector('.card .say')", 5000);
  if (!hasCard) return { ok: false, detail: '卡片没有可播放例句' };
  await click('.card .say');
  const ok = await started(10000);
  await sleep(300);
  const last = await evaluate(`(() => {
    const l = window.__phLast;
    if (!l) return null;
    return { s: l.s, en: l.en, t: l.t, mode: l.mode };
  })()`);
  const a = await audioState();
  const tail = last && isFinite(last.s) && isFinite(last.en)
    ? (last.mode === 'ha' ? (a && a.t) : last.t)
    : (a && a.t);
  const spanOk = !last || !isFinite(last.s) || !isFinite(last.en)
    || (tail >= last.s - 0.3 && tail <= last.en + 1.2);
  return {
    ok: ok && spanOk && (!a?.errors || a.errors.length === 0),
    detail: last ? `span=${last.s?.toFixed(2)}-${last.en?.toFixed(2)} tail=${tail?.toFixed(2)}`
      : `t=${a?.t?.toFixed(2)}`,
  };
}

async function probePhenomena() {
  await goto('/phenomena/01-your-stop-is-next.html');
  const start = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button.line')]
      .find((x) => parseFloat(x.getAttribute('data-start-f')) > 0);
    if (!b) return null;
    b.setAttribute('data-probe', '1');
    return parseFloat(b.getAttribute('data-start-f'));
  })()`);
  if (start === null) return { ok: false, detail: '没有中段句子' };
  await click('button.line[data-probe="1"]');
  const ok = await started(10000);
  const a = await audioState();
  return {
    ok: ok && a && a.t >= start - 0.2 && (!a.errors || a.errors.length === 0),
    detail: `t=${a?.t?.toFixed(2)} want≥${start}`,
  };
}

async function probeVisualVocabulary() {
  await goto('/visual-vocabulary/body-parts/');
  if (!await click('.card')) return { ok: false, detail: '没有词卡' };
  const ok1 = await started(8000);
  const a1 = await audioState();
  await evaluate("document.querySelector('[data-voice=\"c\"]')?.click()");
  const cards = await evaluate("document.querySelectorAll('.card').length");
  if (cards < 2) return { ok: false, detail: '词卡不足两张' };
  await evaluate("document.querySelectorAll('.card')[1].click()");
  const ok2 = await started(8000);
  const a2 = await audioState();
  const ok = ok1 && ok2 && a1 && a2
    && /\/audio\/h2\//.test(a1.src || '') && /\/audio\/c\//.test(a2.src || '')
    && (!a1.errors || a1.errors.length === 0) && (!a2.errors || a2.errors.length === 0);
  return { ok, detail: `h2 t=${a1?.t?.toFixed(2)} · c t=${a2?.t?.toFixed(2)}` };
}

async function probeKaraoke() {
  await goto('/conversation/a1/01-01-family.html');
  const span = await evaluate(`(() => {
    const b = document.querySelector('.story .s.ktv');
    if (!b) return null;
    return {
      start: parseFloat(b.getAttribute('data-start-f')),
      end: parseFloat(b.getAttribute('data-end-f')),
    };
  })()`);
  if (!span) return { ok: false, detail: '没有逐词句子' };
  const target = (span.start + span.end) / 2;
  if (!await click('.story .s.ktv')) return { ok: false, detail: '没有逐词句子' };
  const okStart = await started(12000);
  const dock = await waitFor("!!document.querySelector('[data-kplayer]')"
    + " && !document.querySelector('[data-kplayer]').hidden", 8000);
  const lit = await waitFor("!!document.querySelector('.story .s.ktv.playing .w.read')", 8000);
  await click('[data-kp-toggle]');
  const paused = await waitFor('!!(window.__lastAudio && window.__lastAudio.paused)', 3000);
  const seek = await evaluate(`(() => {
    const r = document.querySelector('[data-kp-range]');
    if (!r) return null;
    r.value = String(Number(r.max) / 2);
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
    return { max: Number(r.max) };
  })()`);
  await sleep(150);
  const moved = await evaluate('window.__lastAudio ? window.__lastAudio.currentTime : -1');
  await click('[data-kp-toggle]');
  const resumed = await waitFor(`!!(window.__lastAudio && !window.__lastAudio.paused
    && window.__lastAudio.currentTime > ${target + 0.04})`, 3000);
  await click('[data-kp-close]');
  const closed = await waitFor("document.querySelector('[data-kplayer]').hidden", 2000);
  const seekOk = seek && Math.abs(moved - target) < 0.35;
  return {
    ok: okStart && dock && lit && paused && seekOk && resumed && closed,
    detail: `dock=${dock} word=${lit} pause=${paused} seek=${Number(moved).toFixed(2)}/${target.toFixed(2)} `
      + `resume=${resumed} close=${closed}`,
  };
}

async function probeLevels() {
  await goto('/conversation/');
  const path0 = await evaluate('location.pathname');
  const outcomes = [];
  for (const level of ['b1', 'eslse', 'a1']) {
    const r = await evaluate(`(() => {
      const b = document.querySelector('.level[data-level="${level}"]');
      if (!b) return null;
      b.click();
      return {
        hash: location.hash,
        path: location.pathname,
        visible: [...document.querySelectorAll('.level-pane')]
          .filter((p) => !p.hidden).map((p) => p.dataset.level),
        current: (document.querySelector('.level[aria-current="page"]') || {})
          .getAttribute('data-level'),
      };
    })()`);
    if (!r) return { ok: false, detail: `缺少级别 ${level}` };
    if (r.path !== path0 || r.hash !== '#' + level || r.current !== level
      || r.visible.length !== 1 || r.visible[0] !== level) {
      outcomes.push(`${level}:${r.path}${r.hash}/${r.visible.join('')}`);
    }
  }
  return { ok: outcomes.length === 0, detail: outcomes.join(' ') || '三级切换正常' };
}

async function probeZh() {
  await goto('/conversation/a1/01-01-family.html');
  const btn = '[data-zh-for="vocab"]';
  if (!await evaluate(`!!document.querySelector('${btn}')`)) {
    return { ok: false, detail: '没有词汇中文开关' };
  }
  const before = await evaluate("getComputedStyle(document.querySelector('.vocab-zh')).display");
  await click(btn);
  const off = await waitFor("getComputedStyle(document.querySelector('.vocab-zh')).display === 'none'", 2000);
  const pressedOff = await evaluate(`document.querySelector('${btn}').getAttribute('aria-pressed')`);
  await click(btn);
  const on = await waitFor("getComputedStyle(document.querySelector('.vocab-zh')).display !== 'none'", 2000);
  return {
    ok: before !== 'none' && off && pressedOff === 'false' && on,
    detail: `on→${off ? 'off' : '?'} (${pressedOff}) →on=${on}`,
  };
}

async function probeFilters() {
  await goto('/phenomena/');
  const r = await evaluate(`(() => {
    const chip = [...document.querySelectorAll('.chips button[data-cat]')]
      .find((b) => b.getAttribute('data-cat') !== 'all');
    if (!chip) return null;
    const cat = chip.getAttribute('data-cat');
    chip.click();
    const shown = [...document.querySelectorAll('.group')]
      .filter((g) => g.style.display !== 'none').map((g) => g.getAttribute('data-cat'));
    const pressed = (document.querySelector('.chips button[aria-pressed="true"]') || {})
      .getAttribute('data-cat');
    document.querySelector('.chips button[data-cat="all"]').click();
    const restored = [...document.querySelectorAll('.group')]
      .filter((g) => g.style.display !== 'none').length;
    return { cat, shown, pressed, restored, total: document.querySelectorAll('.group').length };
  })()`);
  if (!r) return { ok: false, detail: '没有分类 chip' };
  return {
    ok: r.shown.length === 1 && r.shown[0] === r.cat && r.pressed === r.cat
      && r.restored === r.total,
    detail: `${r.cat}:${r.shown.join('')} restore=${r.restored}/${r.total}`,
  };
}

async function probeOpposites() {
  await goto('/collocation/');
  const pick = await evaluate(`(() => {
    const D = window.COLLOCATION_INDEX;
    if (!D) return null;
    for (let i = 0; i < D.entries.length; i++) {
      if (D.entries[i].opp && D.entries[i].opp.length) {
        return { i, j: D.entries[i].opp[0].i };
      }
    }
    return null;
  })()`);
  if (!pick) return { ok: false, detail: '没有反义数据' };
  await click(`.prow[data-i="${pick.i}"]`);
  const btn = `.card[data-card="${pick.i}"] .opp-btn[data-opp-i="${pick.j}"]`;
  if (!await waitFor(`!!document.querySelector('${btn}')`, 3000)) {
    return { ok: false, detail: '来源卡片没有反义按钮' };
  }
  await click(btn);
  const jumped = await waitFor(
    `!!document.querySelector('.card[data-card="${pick.j}"] [data-opp-return-inline]')`, 4000);
  await click(`.card[data-card="${pick.j}"] [data-opp-return-inline]`);
  const back = await waitFor(`!!document.querySelector('.card[data-card="${pick.i}"]')`, 4000);
  return { ok: jumped && back, detail: `jump=${jumped} back=${back}` };
}

async function probeThemes() {
  const pages = ['/', '/conversation/a1/01-01-family.html', '/collocation/', '/drill/'];
  const broken = [];
  for (const page of pages) {
    for (const theme of ['light', 'dark']) {
      await evaluate(`localStorage.setItem('npesl-theme', ${JSON.stringify(theme)})`);
      await goto(page);
      const info = await evaluate(`({
        theme: document.documentElement.getAttribute('data-theme'),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      })`);
      if (info.theme !== theme || info.overflow > 1) {
        broken.push(`${page} ${theme}:${info.theme}/${info.overflow}`);
      }
    }
  }
  await evaluate("localStorage.setItem('npesl-theme','light')");
  return { ok: broken.length === 0, detail: broken.join(' ') || '4 页 × 2 主题' };
}

async function probePhonicsPlayAll() {
  await goto('/phonics/lessons/01-i.html');
  if (!await click('#playAll')) return { ok: false, detail: '没有连播按钮' };
  const on = await waitFor("document.querySelector('#playAll')?.getAttribute('aria-pressed') === 'true'", 3000)
    && await started(8000);
  await click('#playAll');
  const off = await waitFor("document.querySelector('#playAll')?.getAttribute('aria-pressed') === 'false'", 3000)
    && await waitFor('!!(window.__lastAudio && window.__lastAudio.paused)', 3000);
  return { ok: on && off, detail: `play=${on} stop=${off}` };
}

async function probePhenomenaPlayAll() {
  await goto('/phenomena/01-your-stop-is-next.html');
  if (!await click('[data-play-all]')) return { ok: false, detail: '没有连播按钮' };
  const on = await waitFor("document.querySelector('[data-play-all]')?.getAttribute('aria-pressed') === 'true'", 3000)
    && await waitFor("!!document.querySelector('.line.playing')", 8000);
  await click('[data-play-all]');
  const off = await waitFor(`(() => {
    const b = document.querySelector('[data-play-all]');
    return b && b.getAttribute('aria-pressed') === 'false'
      && !document.querySelector('.line.playing');
  })()`, 3000);
  return { ok: on && off, detail: `play=${on} stop=${off}` };
}

async function probeBack() {
  await goto('/conversation/a1/01-01-family.html');
  const info = await evaluate(`(() => {
    const a = document.querySelector('.npesl-back');
    if (!a) return null;
    const u = new URL(a.getAttribute('href'), location.href);
    return { path: u.pathname, hash: u.hash };
  })()`);
  if (!info) return { ok: false, detail: '没有返回链接' };
  return {
    ok: info.path === '/conversation/' && info.hash === '#a1',
    detail: info.path + info.hash,
  };
}

async function probeMobile() {
  await goto('/conversation/a1/01-01-family.html');
  if (!await click('.story .s.ktv')) return { ok: false, detail: '没有逐词句子' };
  const dock = await waitFor("!!document.querySelector('[data-kplayer]')"
    + " && !document.querySelector('[data-kplayer]').hidden", 8000);
  const box = await evaluate(`(() => {
    const fab = document.querySelector('.npesl-theme-fab');
    const dock = document.querySelector('[data-kplayer]');
    if (!fab || !dock || dock.hidden) return null;
    const a = fab.getBoundingClientRect();
    const b = dock.getBoundingClientRect();
    return {
      visible: getComputedStyle(fab.parentElement).visibility !== 'hidden'
        && Number(getComputedStyle(fab.parentElement).opacity) > 0.9,
      overlap: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
    };
  })()`);
  if (await evaluate("!!document.querySelector('[data-kp-close]')")) {
    await click('[data-kp-close]');
  }
  return {
    ok: dock && box && box.visible && !box.overlap,
    detail: box ? `dock=${dock} fab=${box.visible} overlap=${box.overlap}` : `dock=${dock}`,
  };
}

async function probeOverlay() {
  await evaluate("localStorage.setItem('npesl-theme','light')");
  await goto('/drill/');
  if (!await click('#browse')) return { ok: false, detail: '没有浏览按钮' };
  const opaque = await waitFor(`(() => {
    const s = getComputedStyle(document.querySelector('.browserSheet'));
    const m = s.backgroundColor.match(/[\\d.]+/g);
    return !!m && (m.length < 4 || Number(m[3]) === 1);
  })()`, 4000);
  return { ok: opaque, detail: `sheetOpaque=${opaque}` };
}

async function probeVisualVocabularyScene() {
  await goto('/visual-vocabulary/home/room-study.html');
  const target = await evaluate(`(() => {
    const chips = [...document.querySelectorAll('.vv-words [data-box]')];
    if (!chips.length) return null;
    const boxes = chips.map(c => ({
      slug: c.dataset.vvWord,
      b: c.dataset.box.split(',').map(Number),
    }));
    const me = boxes[0];
    // 找一个只落在这件物件框里的点（避开套在里面的小物件）
    for (const fx of [0.5, 0.25, 0.75, 0.15, 0.85]) {
      for (const fy of [0.5, 0.25, 0.75, 0.15, 0.85]) {
        const x = me.b[0] + (me.b[2] - me.b[0]) * fx;
        const y = me.b[1] + (me.b[3] - me.b[1]) * fy;
        const clash = boxes.some(o => o !== me
          && x >= o.b[0] && x <= o.b[2] && y >= o.b[1] && y <= o.b[3]);
        if (!clash) return { word: me.slug, x, y };
      }
    }
    return { word: me.slug, x: (me.b[0] + me.b[2]) / 2, y: (me.b[1] + me.b[3]) / 2 };
  })()`);
  if (!target) return { ok: false, detail: '没有带范围框的词条' };

  const hit = await evaluate(`(() => {
    const stage = document.querySelector('.vv-stage');
    const r = stage.getBoundingClientRect();
    const x = r.left + r.width * ${target.x} / 100;
    const y = r.top + r.height * ${target.y} / 100;
    stage.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    const en = document.querySelector('[data-vv-en]');
    return { text: en ? en.textContent : '', hidden: en ? en.hidden : true };
  })()`);
  const played = await started(8000);
  return {
    ok: hit.text === target.word && played,
    detail: `${target.word} @${target.x.toFixed(0)},${target.y.toFixed(0)} -> ${hit.text} audio=${played}`,
  };
}

if (!SKIP_PLAYBACK) {
  await probe('phonics', probePhonics);
  await probe('phonics-all', probePhonicsPlayAll);
  await probe('ipa', probeIpa);
  await probe('drill', probeDrill);
  await probe('overlay', probeOverlay);
  await probe('conversation', probeConversation);
  await probe('eslse', probeEslse);
  await probe('ktv', probeKaraoke);
  await probe('play-all', probePlayAll);
  await probe('levels', probeLevels);
  await probe('back', probeBack);
  await probe('mobile', probeMobile);
  await probe('zh', probeZh);
  await probe('filters', probeFilters);
  await probe('opposites', probeOpposites);
  await probe('collocation', probeCollocation);
  await probe('phenomena', probePhenomena);
  await probe('phenomena-all', probePhenomenaPlayAll);
  await probe('vv', probeVisualVocabulary);
  await probe('vv-scene', probeVisualVocabularyScene);
  await probe('themes', probeThemes);
}

if (!SKIP_PAGES) await crawlPages();

try { ws.close(); } catch {}
edge.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
