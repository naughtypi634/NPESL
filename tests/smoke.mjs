// Headless Edge smoke test for the built site.
//
// Checks, for every app: the page loads without console errors, its playable
// elements exist, and clicking one actually starts audio playback and stops
// where it should.  Run it after every build step — it is the guard that keeps
// the optimization work from quietly breaking playback.
//
//   node tests/smoke.mjs                 # tests build/cloudflare-site
//   node tests/smoke.mjs --dir build/npesl-offline
//   node tests/smoke.mjs --only drill    # run one case
//
// Exit code 0 = all passed.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE_BY_PLATFORM = {
  win32: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  darwin: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
};
const EDGE = process.env.EDGE_PATH || EDGE_BY_PLATFORM[process.platform];
const PORT = 9400 + (process.pid % 400);
const PROFILE = join(ROOT, 'build', `edge-smoke-${process.pid}`);

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SERVE_DIR = resolve(ROOT, argOf('--dir', 'build/cloudflare-site'));
const ONLY = argOf('--only', null);

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
};

const server = createServer(async (req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  // 线上是 Cloudflare Pages 的 pretty URL：/foo 提供 foo.html。
  const candidates = [rel, rel + '.html', rel + '/index.html'];
  for (const candidate of candidates) {
    let buf;
    try {
      buf = await readFile(join(SERVE_DIR, candidate));
    } catch { continue; }
    const type = MIME[extname(candidate)] || 'application/octet-stream';
    // 和线上一致：Cloudflare Pages 的静态资源不支持 Range（Range 被忽略，永远
    // 200 整包）。这里故意也不做 206——否则本机测不出「seek 被夹回开头」这类
    // 只在真站上出现的问题。
    res.writeHead(200, {
      'content-type': type,
      'content-length': buf.length,
    });
    res.end(buf);
    return;
  }
  res.writeHead(404);
  res.end('not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('DevTools target never appeared');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
let errors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.text + ': '
      + (msg.params.exceptionDetails.exception?.description || ''));
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
await send('Page.enable');

// 页面自己的 Audio 对象不在 DOM 里，钩住 play() 才能拿到它。
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
    if (t && t.tagName === 'MEDIA' || (t && t.tagName === 'AUDIO')) {
      window.__mediaErrors.push((t.currentSrc || t.src || '') + ' ' + (t.error && t.error.code));
    }
  }, true);
})();`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description
      || r.result.exceptionDetails.text);
  }
  return r.result.result.value;
};

async function goto(path) {
  errors = [];
  await send('Page.navigate', { url: BASE + path });
  for (let i = 0; i < 100; i++) {
    try {
      if (await evaluate('document.readyState') === 'complete') break;
    } catch {}
    await sleep(60);
  }
  await sleep(250);
}

async function waitFor(expression, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await evaluate(expression)) return true;
    } catch {}
    await sleep(100);
  }
  return false;
}

// 点一下 selector，等音频真的开始走，再读播放位置。
async function playAndProbe(selector, settle = 900) {
  const clicked = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!clicked) return { clicked: false };
  const started = await waitFor('!!(window.__lastAudio && window.__lastAudio.currentTime > 0.03)');
  await sleep(settle);
  return {
    clicked: true,
    started,
    currentTime: await evaluate('window.__lastAudio ? window.__lastAudio.currentTime : -1'),
    src: await evaluate('window.__lastAudio ? (window.__lastAudio.currentSrc || window.__lastAudio.src) : ""'),
    mediaErrors: await evaluate('window.__mediaErrors || []'),
  };
}

// Conversation 页面用的是一整条音频 + 时间偏移，所以不只看出声，
// 还要确认它落在被点那句的区间里（起点对、终点停得住）。
// 点正文第一句（不是从 0 秒开始的标题），才能真正测到 seek。
async function probeConversationPage() {
  const info = await evaluate(`(() => {
    const b = document.querySelector('.story button.s');
    if (!b) return null;
    const start = parseFloat(b.getAttribute('data-start-f'));
    const end = parseFloat(b.getAttribute('data-end-f'));
    b.click();
    return { start, end, text: b.dataset.text };
  })()`);
  if (!info) return { ok: false, detail: '没有可点读的句子' };
  const started = await waitFor('!!(window.__lastAudio && window.__lastAudio.currentTime > 0)');
  const wait = Math.min(Math.max(info.end - info.start, 0.4), 4) * 1000 + 700;
  await sleep(wait);
  // 跨域音频经 CDN 时偶尔比本地慢半拍，等到真正暂停再读位置。
  const paused = await waitFor('!!(window.__lastAudio && window.__lastAudio.paused)', 2500);
  const t = await evaluate('window.__lastAudio ? window.__lastAudio.currentTime : -1');
  const ok = started && paused && t >= info.start - 0.1 && t <= info.end + 0.35;
  return {
    ok,
    detail: `span=${info.start.toFixed(2)}-${info.end.toFixed(2)} t=${t?.toFixed(2)} paused=${paused} "${info.text}"`,
  };
}

// Karaoke player: dock appears, words light up, pause / seek / speed work.
async function probeConversationKaraoke() {
  const info = await evaluate(`(() => {
    const b = document.querySelector('.story .s.ktv');
    if (!b) return null;
    const start = parseFloat(b.getAttribute('data-start-f'));
    const end = parseFloat(b.getAttribute('data-end-f'));
    const words = b.querySelectorAll('.w').length;
    b.click();
    return { start, end, words, wi: b.getAttribute('data-wi') };
  })()`);
  if (!info) return { ok: false, detail: '没有逐词时间的句子（先重跑 build_site.py）' };
  const shown = await waitFor("!document.querySelector('[data-kplayer]').hidden");
  const started = await waitFor('!!(window.__lastAudio && window.__lastAudio.currentTime > 0)');
  const lit = await waitFor("!!document.querySelector('.story .s.ktv .w.read')", 4000);

  await evaluate("document.querySelector('[data-kp-toggle]').click()");
  const paused = await waitFor('!!(window.__lastAudio && window.__lastAudio.paused)', 2000);

  const target = (info.start + info.end) / 2;
  const moved = await evaluate(`(() => {
    const r = document.querySelector('[data-kp-range]');
    r.value = String(Number(r.max) / 2);
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
    return window.__lastAudio ? window.__lastAudio.currentTime : -1;
  })()`);

  await evaluate("document.querySelector('[data-kp-toggle]').click()");
  const resumed = await waitFor(
    `!!(window.__lastAudio && !window.__lastAudio.paused && window.__lastAudio.currentTime > ${target + 0.04})`,
    2500);

  const speedBefore = await evaluate(
    "parseFloat(document.querySelector('[data-kp-speed-label]').textContent)");
  await evaluate("document.querySelector('[data-kp-speed]').click()");
  const menuOpen = await waitFor("!document.querySelector('[data-kp-speed-menu]').hidden");
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('[data-kp-rate]')]
      .find((x) => Math.abs(parseFloat(x.dataset.kpRate) - 1.1) < 0.001);
    if (b) b.click();
  })()`);
  const speedAfter = await evaluate(
    "parseFloat(document.querySelector('[data-kp-speed-label]').textContent)");
  const rate = await evaluate('window.__lastAudio ? window.__lastAudio.playbackRate : -1');
  // The per-sentence speed must not leak into the toolbar or localStorage.
  const toolbarSpeed = await evaluate(
    "parseFloat(document.querySelector('[data-speed-label]').textContent)");
  const savedSpeed = await evaluate("localStorage.getItem('npesl-speed')");
  const globalOk = Math.abs(toolbarSpeed - speedBefore) < 0.001
    && (savedSpeed === null || Math.abs(parseFloat(savedSpeed) - speedBefore) < 0.001);

  // Another sentence starts again at the page-wide default.
  const second = await evaluate(`(() => {
    const list = [...document.querySelectorAll('.story .s.ktv')];
    if (list.length < 2) return null;
    list[1].click();
    return list[1].getAttribute('data-text');
  })()`);
  const reset = second ? await waitFor(
    `!!(window.__lastAudio && !window.__lastAudio.paused
      && Math.abs(window.__lastAudio.playbackRate - ${speedBefore}) < 0.01)`, 3000) : false;

  await evaluate("document.querySelector('[data-kp-close]').click()");
  const closed = await waitFor("document.querySelector('[data-kplayer]').hidden", 1500);

  const seekOk = Math.abs(moved - target) < 0.25;
  const ok = shown && started && lit && paused && seekOk && resumed && menuOpen
    && speedAfter !== speedBefore && Math.abs(rate - speedAfter) < 0.02
    && globalOk && reset && closed;
  return {
    ok,
    detail: `dock=${shown} words=${info.words} lit=${lit} paused=${paused} `
      + `seek=${Number(moved).toFixed(2)}/${target.toFixed(2)} resumed=${resumed} `
      + `menu=${menuOpen} speed=${speedBefore}->${speedAfter}(${rate}) `
      + `global=${toolbarSpeed}/${savedSpeed} resetNext=${reset} closed=${closed}`,
  };
}

// Play-all must still walk title → sentences, showing the dock on body
// sentences and advancing after each one, with pause/resume intact.
async function probeConversationPlayAll() {
  const clicked = await evaluate(`(() => {
    const b = document.querySelector('[data-play-all]');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!clicked) return { ok: false, detail: '没有朗读全文按钮' };
  const onStory = await waitFor("!!document.querySelector('.story .s.playing')", 12000);
  const dock = await waitFor("!document.querySelector('[data-kplayer]').hidden", 4000);
  const first = await evaluate(
    "(document.querySelector('.story .s.playing') || {}).dataset?.text || ''");
  const advanced = await waitFor(
    `(() => {
      const b = document.querySelector('.story .s.playing');
      return !!(b && b.dataset.text !== ${JSON.stringify(first)});
    })()`, 12000);

  await evaluate("document.querySelector('[data-kp-toggle]').click()");
  const paused = await waitFor('!!(window.__lastAudio && window.__lastAudio.paused)', 2000);
  await evaluate("document.querySelector('[data-kp-toggle]').click()");
  const resumed = await waitFor('!!(window.__lastAudio && !window.__lastAudio.paused)', 2500);

  await evaluate("document.querySelector('[data-play-all]').click()");
  const stopped = await waitFor(`(() => {
    const b = document.querySelector('[data-play-all]');
    return b && b.getAttribute('aria-pressed') === 'false'
      && document.querySelector('[data-kplayer]').hidden
      && window.__lastAudio && window.__lastAudio.paused;
  })()`, 2500);

  const ok = onStory && dock && advanced && paused && resumed && stopped;
  return {
    ok,
    detail: `story=${onStory} dock=${dock} advanced=${advanced} paused=${paused} `
      + `resumed=${resumed} stopped=${stopped} first="${first}"`,
  };
}

// Every level, both voices: the sprite must seek, play, and light a word.
async function probeConversationLevels() {
  const levels = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'eslse'];
  const notes = [];
  for (const level of levels) {
    await goto(`/conversation/${level}/01-01-family.html`);
    for (const voice of ['f', 'm']) {
      await evaluate(`document.querySelector('[data-voice="${voice}"]').click()`);
      const info = await evaluate(`(() => {
        const b = document.querySelector('.story .s.ktv');
        if (!b) return null;
        b.click();
        return { words: b.querySelectorAll('.w').length };
      })()`);
      if (!info || !info.words) {
        notes.push(`${level}-${voice}:no-ktv`);
        continue;
      }
      const shown = await waitFor("!document.querySelector('[data-kplayer]').hidden", 8000);
      const started = await waitFor('!!(window.__lastAudio && window.__lastAudio.currentTime > 0)', 8000);
      const lit = await waitFor("!!document.querySelector('.story .s.ktv.playing .w.read')", 8000);
      const rate = await evaluate('window.__lastAudio ? window.__lastAudio.playbackRate : -1');
      await evaluate("document.querySelector('[data-kp-close]').click()");
      const closed = await waitFor("document.querySelector('[data-kplayer]').hidden", 2000);
      const ok = shown && started && lit && closed && Math.abs(rate - 0.9) < 0.01;
      notes.push(`${level}-${voice}:${ok ? 'ok' : 'FAIL'}${errors.length ? '(console)' : ''}`);
      if (!ok) return { ok: false, detail: notes.join(' ') };
    }
  }
  return { ok: true, detail: notes.join(' ') };
}

const cases = [
  {
    name: 'entry', path: '/',
    async run() {
      const links = await evaluate(
        "[...document.querySelectorAll('a')].map(a => new URL(a.getAttribute('href'), location.href).pathname)");
      const want = ['/phonics/', '/ipa/', '/drill/', '/conversation/', '/phenomena/'];
      const missing = want.filter((w) => !links.some((h) => h && h.startsWith(w)));
      return { ok: missing.length === 0, detail: missing.length ? `缺少链接 ${missing}` : `${want.length} 个入口齐全` };
    },
  },
  {
    name: 'phonics', path: '/phonics/lessons/01-i.html',
    async run() {
      const female = await playAndProbe('button.chunk');
      const end = await evaluate(
        "parseFloat(document.querySelector('button.chunk').dataset.endF)");
      // Both voices come from Azure now; the male track is a separate file.
      const maleStart = await evaluate(`(() => {
        const btn = document.querySelector('#voiceSeg [data-voice="m"]');
        if (!btn) return null;
        btn.click();
        const b = [...document.querySelectorAll('button.chunk')]
          .find((x) => parseFloat(x.dataset.startM) > 0.1);
        if (!b) return null;
        b.setAttribute('data-smoke', '1');
        return parseFloat(b.dataset.startM);
      })()`);
      await sleep(400);
      const male = maleStart === null ? null
        : await playAndProbe('button.chunk[data-smoke]');
      const femaleOk = female.started && female.currentTime > 0.03
        && female.currentTime <= end + 0.6 && female.mediaErrors.length === 0;
      const maleOk = male !== null && male.started
        && male.currentTime >= maleStart - 0.1 && /-m\.mp3/.test(male.src || '')
        && male.mediaErrors.length === 0;
      return {
        ok: femaleOk && maleOk,
        detail: `f start=${female.started} t=${female.currentTime?.toFixed(2)} `
          + `end=${end}; m t=${male?.currentTime?.toFixed(2)} want≥${maleStart} `
          + `src=${male?.src?.split('/').pop()} err=${JSON.stringify(female.mediaErrors.concat(male?.mediaErrors || []))}`,
      };
    },
  },
  {
    name: 'ipa', path: '/ipa/',
    async run() {
      // 点一张卡里非第一条的录音：整张卡一条 sprite，必须 seek 到中段。
      // 线上 Pages 不支持 Range，seek 被夹回开头时这里会露馅。
      // 男女两套都要测：补录音现在来自 Azure，和 PDF 自带录音混在同一张卡。
      const info = await evaluate(`(() => {
        const b = [...document.querySelectorAll('button.word')]
          .find((x) => parseFloat(x.getAttribute('data-start-f')) > 0
            && parseFloat(x.getAttribute('data-start-m')) > 0);
        if (!b) return null;
        b.setAttribute('data-smoke', '1');
        return {
          f: parseFloat(b.getAttribute('data-start-f')),
          m: parseFloat(b.getAttribute('data-start-m')),
        };
      })()`);
      if (!info) return { ok: false, detail: '没有中段录音可点' };
      const female = await playAndProbe('button.word[data-smoke]');
      const switched = await evaluate(`(() => {
        const b = document.querySelector('button.word[data-smoke]');
        const card = b && b.closest('.card');
        const m = card && card.querySelector('.voice button[data-voice="m"]');
        if (!m) return false;
        m.click();
        return true;
      })()`);
      await sleep(400);
      const male = await playAndProbe('button.word[data-smoke]');
      const femaleOk = female.started && female.currentTime >= info.f - 0.1
        && female.mediaErrors.length === 0;
      const maleOk = switched && male.started && male.currentTime >= info.m - 0.1
        && male.src !== female.src && male.mediaErrors.length === 0;
      return {
        ok: femaleOk && maleOk,
        detail: `f t=${female.currentTime?.toFixed(2)} want≥${info.f}; `
          + `m t=${male.currentTime?.toFixed(2)} want≥${info.m} `
          + `src=${male.src === female.src ? 'same' : 'different'}`,
      };
    },
  },
  {
    name: 'drill', path: '/drill/',
    async run() {
      const generated = await waitFor("!!document.querySelector('#gen')", 8000);
      if (!generated) return { ok: false, detail: '没有生成按钮' };
      await evaluate("document.querySelector('#gen').click()");
      const hasReveal = await waitFor("!!document.querySelector('#reveal') && !document.querySelector('#reveal').hidden", 5000);
      if (!hasReveal) return { ok: false, detail: '没有显示英文按钮' };
      await evaluate("document.querySelector('#reveal').click()");
      const hasPlay = await waitFor("!!document.querySelector('#answers .playBtn')", 5000);
      if (!hasPlay) return { ok: false, detail: '题目没有渲染出播放按钮' };
      // 点最后一个说法：它前面还有别的录音，必须 seek 过去。
      const start = await evaluate(`(() => {
        const b = [...document.querySelectorAll('#answers .playBtn')].pop();
        if (!b) return null;
        b.setAttribute('data-smoke', '1');
        const at = parseFloat(b.dataset.start);
        return isFinite(at) ? at : null;
      })()`);
      if (start === null) return { ok: false, detail: '播放按钮没有时间偏移' };
      const p = await playAndProbe('#answers .playBtn[data-smoke]');
      return {
        ok: p.started && p.currentTime >= start - 0.1 && p.mediaErrors.length === 0,
        detail: `start=${p.started} t=${p.currentTime?.toFixed(2)} want≥${start} err=${JSON.stringify(p.mediaErrors)}`,
      };
    },
  },
  {
    name: 'conversation', path: '/conversation/a1/01-01-family.html',
    run: probeConversationPage,
  },
  {
    name: 'conversation-eslse', path: '/conversation/eslse/01-01-family.html',
    run: probeConversationPage,
  },
  {
    name: 'conversation-ktv', path: '/conversation/a1/01-01-family.html',
    run: probeConversationKaraoke,
  },
  {
    name: 'conversation-playall', path: '/conversation/a1/01-01-family.html',
    run: probeConversationPlayAll,
  },
  {
    name: 'conversation-zh', path: '/conversation/a1/01-01-family.html',
    async run() {
      // 按「元素顶边离视口顶多少 px」定位，不依赖板块高度。
      const place = (selector, y) => evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, Math.max(0, top - ${y}));
        return true;
      })()`);

      // (a) 停在词汇区：标题行里的按钮看得见，浮钮不出现。
      await place('.vocab-card', 140);
      const vocabIdle = await waitFor(`(() => {
        const card = document.querySelector('.vocab-card');
        const b = document.querySelector('[data-zh-for="vocab"]');
        const probe = innerHeight * 0.35;
        const r = card.getBoundingClientRect();
        return getComputedStyle(b).visibility === 'visible'
          && document.querySelector('[data-zh-float]').hidden
          && r.top <= probe && r.bottom >= probe;
      })()`);

      // (b) 板块内词汇按钮只控制 .vocab-zh
      await evaluate(`document.querySelector('[data-zh-for="vocab"]').click()`);
      const vocabOff = await waitFor(
        "getComputedStyle(document.querySelector('.vocab-zh')).display === 'none'");
      const vocabStateOff = await evaluate(
        "document.querySelector('[data-zh-for=\"vocab\"] [data-zh-state]').textContent");
      const bodyStill = await evaluate(
        "getComputedStyle(document.querySelector('.story .zh')).display !== 'none'");
      await evaluate(`document.querySelector('[data-zh-for="vocab"]').click()`);
      const vocabOn = await waitFor(
        "getComputedStyle(document.querySelector('.vocab-zh')).display !== 'none'");

      // (c) 停在正文区：正文标题行的按钮看得见，浮钮仍不出现。
      await place('.story', 120);
      const storyIdle = await waitFor(`(() => {
        const b = document.querySelector('[data-zh-for="body"]');
        return getComputedStyle(b).visibility === 'visible'
          && document.querySelector('[data-zh-float]').hidden;
      })()`);

      // 浮钮顶边（和页面一样临时露出来量，固定定位不会推动布局）
      const slotTop = await evaluate(`(() => {
        const f = document.querySelector('[data-zh-float]');
        const was = f.hidden;
        f.hidden = false;
        const top = f.querySelector('.zh-toggle').getBoundingClientRect().top;
        f.hidden = was;
        return top;
      })()`);

      // (d) 正文标题行正好滚到浮钮的位置：浮钮原地接管，板块内按钮藏起来
      await place('[data-zh-for="body"]', slotTop - 1);
      const handedOff = await waitFor(
        "!document.querySelector('[data-zh-float]').hidden");
      const handedLabel = await waitFor(
        "document.querySelector('[data-zh-float] [data-zh-label]').textContent === '正文'");
      const handoff = await evaluate(`(() => {
        const f = document.querySelector('[data-zh-float]');
        const fb = f.querySelector('.zh-toggle');
        const b = document.querySelector('[data-zh-for="body"]');
        const fr = fb.getBoundingClientRect(), br = b.getBoundingClientRect();
        return {
          inlineHidden: getComputedStyle(b).visibility === 'hidden',
          fixed: getComputedStyle(f).position,
          dx: Math.abs(fr.right - br.right),
          dy: Math.abs(fr.top - br.top),
        };
      })()`);

      // (e) 滚到正文深处（标题行早已出视口）：浮钮留在原位，横坐标不变
      await place('.story', -140);
      const deep = await evaluate(`(() => {
        const f = document.querySelector('[data-zh-float]');
        const fb = f.querySelector('.zh-toggle');
        const b = document.querySelector('[data-zh-for="body"]');
        return {
          shown: !f.hidden,
          fixed: getComputedStyle(f).position,
          label: f.querySelector('[data-zh-label]').textContent,
          offscreen: b.getBoundingClientRect().top < 0,
          dx: Math.abs(fb.getBoundingClientRect().right - b.getBoundingClientRect().right),
        };
      })()`);

      // (f) 浮钮只控制 .story .zh
      await evaluate(`document.querySelector('[data-zh-float] .zh-toggle').click()`);
      const bodyOff = await waitFor(
        "getComputedStyle(document.querySelector('.story .zh')).display === 'none'");
      const bodyStateOff = await evaluate(
        "document.querySelector('[data-zh-float] [data-zh-state]').textContent");
      const vocabStill = await evaluate(
        "getComputedStyle(document.querySelector('.vocab-zh')).display !== 'none'");
      await evaluate(`document.querySelector('[data-zh-float] .zh-toggle').click()`);
      const bodyOn = await waitFor(
        "getComputedStyle(document.querySelector('.story .zh')).display !== 'none'");

      // (f2) 往回滚：浮钮让位，正文标题行的按钮重新露出来
      await place('[data-zh-for="body"]', slotTop + 120);
      const backToInline = await waitFor(`(() => {
        const f = document.querySelector('[data-zh-float]');
        const b = document.querySelector('[data-zh-for="body"]');
        return f.hidden && getComputedStyle(b).visibility === 'visible';
      })()`);

      // (g) 问答区没有中文：浮钮隐藏，正文区的按钮恢复可见
      await place('.qs', 120);
      const hiddenAtQs = await waitFor(`(() => {
        const f = document.querySelector('[data-zh-float]');
        const b = document.querySelector('[data-zh-for="body"]');
        return f.hidden && getComputedStyle(b).visibility === 'visible';
      })()`);

      // (h) 关掉词汇中文后刷新：板块内按钮从 localStorage 恢复成「关」
      await evaluate(`document.querySelector('[data-zh-for="vocab"]').click()`);
      await goto('/conversation/a1/01-01-family.html');
      const persisted = await waitFor(`(() => {
        const b = document.querySelector('[data-zh-for="vocab"]');
        return getComputedStyle(document.querySelector('.vocab-zh')).display === 'none'
          && b.querySelector('[data-zh-state]').textContent === '关'
          && b.getAttribute('aria-pressed') === 'false';
      })()`);
      await evaluate(`document.querySelector('[data-zh-for="vocab"]').click()`);
      const restored = await waitFor(
        "getComputedStyle(document.querySelector('.vocab-zh')).display !== 'none'");

      const ok = vocabIdle && vocabOff && vocabStateOff === '关' && bodyStill
        && vocabOn && storyIdle && handedOff && handedLabel
        && handoff.inlineHidden && handoff.fixed === 'fixed'
        && handoff.dx <= 2 && handoff.dy <= 2
        && deep.shown && deep.fixed === 'fixed' && deep.label === '正文'
        && deep.offscreen && deep.dx <= 2
        && bodyOff && bodyStateOff === '关' && vocabStill && bodyOn && hiddenAtQs
        && backToInline && persisted && restored;
      return {
        ok,
        detail: `vocabIdle=${vocabIdle} vocabOff=${vocabOff}(${vocabStateOff}) `
          + `bodyStill=${bodyStill} vocabOn=${vocabOn} storyIdle=${storyIdle} `
          + `handoff=${handedOff}/${handedLabel}/${handoff.fixed}`
          + `/dx${handoff.dx.toFixed(1)}/dy${handoff.dy.toFixed(1)}`
          + `/hide${handoff.inlineHidden} `
          + `deep=${deep.shown}/${deep.fixed}/${deep.label}/off${deep.offscreen}`
          + `/dx${deep.dx.toFixed(1)} `
          + `bodyOff=${bodyOff}(${bodyStateOff}) vocabStill=${vocabStill} `
          + `bodyOn=${bodyOn} hiddenAtQs=${hiddenAtQs} `
          + `backToInline=${backToInline} persisted=${persisted} restored=${restored}`,
      };
    },
  },
  {
    name: 'conversation-levels', path: '/conversation/a1/01-01-family.html',
    run: probeConversationLevels,
  },
  {
    name: 'phenomena', path: '/phenomena/01-your-stop-is-next.html',
    async run() {
      // 整章一条 sprite：点第二句，确认真的跳到了它的位置。
      const start = await evaluate(`(() => {
        const b = [...document.querySelectorAll('button.line')]
          .find((x) => parseFloat(x.getAttribute('data-start-f')) > 0);
        if (!b) return null;
        b.setAttribute('data-smoke', '1');
        return parseFloat(b.getAttribute('data-start-f'));
      })()`);
      if (start === null) return { ok: false, detail: '没有中段句子可点' };
      const p = await playAndProbe('button.line[data-smoke]');
      return {
        ok: p.started && p.currentTime >= start - 0.1 && p.mediaErrors.length === 0,
        detail: `start=${p.started} t=${p.currentTime?.toFixed(2)} want≥${start}`,
      };
    },
  },
];

const results = [];
for (const c of cases) {
  if (ONLY && c.name !== ONLY) continue;
  let outcome;
  try {
    await goto(c.path);
    outcome = await c.run();
    await sleep(200);
    if (errors.length) {
      outcome = { ok: false, detail: `${outcome.detail} | console: ${errors.slice(0, 3).join(' ; ')}` };
    }
  } catch (err) {
    outcome = { ok: false, detail: `异常：${err.message}` };
  }
  results.push({ name: c.name, ...outcome });
  console.log(`${outcome.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(13)} ${outcome.detail}`);
}

try { ws.close(); } catch {}
try {
  // Windows 上 proc.kill() / taskkill /T 都收不干净：Edge 的浏览器进程会
  // 重新挂到别的父进程下，继续锁着 profile。按命令行里的 profile 名精确杀。
  if (process.platform === 'win32') {
    const tag = basename(PROFILE);
    spawnSync('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${tag}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ], { stdio: 'ignore' });
  } else {
    proc.kill('SIGKILL');
  }
} catch {}
server.close();
for (let i = 0; i < 8; i++) {
  try {
    rmSync(PROFILE, { recursive: true, force: true });
    break;
  } catch {
    await sleep(250);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
