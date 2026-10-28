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
      const p = await playAndProbe('button.chunk');
      const end = await evaluate(
        "parseFloat(document.querySelector('button.chunk').dataset.endF)");
      const ok = p.started && p.currentTime > 0.03 && p.currentTime <= end + 0.6
        && p.mediaErrors.length === 0;
      return {
        ok,
        detail: `start=${p.started} t=${p.currentTime?.toFixed(2)} end=${end} err=${JSON.stringify(p.mediaErrors)}`,
      };
    },
  },
  {
    name: 'ipa', path: '/ipa/',
    async run() {
      // 点一张卡里非第一条的录音：整张卡一条 sprite，必须 seek 到中段。
      // 线上 Pages 不支持 Range，seek 被夹回开头时这里会露馅。
      const start = await evaluate(`(() => {
        const b = [...document.querySelectorAll('button.word')]
          .find((x) => parseFloat(x.getAttribute('data-start-f')) > 0);
        if (!b) return null;
        b.setAttribute('data-smoke', '1');
        return parseFloat(b.getAttribute('data-start-f'));
      })()`);
      if (start === null) return { ok: false, detail: '没有中段录音可点' };
      const p = await playAndProbe('button.word[data-smoke]');
      return {
        ok: p.started && p.currentTime >= start - 0.1 && p.mediaErrors.length === 0,
        detail: `start=${p.started} t=${p.currentTime?.toFixed(2)} want≥${start} src=${p.src?.split('/').pop()}`,
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
    async run() {
      // 页面用的是一整条音频 + 时间偏移，所以不只看出声，
      // 还要确认它落在被点那句的区间里（起点对、终点停得住）。
      // 点正文第一句（不是从 0 秒开始的标题），才能真正测到 seek。
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
      const t = await evaluate('window.__lastAudio ? window.__lastAudio.currentTime : -1');
      const paused = await evaluate('window.__lastAudio ? window.__lastAudio.paused : false');
      const ok = started && paused && t >= info.start - 0.1 && t <= info.end + 0.35;
      return {
        ok,
        detail: `span=${info.start.toFixed(2)}-${info.end.toFixed(2)} t=${t?.toFixed(2)} paused=${paused} "${info.text}"`,
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
