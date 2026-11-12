// Headless Edge smoke test for the built site.
//
// Checks, for every app: the page loads without console errors, its playable
// elements exist, and clicking one actually starts audio playback and stops
// where it should.  Run it after every build step — it is the guard that keeps
// the optimization work from quietly breaking playback.
//
//   node tests/smoke.mjs                 # tests build/cloudflare-site
//   node tests/smoke.mjs --only drill    # run one case
//
// Exit code 0 = all passed.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchEdge } from '../tools/edge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 整个测试只开这一个无头 Edge；edge.close() 会把它整棵树收干净。
const edge = await launchEdge({ name: `edge-smoke-${process.pid}`, url: 'about:blank' });
const { send, ws } = edge;

let errors = [];
edge.onEvent((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.text + ': '
      + (msg.params.exceptionDetails.exception?.description || ''));
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push(msg.params.entry.text);
  }
});

const evaluate = edge.evaluate;

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

async function goto(path) {
  errors = [];
  await send('Page.navigate', { url: BASE + path });
  // Page.navigate 返回时旧文档可能还是 complete，先等新文档接管。
  await sleep(300);
  const want = path.split('?')[0];
  for (let i = 0; i < 100; i++) {
    try {
      const state = await evaluate(`({ ready: document.readyState, path: location.pathname })`);
      if (state.ready === 'complete' && (state.path.endsWith(want) || want === '/')) break;
    } catch {}
    await sleep(80);
  }
  await sleep(300);
}

const inView = (id) => `(() => {
  const el = document.getElementById('${id}');
  const r = el && el.getBoundingClientRect();
  return !!(r && r.bottom > 0 && r.top < window.innerHeight);
})()`;

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
  // 首次从 CDN 下载整页 sprite 可能超过 5 秒。确认媒体真的在目标句子
  // 区间播放后，再按句长等它停下，避免把加载时间算进播放时长。
  const started = await waitFor(
    `!!(window.__lastAudio && !window.__lastAudio.paused
      && window.__lastAudio.currentTime >= ${info.start - 0.1})`, 20000);
  const duration = Math.max(info.end - info.start, 0.4);
  const paused = started && await waitFor(
    '!!(window.__lastAudio && window.__lastAudio.paused)',
    Math.ceil(duration / 0.7 * 1000) + 2500);
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
  const levels = ['a1', 'b1', 'eslse'];
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
      // 页面里的 sprite 走音频站 CDN：每个级别第一次播要真的下载整条音频，
      // 网络抖一下就会超过 8 秒。这里只保证「最终能播、能高亮」，给足 20 秒。
      const shown = await waitFor("!document.querySelector('[data-kplayer]').hidden", 8000);
      const startedExpr = '!!(window.__lastAudio && window.__lastAudio.currentTime > 0)';
      const litExpr = "!!document.querySelector('.story .s.ktv.playing .w.read')";
      let started = await waitFor(startedExpr, 20000);
      let lit = started ? await waitFor(litExpr, 12000) : false;
      // 并发跑时整条 sprite 要从 CDN 下载，rAF 也落后：允许重播一次再等。
      if (!started || !lit) {
        await evaluate("document.querySelector('.story .s.ktv').click()");
        started = started || await waitFor(startedExpr, 20000);
        if (started) lit = lit || await waitFor(litExpr, 12000);
      }
      const rate = await evaluate('window.__lastAudio ? window.__lastAudio.playbackRate : -1');
      await evaluate("document.querySelector('[data-kp-close]').click()");
      const closed = await waitFor("document.querySelector('[data-kplayer]').hidden", 2000);
      const ok = shown && started && lit && closed && Math.abs(rate - 0.9) < 0.01;
      const step = ok ? 'ok'
        : `FAIL shown=${shown} started=${started} lit=${lit} closed=${closed} rate=${rate}`
          + `${errors.length ? ' console=' + errors.slice(-1)[0].slice(0, 80) : ''}`;
      notes.push(`${level}-${voice}:${step}`);
      if (!ok) {
        const dump = await evaluate(`(() => {
          const b = document.querySelector('.story .s.ktv');
          const a = window.__lastAudio;
          return {
            src: a ? String(a.currentSrc || a.src).split('/').pop() : null,
            t: a ? +a.currentTime.toFixed(2) : null,
            paused: a ? a.paused : null,
            dockHidden: document.querySelector('[data-kplayer]').hidden,
            cls: b ? b.className : null,
            read: b ? b.querySelectorAll('.w.read').length : -1,
            words: b ? b.querySelectorAll('.w').length : -1,
            voice: localStorage.getItem('npesl-voice'),
          };
        })()`);
        return { ok: false, detail: notes.join(' ') + ' dump=' + JSON.stringify(dump) };
      }
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
      const want = ['/phonics/', '/ipa/', '/drill/', '/conversation/', '/phenomena/', '/collocation/'];
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
      // 状态机：播放阶段可读，重复点同一个词应直接回 idle 而不是重播。
      const stateApi = await evaluate(
        "!!(window.__ipa && typeof window.__ipa.snapshot === 'function')");
      const navState = await evaluate(`(() => {
        const s = window.__ipa.snapshot().nav;
        return {
          state: s.state,
          section: s.section,
          current: document.querySelectorAll('#sectionNav a[aria-current="true"]').length,
        };
      })()`);
      await evaluate("document.querySelector('button.word[data-smoke]').click()");
      const reachedActive = await waitFor(
        "window.__ipa.snapshot().audio.state !== 'idle'", 8000);
      const toggled = await evaluate(`(() => {
        const b = document.querySelector('button.word[data-smoke]');
        b.click();
        const audio = window.__ipa.snapshot().audio;
        return {
          state: audio.state,
          highlighted: document.querySelectorAll('button.word.playing').length,
          body: document.body.getAttribute('data-audio'),
        };
      })()`);
      const stateOk = stateApi && reachedActive && navState.current === 1
        && !!navState.section && navState.state === 'idle'
        && toggled.state === 'idle' && toggled.highlighted === 0
        && toggled.body === 'idle';
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
        ok: stateOk && femaleOk && maleOk,
        detail: `state=${stateOk ? 'ok' : `FAIL nav=${navState.state}/${navState.section} `
            + `toggle=${toggled.state}/${toggled.highlighted}/${toggled.body}`}; `
          + `f t=${female.currentTime?.toFixed(2)} want≥${info.f}; `
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
    name: 'drill-editorial', path: '/drill/',
    async run() {
      // 浏览浮层必须是不透底的纸色，否则编辑网格主题下底下的题目会透上来。
      await evaluate("localStorage.setItem('npesl-theme','editorial')");
      await send('Page.reload');
      const ready = await waitFor(
        "document.readyState === 'complete' && document.documentElement.dataset.theme === 'editorial'"
        + " && !!document.querySelector('#browse')", 8000);
      if (!ready) return { ok: false, detail: '编辑网格主题没生效' };
      await evaluate("document.querySelector('#browse').click()");
      const opaque = await waitFor(`(() => {
        const s = getComputedStyle(document.querySelector('.browserSheet'));
        const m = s.backgroundColor.match(/[\\d.]+/g);
        return !!m && (m.length < 4 || Number(m[3]) === 1);
      })()`);
      const searchBg = await evaluate(
        "getComputedStyle(document.querySelector('.searchField')).backgroundColor");
      await evaluate("localStorage.setItem('npesl-theme','auto')");
      await send('Page.reload');
      return {
        ok: opaque,
        detail: `sheetOpaque=${opaque} search=${searchBg}`,
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
    name: 'conversation-chrome', path: '/conversation/a1/01-01-family.html',
    async run() {
      // 返回键要回总列表，并带上这一级的 hash，列表停在原级别。
      const back = await evaluate(`(() => {
        const a = document.querySelector('.npesl-back');
        if (!a) return null;
        const u = new URL(a.getAttribute('href'), location.href);
        return { path: u.pathname, hash: u.hash };
      })()`);
      const backOk = back && back.path === '/conversation/' && back.hash === '#a1';

      // 播放条出现时主题按钮不能消失；手机上还要让到播放条上方，别被压住。
      await send('Emulation.setDeviceMetricsOverride', {
        width: 390, height: 780, deviceScaleFactor: 2, mobile: true,
      });
      await evaluate("document.querySelector('.story .s.ktv').click()");
      const dock = await waitFor("!document.querySelector('[data-kplayer]').hidden");
      const theme = await waitFor(`(() => {
        const fab = document.querySelector('.npesl-theme-fab');
        if (!fab) return false;
        const s = getComputedStyle(fab.parentElement);
        return s.visibility !== 'hidden' && Number(s.opacity) > 0.9;
      })()`);
      const box = await evaluate(`(() => {
        const fab = document.querySelector('.npesl-theme-fab');
        const dock = document.querySelector('[data-kplayer]');
        if (!fab || !dock || dock.hidden) return null;
        const a = fab.getBoundingClientRect();
        const b = dock.getBoundingClientRect();
        return {
          overlap: a.left < b.right && a.right > b.left
            && a.top < b.bottom && a.bottom > b.top,
          gap: Math.round(b.top - a.bottom),
        };
      })()`);
      await evaluate("document.querySelector('[data-kp-close]').click()");
      await send('Emulation.clearDeviceMetricsOverride');
      const ok = backOk && dock && theme && !!box && !box.overlap && box.gap >= 0;
      return {
        ok,
        detail: `back=${back ? back.path + back.hash : ''} dock=${dock} theme=${theme} `
          + `overlap=${box ? box.overlap : 'n/a'} gap=${box ? box.gap : 'n/a'}`,
      };
    },
  },
  {
    name: 'conversation-switch', path: '/conversation/',
    async run() {
      // 级别按钮原地切换：不换页面，只换显示的列表、标题和 hash。
      const state = () => evaluate(`(() => ({
        path: location.pathname,
        hash: location.hash,
        title: document.querySelector('h1').textContent,
        docTitle: document.title,
        visible: [...document.querySelectorAll('.level-pane')]
          .filter((p) => !p.hidden).map((p) => p.dataset.level),
        current: (document.querySelector('.level[aria-current="page"]') || {})
          .getAttribute('data-level'),
      }))()`);
      const first = await state();
      const firstName = first.docTitle;
      await evaluate('document.querySelector(".level[data-level=b1]").click()');
      const middle = await state();
      await evaluate('document.querySelector(".level[data-level=eslse]").click()');
      const last = await state();
      await evaluate('document.querySelector(".level[data-level=a1]").click()');
      const back = await state();
      const seen = [first, middle, last, back];
      const want = ['a1', 'b1', 'eslse', 'a1'];
      const names = ['Beginner', 'Intermediate', 'ESLSE', 'Beginner'];
      const ok = seen.every((s, i) => s.path === '/conversation/'
        && s.current === want[i] && s.title === names[i]
        && s.visible.length === 1 && s.visible[0] === want[i])
        && middle.hash === '#b1' && last.hash === '#eslse'
        && back.hash === '#a1' && firstName.includes('Beginner');
      return {
        ok,
        detail: seen.map((s) => `${s.title}:${s.hash}:${s.visible.join('')}`).join(' ')
          + ` title=${JSON.stringify(firstName)}`,
      };
    },
  },
  {
    name: 'conversation-levels', path: '/conversation/a1/01-01-family.html',
    run: probeConversationLevels,
  },
  {
    name: 'collocation-index', path: '/collocation/',
    async run() {
      // 默认场景+全部、chip 展开；两个模式的「全部」各自独立；无计数、无主题链接；点词条就地展开。
      const r = await evaluate(`(async () => {
        const path0 = location.pathname;
        if (document.querySelector('.sub')) return 'meta-text';
        if (/·\s*\d+\s*条/.test(document.body.innerText)) return 'count-text';
        if (document.querySelector('.theme a')) return 'theme-link';
        const sceneChips = [...document.querySelectorAll('[data-chips="scene"] button')];
        const partRow = document.querySelector('[data-chips="particle"]');
        const panel = document.querySelector('.sp-context-chips');
        if (!panel || getComputedStyle(panel).display === 'none') return 'panel-default-closed';
        const sceneMode = document.querySelector('[data-mode="scene"]');
        if (!sceneMode || sceneMode.getAttribute('aria-pressed') !== 'true') return 'default-mode-wrong';
        if (!sceneChips.length || !partRow.hidden) return 'default-chips-wrong';
        if (getComputedStyle(partRow).display !== 'none') return 'part-chips-visible';
        const sceneSections = [...document.querySelectorAll('#view .group[data-cat]')];
        if (!sceneSections.every((s) => s.style.display !== 'none')) return 'default-not-all';
        const daily = sceneChips.find((b) => b.dataset.scene === 'daily');
        if (!daily) return 'no-daily';
        daily.click();
        const shownCat = [...document.querySelectorAll('#view .group[data-cat]')]
          .filter((s) => s.style.display !== 'none');
        if (!(shownCat.length === 1 && shownCat[0].dataset.cat === 'daily')) return 'cat-filter';
        const themeRow = document.querySelector('[data-chips="theme"]');
        const themeChips = [...themeRow.querySelectorAll('button[data-theme]')];
        if (getComputedStyle(themeRow).display === 'none') return 'l3-not-shown';
        if (getComputedStyle(document.querySelector('[data-chips=\"scene\"]')).display !== 'none') return 'l2-still-visible';
        if (!themeChips.some((b) => b.textContent.trim() === '做饭采购')) return 'l3-wrong-chips';
        themeRow.querySelector('[data-theme-back]').click();
        if (getComputedStyle(themeRow).display !== 'none') return 'l3-back';
        if (getComputedStyle(document.querySelector('[data-chips=\"scene\"]')).display === 'none') return 'l2-back';
        const workStudy = sceneChips.find((b) => b.textContent.trim() === '工作与学习');
        if (!workStudy) return 'no-work-study';
        workStudy.click();
        await new Promise((resolve) => setTimeout(resolve, 700));
        const workGroup = document.querySelector('#view .group[data-cat="' + workStudy.dataset.scene + '"]');
        const firstTheme = workGroup.querySelector('.theme');
        const firstWorkCard = workGroup.querySelector('.prow');
        const bannerBottom = document.querySelector('.sp-context').getBoundingClientRect().bottom;
        if (!firstTheme.textContent.trim().startsWith('办公室 Office')) return 'wrong-first-theme';
        if (firstTheme.getBoundingClientRect().top < bannerBottom + 4) return 'first-theme-obscured';
        if (firstWorkCard.getBoundingClientRect().top < bannerBottom + 4) return 'first-card-obscured';
        if (location.pathname !== path0) return 'navigated';
        sceneChips.find((b) => b.dataset.scene === 'all').click();
        if (![...document.querySelectorAll('#view .group[data-cat]')].every((s) => s.style.display !== 'none')) return 'all-restore';
        const modes = [...document.querySelectorAll('[data-mode]')];
        const particleMode = modes.find((b) => b.dataset.mode === 'particle');
        particleMode.click();
        if (getComputedStyle(panel).display === 'none') return 'panel-not-open';
        if (particleMode.getAttribute('aria-expanded') !== 'true') return 'panel-aria';
        if (partRow.hidden) return 'part-chips-hidden';
        if (getComputedStyle(document.querySelector('[data-chips=\"scene\"]')).display !== 'none') return 'scene-chips-visible';
        if (getComputedStyle(partRow).display === 'none') return 'part-chips-still-hidden';
        if (partRow.querySelectorAll('button[data-particle]').length < 2) return 'particle-chips-missing';
        const up = [...document.querySelectorAll('[data-chips="particle"] button')]
          .find((b) => b.dataset.particle === 'up');
        if (!up) return 'no-up';
        up.click();
        const shownPart = [...document.querySelectorAll('#view .group[data-particle]')]
          .filter((s) => s.style.display !== 'none');
        if (!(shownPart.length === 1 && shownPart[0].dataset.particle === 'up')) return 'part-filter';
        if (getComputedStyle(panel).display !== 'none') return 'panel-not-closed';
        await new Promise((resolve) => setTimeout(resolve, 700));
        const firstCard = shownPart[0].querySelector('.prow');
        if (firstCard.getBoundingClientRect().top
            < document.querySelector('.sp-context').getBoundingClientRect().bottom + 4) return 'first-card-obscured';
        if (document.querySelector('.sp-rail')) return 'rail-still-there';
        if (document.querySelector('.sp-dot')) return 'dots-still-there';
        return 'ok';
      })()`);
      if (r !== 'ok') return { ok: false, detail: `index=${r}` };

      const open = await evaluate(`(() => { try {
        const b = document.querySelector('.prow');
        if (!b) return 'no-row';
        b.click();
        const c = document.querySelector('.card');
        return c && c.querySelectorAll('.say').length > 0 ? 'ok' : 'no-card';
      } catch (err) { return 'ERR:' + err.message; } })()`);
      if (open !== 'ok') return { ok: false, detail: `expand=${open}` };

      // 文字不可点：点词条胶囊不应触发播放。
      const passive = await evaluate(`(() => {
        const w = document.querySelector('.card .w');
        if (!w) return 'no-w';
        const before = window.__phLast || null;
        w.click();
        return (window.__phLast || null) === before ? 'ok' : 'played';
      })()`);
      if (passive !== 'ok') return { ok: false, detail: `text-click=${passive}` };

      // 播放态样式带过渡：测试里临时禁用 transition，直接量最终态。
      const afford = await evaluate(`(() => { try {
        const style = document.createElement('style');
        style.textContent = '*,*::before,*::after{transition:none !important}';
        document.head.appendChild(style);
        const row = document.querySelector('.prow[aria-expanded="true"]');
        if (!row) { style.remove(); return 'no-expanded-row'; }
        const t = getComputedStyle(row.querySelector('.arw')).transform;
        const says = [...document.querySelectorAll('.card .say')];
        const badges = says.length > 0 && says.every((b) => b.querySelector('.play'));
        const head = document.querySelector('.card .card-head');
        const w = head.querySelector('.w');
        const colorOff = getComputedStyle(w).color;
        const bgOff = getComputedStyle(w).backgroundColor;
        const wCss = getComputedStyle(w);
        const chipLook = parseFloat(wCss.borderTopWidth) >= 1
          && parseFloat(wCss.borderTopLeftRadius) >= 100;
        head.classList.add('on');
        const btn = head.querySelector('.playbtn');
        btn.classList.add('on');
        const bars = getComputedStyle(btn.querySelector('.bars')).display;
        const svg = getComputedStyle(btn.querySelector('svg')).display;
        const ring = getComputedStyle(btn.querySelector('.play')).animationName;
        const colorOn = getComputedStyle(w).color;
        const bgOn = getComputedStyle(w).backgroundColor;
        const afterContent = getComputedStyle(w, '::after').content;
        btn.classList.remove('on');
        style.remove();
        const playFx = bars === 'flex' && svg === 'none';
        let rules = [];
        try {
          const sheet = document.querySelector('style').sheet;
          rules = [...sheet.cssRules].filter((r) => r.selectorText
            && r.selectorText.indexOf('w::after') >= 0)
            .map((r) => r.selectorText.slice(0, 60) + '=' + (r.style.transform || '-'));
        } catch (e) { rules = ['err:' + e.message]; }
        const content = getComputedStyle(w, '::after').content;
        const textFx = colorOff !== colorOn && bgOn !== bgOff
          && bgOn !== 'rgba(0, 0, 0, 0)' && afterContent === 'none' && chipLook;
        const rootCss = getComputedStyle(document.documentElement);
        const hoverDiff = rootCss.getPropertyValue('--surface').trim()
          !== rootCss.getPropertyValue('--surface-strong').trim();
        return t !== 'none' && badges && playFx && textFx && hoverDiff ? 'ok'
          : 'transform=' + t + '/badges=' + badges + '/playFx=' + playFx + '/textFx=' + textFx
            + '/' + colorOff + '->' + colorOn + '/bg=' + bgOff + '->' + bgOn + '/ring=' + ring + '/hoverDiff=' + hoverDiff;
      } catch (err) { return 'ERR:' + err.message; } })()`);
      if (afford !== 'ok') return { ok: false, detail: `affordance=${afford}` };

      // 视觉对齐：默认主题和 glass 主题下都要准；点开时不能出现实心底色。
      const metrics = await evaluate(`(() => {
        const root = document.documentElement;
        const old = root.getAttribute('data-theme');
        function measure(){
          const head = document.querySelector('.card .card-head');
          const hb = head.querySelector('.play').getBoundingClientRect();
          const hw = head.querySelector('.w').getBoundingClientRect();
          const ex = document.querySelector('.card .ex-unit');
          const eb = ex.querySelector('.play').getBoundingClientRect();
          const txt = ex.querySelector('.txt');
          const et = txt.getBoundingClientRect();
          const lh = parseFloat(getComputedStyle(txt).lineHeight) || et.height;
          const line = { top: et.top, height: Math.min(lh, et.height) };
          const d = (b, t) => Math.round(Math.abs((b.top + b.height / 2) - (t.top + t.height / 2)) * 10) / 10;
          const bg = getComputedStyle(head).backgroundColor;
          const cardBg = getComputedStyle(document.querySelector('.card')).backgroundColor;
          const playBg = getComputedStyle(head.querySelector('.play')).backgroundColor;
          return { head: d(hb, hw), ex: d(eb, line), bg, cardBg, playBg };
        }
        const base = measure();
        root.setAttribute('data-theme', 'glass');
        const glass = measure();
        root.setAttribute('data-theme', 'dark');
        const dark = measure();
        if (old === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', old);
        return { base, glass, dark };
      })()`);
      const clean = (m) => m && m.head <= 2 && m.ex <= 2 && m.bg === 'rgba(0, 0, 0, 0)';
      const alignOk = clean(metrics && metrics.base) && clean(metrics && metrics.glass)
        && clean(metrics && metrics.dark);
      if (!alignOk) return { ok: false, detail: `align=${JSON.stringify(metrics)}` };
      // 版式一致性：右上控件组（音色 + 进度读数）右对齐、列表行等高、
      // 卡片内边距 16、徽章与词条垂直居中。
      const layout = await evaluate(`(() => { try {
        const page = document.querySelector('.page');
        const pr = page.getBoundingClientRect();
        const padR = parseFloat(getComputedStyle(page).paddingRight);
        const rightEdge = (document.querySelector('.sp-right')
          || document.querySelector('.voice-seg')).getBoundingClientRect();
        const rightGap = Math.round((pr.right - padR) - rightEdge.right);
        const heights = [...new Set([...document.querySelectorAll('.prow')]
          .slice(0, 40).map((r) => Math.round(r.getBoundingClientRect().height)))];
        const card = document.querySelector('.card');
        const cr = card.getBoundingClientRect();
        const wEl = card.querySelector('.w');
        const w = wEl.getBoundingClientRect();
        const ex = card.querySelector('.ex-unit').getBoundingClientRect();
        const badge = card.querySelector('.badge').getBoundingClientRect();
        const padLeft = Math.round(w.left - cr.left);
        const padRight = Math.round(cr.right - ex.right);
        const badgeDelta = Math.round(Math.abs((badge.top + badge.height / 2) - (w.top + w.height / 2)));
        return { rightGap, heights, padLeft, padRight, badgeDelta };
      } catch (err) { return 'ERR:' + err.message; } })()`);
      const layoutOk = layout && Math.abs(layout.rightGap) <= 1 && layout.heights.length === 1
        && Math.abs(layout.padLeft - 17) <= 1 && Math.abs(layout.padRight - 17) <= 1
        && layout.badgeDelta <= 2;
      if (!layoutOk) return { ok: false, detail: `layout=${JSON.stringify(layout)}` };

      const close = await evaluate(`(() => {
        document.querySelector('.prow').click();
        return document.querySelector('.card') ? 'still-open' : 'ok';
      })()`);
      if (close !== 'ok') return { ok: false, detail: `collapse=${close}` };

      const marked = await evaluate(`(() => {
        document.querySelector('.prow').click();
        const b = document.querySelector('.card .say');
        if (!b) return null;
        b.setAttribute('data-smoke', '1');
        return true;
      })()`);
      if (!marked) return { ok: false, detail: 'no-card-say' };
      await evaluate(`(function(){
        window.__phPauses=[];
        if(window.__phAudio){
          window.__phAudio.addEventListener('pause',function(){
            window.__phPauses.push(+window.__phAudio.currentTime.toFixed(3));
          });
        }
      })()`);
      await evaluate("document.querySelector('.card .say[data-smoke]').click()");
      await waitFor(`!!(window.__phLast && (window.__phLast.mode === 'ha'
        ? (window.__lastAudio && window.__lastAudio.paused)
        : window.__phLast.t1 !== null))`, 8000);
      // 片段结束后必须停在终点附近：timeupdate 粒度太粗会漏出下一条的开头。
      const tail = await evaluate(`(() => {
        const last = window.__phLast;
        if (last && last.mode === 'wa') {
          if (last.t1 === null) return { mode: 'wa', pending: true };
          const dur = +(last.t1 - last.t0).toFixed(3);
          const want = +(last.en - last.s).toFixed(3);
          return { mode: 'wa', dur, want, delta: +(dur - want).toFixed(3) };
        }
        const a = window.__lastAudio;
        if (!a) return null;
        const end = window.__phEnd;
        const pauses = window.__phPauses || [];
        const t = pauses.length ? pauses[pauses.length - 1] : +a.currentTime.toFixed(3);
        return { mode: 'ha', end, t, delta: +(t - end).toFixed(3), pauses };
      })()`);
      const ok = tail && ((tail.mode === 'wa' && tail.dur > 0.2 && Math.abs(tail.delta) <= 0.06)
        || (tail.mode === 'ha' && tail.pauses.length > 0
          && tail.delta <= 0.05 && tail.delta >= -0.3));
      return { ok, detail: `card-audio tail=${JSON.stringify(tail)}` };
    },
  },
  {
    name: 'collocation-index-opposite', path: '/collocation/',
    async run() {
      // 索引页展开卡片里的反义：跳转到目标卡片，返回后回到来源卡片。
      const pick = await evaluate(`(() => {
        const D = window.COLLOCATION_INDEX;
        for (let i = 0; i < D.entries.length; i++) {
          const e = D.entries[i];
          if (e.opp && e.opp.length) {
            const j = e.opp[0].i;
            return { i, j, c: e.c, tc: D.entries[j].c };
          }
        }
        return null;
      })()`);
      if (!pick) return { ok: false, detail: '没有反义数据' };
      await evaluate(`document.querySelector('.prow[data-i="${pick.i}"]').click()`);
      await sleep(250);
      const opened = await evaluate(
        `!!document.querySelector('.card[data-card="${pick.i}"] .opp-btn[data-opp-i="${pick.j}"]')`);
      if (!opened) return { ok: false, detail: '来源卡片没有反义按钮' };
      await evaluate(
        `document.querySelector('.card[data-card="${pick.i}"] .opp-btn[data-opp-i="${pick.j}"]').click()`);
      await waitFor(`!!document.querySelector('.card[data-card="${pick.j}"] [data-opp-return-inline]')`);
      const jumped = await evaluate(`(() => {
        const ret = document.querySelector('.card[data-card="${pick.j}"] [data-opp-return-inline]');
        const row = document.querySelector('.prow[data-i="${pick.j}"]');
        return {
          ret: !!(ret && ret.textContent.includes('返回')),
          card: !!document.querySelector('.card[data-card="${pick.j}"]'),
          expanded: row && row.getAttribute('aria-expanded'),
          originCard: !!document.querySelector('.card[data-card="${pick.i}"]'),
        };
      })()`);
      if (!jumped || !jumped.ret || !jumped.card || jumped.expanded !== 'true' || jumped.originCard) {
        return { ok: false, detail: `jump=${JSON.stringify(jumped)}` };
      }
      await evaluate(
        `document.querySelector('.card[data-card="${pick.j}"] [data-opp-return-inline]').click()`);
      await waitFor(`!!document.querySelector('.card[data-card="${pick.i}"]')`);
      const back = await evaluate(`(() => {
        const ret = document.querySelector('[data-opp-return-inline]');
        const row = document.querySelector('.prow[data-i="${pick.i}"]');
        return {
          ret: !!ret,
          card: !!document.querySelector('.card[data-card="${pick.i}"]'),
          expanded: row && row.getAttribute('aria-expanded'),
        };
      })()`);
      const ok = back && !back.ret && back.card && back.expanded === 'true';
      return { ok, detail: `back=${JSON.stringify(back)}` };
    },
  },
  {
    name: 'collocation-editorial-opposite', path: '/collocation/',
    async run() {
      // editorial 是直角主题，反义按钮不能还是胶囊。
      await evaluate(`document.documentElement.setAttribute('data-theme', 'editorial')`);
      const pick = await evaluate(`(() => {
        const D = window.COLLOCATION_INDEX;
        for (let i = 0; i < D.entries.length; i++) {
          if (D.entries[i].opp && D.entries[i].opp.length) return i;
        }
        return -1;
      })()`);
      if (pick < 0) return { ok: false, detail: '没有反义数据' };
      await evaluate(`document.querySelector('.prow[data-i="${pick}"]').click()`);
      await sleep(200);
      const r = await evaluate(`(() => {
        const b = document.querySelector('.card[data-card="${pick}"] .opp-btn');
        if (!b) return null;
        const cs = getComputedStyle(b);
        return { radius: cs.borderRadius, font: cs.fontFamily };
      })()`);
      await evaluate(`document.documentElement.removeAttribute('data-theme')`);
      return { ok: !!r && r.radius === '0px', detail: JSON.stringify(r) };
    },
  },
  {
    name: 'collocation-chunk-variants', path: '/collocation/',
    async run() {
      // chunk 条目不显示类型徽章、不显示音标；卡片内固定 3 条近义，
      // 每条都有差别说明；点第一条近义能播到它自己的音频区间。
      // 前面的用例可能把模式留在“介词”；chunk 只在场景模式里出现。
      await evaluate(`document.querySelector('[data-mode="scene"]').click()`);
      await sleep(250);
      const shape = await evaluate(`(() => {
        const D = window.COLLOCATION_INDEX;
        const i = D.entries.findIndex((e) => e.id === 'be-tired');
        if (i < 0) return 'no-entry';
        const row = document.querySelector('.prow[data-i="' + i + '"]');
        if (!row) return 'no-row';
        row.click();
        const card = document.querySelector('.card[data-card="' + i + '"]');
        if (!card) return 'no-card';
        const notes = [...card.querySelectorAll('.variant-note')]
          .filter((x) => x.textContent.trim().length > 4).length;
        return {
          i,
          kinds: card.querySelectorAll('.badge.kind').length,
          vars: card.querySelectorAll('.variant').length,
          notes,
          ipas: card.querySelectorAll('.card-head .ipa').length,
        };
      })()`);
      if (typeof shape === 'string') return { ok: false, detail: shape };
      if (shape.kinds !== 0 || shape.vars !== 3 || shape.notes !== 3 || shape.ipas !== 0) {
        return { ok: false, detail: `shape=${JSON.stringify(shape)}` };
      }
      await evaluate(
        `document.querySelector('.card[data-card="${shape.i}"] .variant .playbtn').setAttribute('data-smoke', '1')`);
      await evaluate(`document.querySelector('[data-smoke="1"]').click()`);
      const started = await waitFor(`!!(window.__phLast && (window.__phLast.mode === 'ha'
        ? (window.__lastAudio && window.__lastAudio.paused)
        : window.__phLast.t1 !== null))`, 8000);
      const tail = await evaluate(`window.__phLast`);
      const ok = !!started && tail && tail.s > 0 && tail.en > tail.s
        && (tail.mode !== 'ha'
          || (tail.t >= tail.en - 0.3 && tail.t <= tail.en + 0.05));
      return { ok, detail: `started=${started} tail=${JSON.stringify(tail)}` };
    },
  },
  {
    name: 'collocation-noun-uses', path: '/collocation/',
    async run() {
      // 名词卡：package 下列出 get / sign for / track / pick up 四个动作。
      await evaluate(`document.querySelector('[data-mode="scene"]').click()`);
      await sleep(250);
      const shape = await evaluate(`(() => {
        const D = window.COLLOCATION_INDEX;
        const i = D.entries.findIndex((e) => e.id === 'package');
        if (i < 0) return 'no-entry';
        const row = document.querySelector('.prow[data-i="' + i + '"]');
        if (!row) return 'no-row';
        row.click();
        const card = document.querySelector('.card[data-card="' + i + '"]');
        if (!card) return 'no-card';
        return {
          i,
          uses: card.querySelectorAll('.use').length,
          vars: card.querySelectorAll('.variant').length,
          title: card.querySelector('.uses-title')?.textContent.trim(),
        };
      })()`);
      if (typeof shape === 'string') return { ok: false, detail: shape };
      if (shape.uses !== 4 || shape.vars !== 0 || shape.title !== '用法') {
        return { ok: false, detail: `shape=${JSON.stringify(shape)}` };
      }
      await evaluate(
        `document.querySelector('.card[data-card="${shape.i}"] .use .playbtn').setAttribute('data-smoke', '1')`);
      await evaluate(`document.querySelector('[data-smoke="1"]').click()`);
      const started = await waitFor(`!!(window.__phLast && (window.__phLast.mode === 'ha'
        ? (window.__lastAudio && window.__lastAudio.paused)
        : window.__phLast.t1 !== null))`, 8000);
      const tail = await evaluate(`window.__phLast`);
      const ok = !!started && tail && tail.s > 0 && tail.en > tail.s
        && (tail.mode !== 'ha'
          || (tail.t >= tail.en - 0.3 && tail.t <= tail.en + 0.05));
      return { ok, detail: `started=${started} tail=${JSON.stringify(tail)}` };
    },
  },
  {
    name: 'phenomena-index', path: '/phenomena/',
    async run() {
      // 第 24 课有一条超长 tag；卡片不能被撑宽，页面也不许横向溢出。
      const r = await evaluate(`(() => {
        const overflow = document.documentElement.scrollWidth - window.innerWidth;
        const rows = [...document.querySelectorAll('.row')];
        const widths = new Set(rows.map((x) => Math.round(x.getBoundingClientRect().width)));
        return { overflow, rows: rows.length, widths: widths.size };
      })()`);
      // 筛选状态机：切分类只亮一个 chip、只显示一组；未知保存值退回 all。
      const filter = await evaluate(`(() => {
        if (!window.__phenomena || typeof window.__phenomena.snapshot !== 'function') return null;
        const initial = window.__phenomena.snapshot().filter;
        const chip = [...document.querySelectorAll('.chips button')]
          .find((b) => b.getAttribute('data-cat') !== 'all');
        if (!chip) return null;
        const cat = chip.getAttribute('data-cat');
        chip.click();
        const shown = [...document.querySelectorAll('.group')]
          .filter((g) => g.style.display !== 'none')
          .map((g) => g.getAttribute('data-cat'));
        const pressed = document.querySelector('.chips button[aria-pressed="true"]');
        const result = {
          initial, cat, on: window.__phenomena.snapshot().filter, shown,
          pressed: pressed && pressed.getAttribute('data-cat'),
          body: document.body.getAttribute('data-filter'),
        };
        document.querySelector('.chips button[data-cat="all"]').click();
        result.restored = window.__phenomena.snapshot().filter;
        return result;
      })()`);
      const filterOk = filter && filter.initial === 'all' && filter.on === filter.cat
        && filter.shown.length === 1 && filter.shown[0] === filter.cat
        && filter.pressed === filter.cat && filter.body === filter.cat
        && filter.restored === 'all';
      const ok = r && r.overflow <= 1 && r.rows === 30 && r.widths === 1 && filterOk;
      return {
        ok,
        detail: `overflow=${r && r.overflow} rows=${r && r.rows} widths=${r && r.widths} `
          + `filter=${filterOk ? 'ok' : JSON.stringify(filter)}`,
      };
    },
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

      // 状态机：初始 idle，快照可读；重复点同一个句子应回 idle 而不是重播。
      const initial = await evaluate(`(() => {
        if (!window.__phenomena || typeof window.__phenomena.snapshot !== 'function') return null;
        const s = window.__phenomena.snapshot();
        return {
          page: s.page, audio: s.audio.state, queue: s.queue.state,
          voice: s.voice, lang: s.lang,
          bodyAudio: document.body.getAttribute('data-audio'),
          bodyVoice: document.body.getAttribute('data-voice-state'),
          pressed: document.querySelectorAll('[data-voice][aria-pressed="true"]').length,
        };
      })()`);
      const p = await playAndProbe('button.line[data-smoke]');
      const toggled = await evaluate(`(() => {
        document.querySelector('button.line[data-smoke]').click();
        const s = window.__phenomena.snapshot();
        return {
          state: s.audio.state,
          playing: document.querySelectorAll('.line.playing').length,
          body: document.body.getAttribute('data-audio'),
        };
      })()`);
      const stateOk = !!initial && initial.page === 'lesson'
        && initial.audio === 'idle' && initial.queue === 'off'
        && initial.bodyAudio === 'idle' && initial.bodyVoice === initial.voice
        && initial.pressed === 1
        && toggled.state === 'idle' && toggled.playing === 0 && toggled.body === 'idle';

      // 换音色：正在播的句子用另一条 sprite 重放，连播按钮仍归位。
      const switched = await evaluate(`(() => {
        const next = window.__phenomena.snapshot().voice === 'f' ? 'm' : 'f';
        document.querySelector('[data-voice="' + next + '"]').click();
        return {
          want: next,
          voice: window.__phenomena.snapshot().voice,
          body: document.body.getAttribute('data-voice-state'),
          pressed: document.querySelector('[data-voice="' + next + '"]')
            .getAttribute('aria-pressed'),
        };
      })()`);
      await evaluate("document.querySelector('button.line[data-smoke]').click()");
      const replayed = await waitFor(
        "window.__phenomena.snapshot().audio.state === 'playing'", 8000);
      const maleSrc = await evaluate(
        'window.__lastAudio ? (window.__lastAudio.currentSrc || window.__lastAudio.src) : ""');
      const voiceOk = switched.voice === switched.want
        && switched.body === switched.want && switched.pressed === 'true'
        && replayed && maleSrc && maleSrc !== p.src;

      // 连播：开 → queue=playing，第一句播完自动推进，关 → queue=off 且声音停。
      const queue = await evaluate(`(() => {
        document.querySelector('[data-play-all]').click();
        return window.__phenomena.snapshot().queue.state;
      })()`);
      const advanced = await waitFor(
        "window.__phenomena.snapshot().queue.state === 'playing' "
        + "&& window.__phenomena.snapshot().queue.at >= 1", 10000);
      const queueStopped = await evaluate(`(() => {
        document.querySelector('[data-play-all]').click();
        const s = window.__phenomena.snapshot();
        return {
          queue: s.queue.state, audio: s.audio.state,
          pressed: document.querySelector('[data-play-all]').getAttribute('aria-pressed'),
        };
      })()`);
      const queueOk = queue === 'playing' && advanced
        && queueStopped.queue === 'off'
        && queueStopped.audio === 'idle' && queueStopped.pressed === 'false';

      const playbackOk = p.started && p.currentTime >= start - 0.1
        && p.mediaErrors.length === 0;
      const ok = stateOk && voiceOk && queueOk && playbackOk;
      return {
        ok,
        detail: `state=${stateOk ? 'ok' : `init=${JSON.stringify(initial)} `
            + `toggle=${JSON.stringify(toggled)}`} `
          + `voice=${voiceOk ? 'ok' : `${JSON.stringify(switched)} replayed=${replayed} `
            + `src=${maleSrc === p.src ? 'same' : 'different'}`} `
          + `queue=${queueOk ? 'ok' : `${queue}/advanced=${advanced}/`
            + JSON.stringify(queueStopped)} `
          + `start=${p.started} t=${p.currentTime?.toFixed(2)} want≥${start}`,
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
    const stack = String(err.stack || err.message).replace(/\s+/g, ' ');
    outcome = { ok: false, detail: `异常：${stack.slice(0, 240)}` };
  }
  results.push({ name: c.name, ...outcome });
  console.log(`${outcome.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(13)} ${outcome.detail}`);
}

try { ws.close(); } catch {}
edge.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
