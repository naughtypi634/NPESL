// Browser check for the "look at a chart, learn the phrasing" layout.
//
// One headless Edge, one Vite server, closed at the end. Start with:
//   node tests/dataviz-ui.mjs
//
// It intentionally uses the real page: filters, card clicks, canvas pointer
// events, edits and the reset button. Counts are never shown by the UI.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchEdge } from '../tools/edge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5175;
const BASE = `http://127.0.0.1:${PORT}/data-viz/`;
const VITE = join(ROOT, 'apps', 'data-viz', 'web', 'node_modules', 'vite', 'bin', 'vite.js');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!existsSync(VITE)) {
  console.error('缺少 vite；先在 apps/data-viz/web 跑 npm ci');
  process.exit(1);
}

const server = spawn(process.execPath, [VITE, '--host', '127.0.0.1', '--port', String(PORT)], {
  cwd: join(ROOT, 'apps', 'data-viz', 'web'),
  stdio: 'ignore',
});
const stopServer = () => {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    server.kill();
  }
};
process.on('exit', stopServer);

let ready = false;
for (let i = 0; i < 80; i += 1) {
  try {
    const response = await fetch(BASE);
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {}
  await sleep(250);
}
if (!ready) {
  console.error('Vite 没有启动');
  stopServer();
  process.exit(1);
}

const edge = await launchEdge({ name: 'dataviz-ui', url: 'about:blank' });
const errors = [];
edge.onEvent((msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args?.map((arg) => arg.value ?? arg.description).join(' '));
  }
});
await edge.send('Runtime.enable');
await edge.send('Log.enable');
await edge.send('Page.enable');
await edge.send('Emulation.setDeviceMetricsOverride', {
  width: 1280,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const evaluate = (expression) => edge.evaluate(expression);
const waitFor = async (expression, timeout = 12000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(120);
  }
  return false;
};
const snapshot = () => evaluate('window.__dv.snapshot()');
const body = () => evaluate('document.body.innerText');
const mouse = (type, x, y, extra = {}) =>
  edge.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const drag = async (from, to) => {
  await mouse('mousePressed', from.x, from.y, { buttons: 1 });
  await mouse('mouseMoved', to.x, to.y, { buttons: 1 });
  await mouse('mouseReleased', to.x, to.y);
  await sleep(500);
};
const clickChip = (text) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll('button.chip')].find((node) => node.textContent.trim() === ${JSON.stringify(text)});
    if (el) el.click();
    return !!el;
  })()`);
const clickButton = (text) =>
  evaluate(`(() => {
    const el = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === ${JSON.stringify(text)});
    if (el && !el.disabled) el.click();
    return !!el;
  })()`);
const open = async (hash, slug, view) => {
  await edge.send('Page.navigate', { url: `${BASE}${hash}` });
  await waitFor(
    `window.__dvView?.slug === ${JSON.stringify(slug)} && window.__dvView?.view === ${JSON.stringify(view)} && window.__dvChartView === ${JSON.stringify(view)}`,
  );
  await sleep(500);
};
const atPoint = (expression) =>
  evaluate(`(() => {
    const host = document.querySelector('main [role="img"]').getBoundingClientRect();
    const p = (${expression});
    return p ? { x: host.left + p[0], y: host.top + p[1] } : null;
  })()`);
const setNumberInput = async (delta) => {
  const ok = await evaluate(`(() => {
    const input = document.querySelector('input.dv-field');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, String((Number(input.value) || 0) + ${delta}));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(450);
  return ok;
};
const resetCurrent = async () => {
  await clickButton('还原');
  await sleep(350);
};

// 1. Home and goal filter.
await edge.send('Page.navigate', { url: BASE });
await waitFor("document.querySelectorAll('.dv-tile').length === 20");
check('首页有 20 张卡片', (await evaluate("document.querySelectorAll('.dv-tile').length")) === 20);
await clickChip('波动');
await sleep(450);
const fluctuateCards = await evaluate("document.querySelectorAll('.dv-tile').length");
const fluctuateTitles = await evaluate(
  "[...document.querySelectorAll('.dv-tile')].map((node) => node.querySelector('span')?.textContent)",
);
check('「波动」筛出 4 张卡片', fluctuateCards === 4, `${fluctuateCards} 张`);
check(
  '「波动」卡片包含地铁/外卖/屏幕/健身房',
  ['Metro Ridership', 'Food Delivery Orders', 'Screen Time', 'Gym Attendance'].every((title) =>
    fluctuateTitles.includes(title),
  ),
);
await clickChip('波动');
await sleep(400);
check('再点一次取消目标', (await evaluate("document.querySelectorAll('.dv-tile').length")) === 20);
await clickChip('波动');
await sleep(400);

// 2. Card opens the matching view and preselects a fluctuation.
await evaluate("document.querySelector('.dv-tile')?.click()");
await waitFor("window.__dv?.snapshot().section === 'detail'");
await waitFor('window.__dvView?.marks?.length > 0');
await sleep(300);
const fluctuateKind = await evaluate(`(() => {
  const mark = window.__dv.snapshot().mark;
  return window.__dvView.marks.find((entry) => entry.marks.includes(mark))?.kind ?? null;
})()`);
check('从「波动」进入直接选中波动', fluctuateKind === 'fluctuate', String(fluctuateKind));
check('没写例句的位置标「自动生成」', (await body()).includes('自动生成'));

// 3. Type filter preview + empty state.
await edge.send('Page.navigate', { url: BASE });
await waitFor("document.querySelectorAll('.dv-tile').length === 20");
await evaluate(`(() => {
  const select = document.querySelector('#dv-type');
  select.value = 'line';
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(450);
check('图表类型筛选出 9 张折线卡片', (await evaluate("document.querySelectorAll('.dv-tile').length")) === 9);
check(
  '卡片预览换成折线图',
  (await evaluate("window.__dvChart?.getOption()?.series?.[0]?.type ?? null")) === 'line',
);
await clickChip('波动');
await evaluate(`(() => {
  const select = document.querySelector('#dv-type');
  select.value = 'bar';
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(450);
check('无结果时有空状态', (await evaluate("document.querySelectorAll('.dv-tile').length")) === 0);
check('空状态提示可见', (await body()).includes('这一组条件还没有图'));
await edge.send('Page.navigate', { url: BASE });
await waitFor("document.querySelectorAll('.dv-tile').length === 20");
await evaluate(`(() => {
  const select = document.querySelector('#dv-domain');
  select.value = 'education';
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await sleep(450);
check('领域筛选出 2 张教育卡片', (await evaluate("document.querySelectorAll('.dv-tile').length")) === 2);

// 4. Author sentence, Basic/Advanced, no forbidden labels.
await open('#/t/metro-ridership/daily?goal=change', 'metro-ridership', 'daily');
const authorText = await body();
check('有 Basic 句型', authorText.toUpperCase().includes('BASIC'));
check('有 Advanced 句型', authorText.toUpperCase().includes('ADVANCED'));
check('预先写好的原句标「原句」', authorText.includes('原句'));
check('页面不出现「作者」', !authorText.includes('作者'));
check('页面不出现 A2/B1/B2', !/\bA2\b|\bB1\b|\bB2\b/.test(authorText));
check('页面不显示计数语', !/(个主题|种图表|已学|完成|第\s*\d+\s*\/\s*\d+)/.test(authorText));
check('整图说明可折叠', (await evaluate("!!document.querySelector('details') && (document.querySelector('details').open = true, document.querySelector('details').open)")));
const markBeforeNav = (await snapshot()).mark;
await clickButton('下一处');
await sleep(350);
const markAfterNext = (await snapshot()).mark;
check('下一处能换一处', !!markAfterNext && markAfterNext !== markBeforeNav);
await clickButton('上一处');
await sleep(350);
check('上一处能回到原处', (await snapshot()).mark === markBeforeNav);

// 5. Auto mark label.
await evaluate(`(() => {
  const item = window.__dvView.marks.find((entry) => entry.auto === true && entry.marks.length);
  if (item) window.__dv.selectMark(item.marks[0]);
})()`);
await sleep(300);
check('自动生成的句子有标记', (await body()).includes('自动生成'));

// 6. Editing hides the original, reset restores it.
await evaluate(`(() => {
  const item = window.__dvView.marks.find((entry) => entry.auto === false && entry.marks.length);
  if (item) window.__dv.selectMark(item.marks[0]);
})()`);
await sleep(300);
await clickChip('编辑数据');
await setNumberInput(9);
check('改数据后原句隐藏', (await body()).includes('原句是按原始数据写的'));
await resetCurrent();
check('还原后原句回来', (await body()).includes('原句'));

// 7. View switcher.
await clickChip('站点');
await sleep(450);
check('视图切换生效', (await snapshot()).view === 'stations');

// 8. Drag every draggable family.
const dragCases = [
  {
    name: '折线图',
    hash: '#/t/metro-ridership/daily',
    slug: 'metro-ridership',
    view: 'daily',
    point: `(() => {
      const data = window.__dvView.data;
      return window.__dvChart.convertToPixel({ seriesIndex: 0 }, [data.x.values[0], data.series[0].values[0]]);
    })()`,
    delta: { x: 0, y: 30 },
  },
  {
    name: '柱状图',
    hash: '#/t/metro-ridership/stations',
    slug: 'metro-ridership',
    view: 'stations',
    point: `(() => {
      const data = window.__dvView.data;
      return window.__dvChart.convertToPixel({ seriesIndex: 0 }, [data.x.values[0], data.series[0].values[0]]);
    })()`,
    delta: { x: 0, y: 24 },
  },
  {
    name: '瀑布图',
    hash: '#/t/energy-mix/capacity',
    slug: 'energy-mix',
    view: 'capacity',
    point: `(() => {
      const data = window.__dvView.data;
      const step = data.steps[0];
      return window.__dvChart.convertToPixel({ seriesIndex: 1 }, [step.name_en, data.start_value + step.value]);
    })()`,
    delta: { x: 0, y: 24 },
  },
  {
    name: '斜率图',
    hash: '#/t/team-headcount/mix',
    slug: 'team-headcount',
    view: 'mix',
    point: `(() => {
      const data = window.__dvView.data;
      return window.__dvChart.convertToPixel({ seriesIndex: 0 }, [data.periods[0].label_en, data.entities[0].values[0]]);
    })()`,
    delta: { x: 0, y: 20 },
  },
  {
    name: '散点图',
    hash: '#/t/commute-time/distance',
    slug: 'commute-time',
    view: 'distance',
    point: `(() => {
      const data = window.__dvView.data;
      const point = data.points[0];
      return window.__dvChart.convertToPixel({ seriesIndex: 0 }, [point.x, point.y]);
    })()`,
    delta: { x: 18, y: 18 },
  },
];

for (const item of dragCases) {
  await open(item.hash, item.slug, item.view);
  const start = await atPoint(item.point);
  if (!start) {
    check(`${item.name}拖动`, false, '找不到坐标');
    continue;
  }
  const before = (await snapshot()).edits;
  await clickChip('编辑数据');
  await drag(start, { x: start.x + item.delta.x, y: start.y + item.delta.y });
  const after = (await snapshot()).edits;
  check(`${item.name}拖动`, after > before, `${before} → ${after}`);
  await resetCurrent();
}

// 9. Pie drag.
await open('#/t/household-budget/shares', 'household-budget', 'shares');
const piePoints = await evaluate(`(() => {
  const data = window.__dvView.data;
  const host = document.querySelector('main [role="img"]').getBoundingClientRect();
  const width = window.__dvChart.getWidth();
  const height = window.__dvChart.getHeight();
  const cx = host.left + width * 0.5, cy = host.top + height * 0.44;
  const radius = Math.min(width, height) * 0.35 * 0.8;
  const total = data.parts.reduce((sum, part) => sum + part.value, 0);
  const angle = (data.parts[0].value / total) * 360 / 2;
  const rad = (angle * Math.PI) / 180;
  const targetRad = rad + 0.45;
  return {
    from: { x: cx + Math.sin(rad) * radius, y: cy - Math.cos(rad) * radius },
    to: { x: cx + Math.sin(targetRad) * radius, y: cy - Math.cos(targetRad) * radius },
  };
})()`);
const pieBefore = (await snapshot()).edits;
await clickChip('编辑数据');
await drag(piePoints.from, piePoints.to);
check('饼图拖动', (await snapshot()).edits > pieBefore);
await resetCurrent();

// 10. Input-only families.
const inputCases = [
  ['堆叠图', '#/t/remote-work/split', 'remote-work', 'split', 'seg:'],
  ['热力图', '#/t/coffee-shop/hours', 'coffee-shop', 'hours', 'cell:'],
  ['流向图', '#/t/household-budget/flows', 'household-budget', 'flows', 'link:'],
  ['饼图输入', '#/t/household-budget/shares', 'household-budget', 'shares', 'slice:'],
];
for (const [name, hash, slug, view, prefix] of inputCases) {
  await open(hash, slug, view);
  await evaluate(`(() => {
    const item = window.__dvView.marks.find((entry) => entry.marks.some((mark) => mark.startsWith(${JSON.stringify(prefix)})));
    if (item) window.__dv.selectMark(item.marks.find((mark) => mark.startsWith(${JSON.stringify(prefix)})));
  })()`);
  await sleep(300);
  const before = (await snapshot()).edits;
  await clickChip('编辑数据');
  const changed = await setNumberInput(5);
  check(`${name}输入`, changed && (await snapshot()).edits > before);
  await resetCurrent();
}

// 11. Themes and phone width.
for (const theme of ['dark', 'glass', 'light']) {
  await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
  await sleep(250);
  check(`${theme} 主题图表正常`, (await evaluate('!!window.__dvChart && window.__dvChart.getWidth() > 0')));
}
await edge.send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await sleep(400);
check('手机宽度详情无横向溢出', !(await evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')));
await edge.send('Page.navigate', { url: BASE });
await waitFor("document.querySelectorAll('.dv-tile').length > 0");
await sleep(300);
check('手机宽度首页无横向溢出', !(await evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')));
await edge.send('Emulation.clearDeviceMetricsOverride');
check('Demo 标记仍在', (await body()).includes('Demo data · 模拟数据'));

check('没有 console / 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));

edge.close();
stopServer();
const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`);
if (failed.length) process.exitCode = 1;
