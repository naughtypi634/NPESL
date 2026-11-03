// 本地验证用的无头 Edge：一次验证只开一个浏览器进程，跑完一定关掉。
//
// Windows 上 Edge 的浏览器进程会改挂到别的父进程，proc.kill() 和
// taskkill /T /F 都收不干净，profile 一直锁着、进程越积越多。所以关闭一律
// 按命令行里的 --user-data-dir 精确杀，并在 exit / SIGINT 上也挂一份。
//
//   import { launchEdge } from './edge.mjs';
//   const edge = await launchEdge({ name: 'edge-smoke' });
//   await edge.send('Page.navigate', { url: 'http://127.0.0.1:8765/' });
//   const title = await edge.evaluate('document.title');
//   edge.close();   // 不调用也会在进程退出时关掉
//
// 合并验证步骤到一个脚本、尽量复用同一个页面，比开几个浏览器快也更稳。

import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE_BY_PLATFORM = {
  win32: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  darwin: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
};

export const EDGE_PATH = process.env.EDGE_PATH || EDGE_BY_PLATFORM[process.platform];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function killMatching(predicate) {
  if (process.platform !== 'win32') return;
  spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'"`
    + ` | Where-Object { ${predicate} }`
    + ' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
  ], { stdio: 'ignore' });
}

// 只杀指定 profile 的浏览器。名字后面必须是引号/空白/行尾，否则
// edge-crop 会把 edge-crop2 一起带走。
export function stopEdge(name) {
  // name 里可能带 /（drill-tests/edge-profile-123），两种分隔符都要认。
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '[\\\\/]');
  killMatching(`$_.CommandLine -match 'build[\\\\/]${safe}(?=["\\s]|$)'`);
}

// 清掉以前留下的测试浏览器（只认 build/ 下的测试 profile，不碰用户自己的 Edge）。
// 这是全局清扫：同时有别的验证在跑时别用，会连它正在用的浏览器一起杀掉。
export function sweepTestEdges() {
  killMatching('$_.CommandLine -like \'*build\\edge-*\''
    + ' -or $_.CommandLine -like \'*build/edge-*\''
    + ' -or $_.CommandLine -like \'*build\\drill-tests\\*\'');
}

async function waitForTarget(port) {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('DevTools target never appeared');
}

// 起一个浏览器并接上 CDP。返回的 close() 关掉整棵树，重复调用无副作用。
export async function launchEdge({
  name = `edge-${process.pid}`,
  port = 9200 + (process.pid % 300),
  url = 'about:blank',
  args = [],
  onEvent,
} = {}) {
  const profile = join(ROOT, 'build', name);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}

  const proc = spawn(EDGE_PATH, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, ...args, url,
  ], { stdio: 'ignore' });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    stopEdge(name);
    try { proc.kill(); } catch {}
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  process.on('exit', close);
  process.on('SIGINT', () => { close(); process.exit(130); });
  process.on('uncaughtException', (err) => { close(); console.error(err); process.exit(1); });

  const page = await waitForTarget(port);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let seq = 0;
  const pending = new Map();
  const listeners = onEvent ? [onEvent] : [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else {
      for (const fn of listeners) fn(msg);
    }
  };

  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

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

  return {
    port, proc, ws, send, evaluate, close,
    onEvent: (fn) => listeners.push(fn),
  };
}

// `node tools/edge.mjs` = 清掉所有残留的测试浏览器。
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  sweepTestEdges();
  console.log('cleared test Edge processes');
}
