// 数据图表英语 Atlas：内容校验与打包。
//
// 源在 content/data-viz/atlas/，产物在 public/data/：
//   index.json            首页、目录、表达分类、场景索引
//   charts/<id>.json      每个图表页（含 ztd 图表 spec 与教学内容）
//   expressions/<id>.json 每个表达功能分类
//   contexts/<id>.json    每个真实场景
//
// 用法：
//   node scripts/build-content.mjs           校验并写出
//   node scripts/build-content.mjs --check   只校验
//   node scripts/build-content.mjs --inspect <dataset>   打印数据集展开后的行与统计
//
// 校验不只查结构：英式英语、练习/问答式措辞、编造的数字、失效的交叉链接
// 都会让构建失败。数字校验的规则见 apps/data-viz/source/AUTHORING.md。

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHARTS, getChartDef, validateSpec } from 'ztd-charts/spec';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const contentRoot = join(repo, 'content', 'data-viz', 'atlas');
const publicData = resolve(here, '../public/data');
const checkOnly = process.argv.includes('--check');
const allowIncomplete = process.argv.includes('--allow-incomplete');
const inspectId = process.argv.indexOf('--inspect') >= 0
  ? process.argv[process.argv.indexOf('--inspect') + 1]
  : null;

const problems = [];
const fail = (message) => problems.push(message);

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    fail(`${rel(file)}: ${error.message}`);
    return null;
  }
}

function rel(file) {
  return file.replace(repo, '').replace(/^[\\/]/, '').replaceAll('\\', '/');
}

async function readDir(dir) {
  try {
    const names = await readdir(dir);
    return names.filter((name) => name.endsWith('.json')).sort();
  } catch {
    fail(`${rel(dir)}: 目录不存在`);
    return [];
  }
}

// ---- 数据集 ---------------------------------------------------------------

const STATE_CODES = (
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN ' +
  'MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA ' +
  'WV WI WY'
).split(' ');

function isoDays(from, to) {
  const days = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    days.push(d);
  }
  return days;
}

function expandDataset(dataset) {
  const g = dataset.generate;
  if (!g) return dataset;
  const rows = [];
  if (g.kind === 'daily') {
    const days = isoDays(g.from, g.to);
    days.forEach((date, i) => {
      const weekday = date.getUTCDay();
      const weekend = weekday === 0 || weekday === 6 ? g.weekend ?? 0 : 0;
      const wave = Math.round((g.wave ?? 0) * Math.sin((2 * Math.PI * i) / (g.period ?? 30)));
      const drift = Math.round(((g.drift ?? 0) * i) / Math.max(1, days.length - 1));
      rows.push({
        date: date.toISOString().slice(0, 10),
        [g.field]: g.base + weekend + wave + drift,
      });
    });
  } else if (g.kind === 'distribution') {
    const offsets = [0, -0.55, 0.4, -1.1, 0.8, -0.25, 1.3, -0.7, 0.15, -1.6, 0.95, -0.4, 1.75, -0.95];
    for (const group of g.groups) {
      for (let i = 0; i < group.count; i++) {
        const offset = offsets[i % offsets.length];
        const tail = i % 11 === 10 ? group.spread * 1.4 : 0;
        rows.push({
          id: `${group.name.replace(/\s+/g, '-').toLowerCase()}-${String(i + 1).padStart(2, '0')}`,
          group: group.name,
          [g.field]: Math.max(1, Math.round(group.base + offset * group.spread + tail)),
        });
      }
    }
  } else if (g.kind === 'series_grid') {
    g.series.forEach((name, s) => {
      g.periods.forEach((period, i) => {
        const series = g.series[s];
        const base = g.base + s * (g.seriesStep ?? 1);
        const value = base + i * (g.step ?? 0) + Math.round((g.wave ?? 0) * Math.sin(i / 1.7 + s));
        rows.push({ [g.periodField]: period, [g.seriesField]: series, [g.field]: value });
      });
    });
  } else if (g.kind === 'us_states') {
    STATE_CODES.forEach((code, i) => {
      rows.push({ state: code, [g.field]: g.base + ((i * (g.step ?? 7)) % 41) - 12 });
    });
  } else if (g.kind === 'heatmap_grid') {
    g.days.forEach((day) => {
      g.hours.forEach((hour, h) => {
        const evening = h >= 8 ? (h - 7) * (g.evening ?? 3) : 0;
        const weekend = day === 'Sat' || day === 'Sun' ? (g.weekend ?? 6) : 0;
        rows.push({
          [g.dayField]: day,
          [g.hourField]: hour,
          [g.field]: g.base + evening + weekend + ((h * 7 + day.length * 3) % 11),
        });
      });
    });
  } else {
    fail(`${dataset.id}: 未知的 generate.kind "${g.kind}"`);
    return dataset;
  }
  return { ...dataset, rows };
}

// ---- 数字校验 -------------------------------------------------------------

const NUMBER_RE = /(?<![\w.])-?\d[\d,]*(?:\.\d+)?/g;

function numbersIn(text) {
  return (String(text).match(NUMBER_RE) ?? [])
    .map((token) => Number(token.replaceAll(',', '')))
    .filter((value) => Number.isFinite(value));
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function addNumber(set, value) {
  if (!Number.isFinite(value)) return;
  set.add(value);
  set.add(roundTo(value, 1));
  set.add(Math.round(value));
}

function allowedNumbers(rows) {
  const allowed = new Set();
  for (let year = 2020; year <= 2030; year++) allowed.add(year);
  const numeric = [];
  const textInts = [];
  for (const row of rows) {
    for (const value of Object.values(row)) {
      if (typeof value === 'number') {
        numeric.push(value);
        addNumber(allowed, value);
        addNumber(allowed, Math.abs(value));
      } else if (typeof value === 'string') {
        for (const token of value.match(/\d+/g) ?? []) {
          textInts.push(Number(token));
          addNumber(allowed, Number(token));
        }
      }
    }
  }
  for (const value of textInts) addNumber(allowed, value);
  // 差值
  for (let i = 0; i < numeric.length; i++) {
    for (let j = i + 1; j < numeric.length; j++) {
      addNumber(allowed, Math.abs(numeric[i] - numeric[j]));
    }
  }
  // 变化率
  for (let i = 0; i < numeric.length; i++) {
    for (let j = 0; j < numeric.length; j++) {
      if (i === j || Math.abs(numeric[i]) < 1) continue;
      addNumber(allowed, roundTo(((numeric[j] - numeric[i]) / Math.abs(numeric[i])) * 100, 1));
    }
  }
  // 分组求和与占比
  const keys = new Set();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'string') keys.add(key);
    }
  }
  for (const key of keys) {
    const groups = new Map();
    for (const row of rows) {
      const bucket = groups.get(row[key]) ?? [];
      for (const [field, value] of Object.entries(row)) {
        if (typeof value === 'number') {
          bucket.push({ field, value });
        }
      }
      groups.set(row[key], bucket);
    }
    for (const bucket of groups.values()) {
      const totals = new Map();
      for (const { field, value } of bucket) {
        totals.set(field, (totals.get(field) ?? 0) + value);
      }
      for (const total of totals.values()) addNumber(allowed, total);
    }
  }
  for (const row of rows) {
    const values = Object.values(row).filter((value) => typeof value === 'number');
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      for (const value of values) {
        addNumber(allowed, roundTo((value / total) * 100, 1));
      }
    }
  }
  return allowed;
}

function checkNumbers(text, allowed, where) {
  if (typeof text !== 'string') return;
  for (const value of numbersIn(text)) {
    if (!allowed.has(value) && !allowed.has(roundTo(value, 1))) {
      fail(`${where}: 数字 ${value} 不在数据集里（也不是可由数据算出的差值/占比）。原句：${text}`);
    }
  }
}

const allowedCache = new Map();
function allowedFor(dataset) {
  if (!allowedCache.has(dataset.id)) allowedCache.set(dataset.id, allowedNumbers(dataset.rows));
  return allowedCache.get(dataset.id);
}

// ---- 英式英语与禁用措辞 ---------------------------------------------------

const BRITISH = [
  [/\bcolour(s|ed|ing|ful)?\b/gi, 'color'],
  [/\bfavour(s|ed|ing|able|ite|ites)?\b/gi, 'favor'],
  [/\bhonour(s|ed|ing|able)?\b/gi, 'honor'],
  [/\bbehaviour(s)?\b/gi, 'behavior'],
  [/\bneighbour(s|hood|hoods)?\b/gi, 'neighbor'],
  [/\bcentre(s)?\b/gi, 'center'],
  [/\btheatre(s)?\b/gi, 'theater'],
  [/\bmetre(s)?\b/gi, 'meter'],
  [/\bkilometre(s)?\b/gi, 'kilometer'],
  [/\bcentimetre(s)?\b/gi, 'centimeter'],
  [/\blitre(s)?\b/gi, 'liter'],
  [/\bprogramme(s)?\b/gi, 'program'],
  [/\bdefence\b/gi, 'defense'],
  [/\boffence\b/gi, 'offense'],
  [/\b(licence|licences)\b/gi, 'license'],
  [/\bpractis(e|es|ed|ing)\b/gi, 'practice'],
  [/\b(realis|organis|recognis|apologis|specialis|standardi|summari|emphasi|categoris|minimis|maximis|criticis)(e|ed|es|ing)\b/gi, '-ize'],
  [/\banalys(e|ed|es|ing)\b/gi, 'analyze'],
  [/\btravell(ed|ing|er|ers)\b/gi, 'traveled'],
  [/\bcancell(ed|ing)\b/gi, 'canceled'],
  [/\blabell(ed|ing)\b/gi, 'labeled'],
  [/\bmodell(ed|ing)\b/gi, 'modeled'],
  [/\bjewellery\b/gi, 'jewelry'],
  [/\bjudgement\b/gi, 'judgment'],
  [/\bgrey(s|er|est)?\b/gi, 'gray'],
  [/\baluminium\b/gi, 'aluminum'],
  [/\btyre(s)?\b/gi, 'tire'],
  [/\bkerb(s)?\b/gi, 'curb'],
  [/\bpyjamas\b/gi, 'pajamas'],
  [/\bmoustache\b/gi, 'mustache'],
  [/\benrol(ed|ing|ment|ments)?\b/gi, 'enroll'],
  [/\bfulfil(l)?\b/gi, 'fulfill'],
  [/\bskilful\b/gi, 'skillful'],
  [/\bageing\b/gi, 'aging'],
  [/\bcheque(s)?\b/gi, 'check'],
  [/\bplough(s|ed|ing)?\b/gi, 'plow'],
  [/\bmould(s|ed|ing)?\b/gi, 'mold'],
  [/\btonne(s)?\b/gi, 'ton'],
  [/\bstorey(s)?\b/gi, 'story'],
  [/\b(learnt|spelt|burnt|dreamt|leant)\b/gi, '-ed'],
  [/\bqueue(s|d|ing)?\b/gi, 'line'],
  [/\brubbish\b/gi, 'trash'],
  [/\bpavement(s)?\b/gi, 'sidewalk'],
  [/\bcar ?park(s)?\b/gi, 'parking lot'],
  [/\bzebra crossing(s)?\b/gi, 'crosswalk'],
  [/\blorries?\b/gi, 'truck'],
  [/\bpetrol\b/gi, 'gas'],
  [/\bmobile phone(s)?\b/gi, 'cell phone'],
  [/\bcinema(s)?\b/gi, 'movie theater'],
  [/\bbiscuit(s)?\b/gi, 'cookie'],
  [/\bcrisps\b/gi, 'chips'],
  [/\bmaths\b/gi, 'math'],
  [/(?<!Mid-)\bautumn\b/gi, 'fall'],
  [/\bchemist(s)?\b/gi, 'pharmacy'],
  [/\bpostcode(s)?\b/gi, 'zip code'],
  [/\baeroplane(s)?\b/gi, 'airplane'],
  [/\bmotorway(s)?\b/gi, 'highway'],
  [/\bfortnight(s)?\b/gi, 'two weeks'],
  [/\bparcel(s)?\b/gi, 'package'],
  [/\bdustbin(s)?\b/gi, 'trash can'],
  [/\bnapp(y|ies)\b/gi, 'diaper'],
  [/\bpram(s)?\b/gi, 'stroller'],
  [/\bcourgette(s)?\b/gi, 'zucchini'],
  [/\baubergine(s)?\b/gi, 'eggplant'],
  [/\bhoover(s|ed|ing)?\b/gi, 'vacuum'],
  [/\bflyover(s)?\b/gi, 'overpass'],
  [/\bat the weekend\b/gi, 'on the weekend'],
  [/\bdifferent to\b/gi, 'different from'],
  [/\bon holiday\b/gi, 'on vacation'],
  [/\bin hospital\b/gi, 'in the hospital'],
];

const BANNED = [
  [/\bquiz(zes)?\b/gi, '不要出现 quiz'],
  [/\bexercise(s)?\b/gi, '不要出现 exercise'],
  [/\bchallenge(s)?\b/gi, '不要出现 challenge'],
  [/\btest yourself\b/gi, '不要出试题'],
  [/\byour turn\b/gi, '不要出现 your turn'],
  [/\btry to describe\b/gi, '不要出现 try to describe'],
  [/\bwhat can you see\b/gi, '不要出现 what can you see'],
  [/\bwhich one is\b/gi, '不要出现 which one is'],
  [/\bcan you describe\b/gi, '不要出现 can you describe'],
  [/\bfill in the blank/gi, '不要出填空题'],
  [/\bmultiple choice\b/gi, '不要出选择题'],
  [/\bcheck your answer/gi, '不要揭示答案'],
  [/\bmark as (learned|done|complete)/gi, '不要做已学标记'],
];

const FORBIDDEN_ZH = [
  [/已学|打卡|学习进度|完成度|标记已学/g, '不要做学习进度标记'],
  [/\d+\s*(个主题|种图表|条表达|条词条|条搭配)/g, '不要显示计数'],
  [/·\s*\d+\s*条/g, '不要显示计数'],
];

function scanEnglish(text, where) {
  if (typeof text !== 'string') return;
  for (const [rule, suggestion] of BRITISH) {
    const match = text.match(rule);
    if (match) fail(`${where}: 英式英语 "${match[0]}"，改成 ${suggestion}`);
  }
  for (const [rule, note] of BANNED) {
    const match = text.match(rule);
    if (match) fail(`${where}: ${note}（命中 "${match[0]}"）`);
  }
  for (const [rule, note] of FORBIDDEN_ZH) {
    const match = text.match(rule);
    if (match) fail(`${where}: ${note}（命中 "${match[0]}"）`);
  }
}

function walkStrings(value, where, visit) {
  if (typeof value === 'string') {
    visit(value, where);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => walkStrings(item, `${where}[${i}]`, visit));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      walkStrings(item, `${where}.${key}`, visit);
    }
  }
}

function wordCount(text) {
  return String(text).split(/\s+/).filter((word) => /[A-Za-z]/.test(word)).length;
}

// ---- 读取内容 -------------------------------------------------------------

const site = await readJson(join(contentRoot, 'site.json'));
const families = (await readJson(join(contentRoot, 'families.json'))) ?? [];
const chartTypes = (await readJson(join(contentRoot, 'chart-types.json'))) ?? [];

const datasets = new Map();
for (const name of await readDir(join(contentRoot, 'datasets'))) {
  const file = join(contentRoot, 'datasets', name);
  const raw = await readJson(file);
  if (!raw) continue;
  const dataset = expandDataset(raw);
  const id = dataset.id || name.replace(/\.json$/, '');
  if (datasets.has(id)) fail(`${rel(file)}: 数据集 id 重复 "${id}"`);
  if (!Array.isArray(dataset.rows) || dataset.rows.length < 1) {
    fail(`${rel(file)}: rows 不能为空`);
  }
  if (!dataset.title_en || !dataset.title_zh) fail(`${rel(file)}: 需要 title_en 与 title_zh`);
  if (!dataset.unit_en || !dataset.note_zh) fail(`${rel(file)}: 需要 unit_en 与 note_zh`);
  datasets.set(id, { ...dataset, id });
}

const expressionGroups = new Map();
for (const name of await readDir(join(contentRoot, 'expressions'))) {
  const file = join(contentRoot, 'expressions', name);
  const group = await readJson(file);
  if (!group) continue;
  const id = group.id || name.replace(/\.json$/, '');
  if (expressionGroups.has(id)) fail(`${rel(file)}: 表达分类 id 重复 "${id}"`);
  if (!group.name_en || !group.name_zh || !group.intro_zh) {
    fail(`${rel(file)}: 需要 name_en、name_zh、intro_zh`);
  }
  if (!Array.isArray(group.expressions) || group.expressions.length < 6) {
    fail(`${rel(file)}: 至少 6 条表达`);
  }
  const ids = new Set();
  for (const [i, item] of (group.expressions ?? []).entries()) {
    const at = `${rel(file)}.expressions[${i}]`;
    if (!item.id || !item.head || !item.meaning_zh) fail(`${at}: 需要 id/head/meaning_zh`);
    if (ids.has(item.id)) fail(`${at}: 表达 id 重复 "${item.id}"`);
    ids.add(item.id);
    if (!item.pattern) fail(`${at}: 需要 pattern`);
    if (!['A1', 'A2', 'B1', 'B2', 'C1'].includes(item.cefr)) fail(`${at}: cefr 无效`);
    if (!['neutral', 'formal', 'informal'].includes(item.register)) fail(`${at}: register 无效`);
    if (!Array.isArray(item.scenes) || !item.scenes.length) fail(`${at}: 需要 scenes`);
    if (!Array.isArray(item.collocations) || item.collocations.length < 2) fail(`${at}: 至少 2 个搭配`);
    if (!Array.isArray(item.examples) || !item.examples.length) fail(`${at}: 需要例句`);
    for (const [k, example] of (item.examples ?? []).entries()) {
      if (!example.en || !example.zh) fail(`${at}: 例句需要 en/zh`);
      if (example.chart && !chartTypes.some((chart) => chart.id === example.chart)) {
        fail(`${at}: 例句指向未知图表 "${example.chart}"`);
      }
      if (example.chart) {
        const chartEntry = chartTypes.find((chart) => chart.id === example.chart);
        const dataset = datasets.get(chartEntry?.dataset);
        if (dataset) {
          checkNumbers(example.en, allowedFor(dataset), `${at}.examples[${k}]`);
        }
      }
    }
    if (!item.contrast_zh) fail(`${at}: 需要 contrast_zh（与其他表达的差别）`);
  }
  if (typeof group.order !== 'number') fail(`${rel(file)}: 需要 order`);
  expressionGroups.set(id, { ...group, id });
}

const lessons = new Map();
for (const name of await readDir(join(contentRoot, 'lessons'))) {
  const file = join(contentRoot, 'lessons', name);
  const lesson = await readJson(file);
  if (!lesson) continue;
  const id = name.replace(/\.json$/, '');
  if (lessons.has(id)) fail(`${rel(file)}: 课程重复 "${id}"`);
  if (lesson.chart !== id) fail(`${rel(file)}: chart 字段必须是 "${id}"`);
  if (!datasets.has(lesson.dataset)) fail(`${rel(file)}: 未知数据集 "${lesson.dataset}"`);
  if (!chartTypes.some((chart) => chart.id === id)) fail(`${rel(file)}: 不在 chart-types.json 里`);
  const need = ['overview', 'understanding', 'observations', 'describe', 'descriptions', 'language_notes', 'related'];
  for (const key of need) {
    if (!lesson[key]) fail(`${rel(file)}: 缺少 ${key}`);
  }
  if (!Array.isArray(lesson.observations) || lesson.observations.length < 3) {
    fail(`${rel(file)}: observations 至少 3 条`);
  }
  if (!Array.isArray(lesson.describe) || lesson.describe.length < 5) {
    fail(`${rel(file)}: describe 至少 5 条`);
  }
  const groupsUsed = new Set();
  for (const [i, item] of (lesson.describe ?? []).entries()) {
    const at = `${rel(file)}.describe[${i}]`;
    if (!item.group || !expressionGroups.has(item.group)) fail(`${at}: 未知表达分类 "${item.group}"`);
    const group = expressionGroups.get(item.group);
    if (item.expression && group && !group.expressions.some((expression) => expression.id === item.expression)) {
      fail(`${at}: 分类 ${item.group} 里没有表达 "${item.expression}"`);
    }
    if (!item.en || !item.zh) fail(`${at}: 需要 en/zh`);
    if (!item.pattern) fail(`${at}: 需要 pattern`);
    if (!Array.isArray(item.alternatives) || !item.alternatives.length) fail(`${at}: 需要 alternatives`);
    groupsUsed.add(item.group);
  }
  if (groupsUsed.size < 3) fail(`${rel(file)}: describe 至少要覆盖 3 个不同表达分类`);
  for (const key of ['academic', 'business', 'simple']) {
    const version = lesson.descriptions?.[key];
    if (!version?.en || !version?.zh) fail(`${rel(file)}: descriptions.${key} 需要 en/zh`);
    else if (wordCount(version.en) < 40) fail(`${rel(file)}: descriptions.${key}.en 至少 40 词`);
  }
  if (!Array.isArray(lesson.language_notes) || lesson.language_notes.length < 2) {
    fail(`${rel(file)}: language_notes 至少 2 条`);
  }
  for (const [i, note] of (lesson.language_notes ?? []).entries()) {
    if (!note.title_en || !note.body_zh) fail(`${rel(file)}.language_notes[${i}]: 需要 title_en/body_zh`);
    if (!Array.isArray(note.examples) || !note.examples.length) {
      fail(`${rel(file)}.language_notes[${i}]: 需要 examples`);
    }
  }
  if (!lesson.overview?.purpose_zh) fail(`${rel(file)}: overview.purpose_zh 必填`);
  if ((lesson.overview?.works_zh ?? []).length < 2) fail(`${rel(file)}: overview.works_zh 至少 2 条`);
  if ((lesson.overview?.uses_zh ?? []).length < 2) fail(`${rel(file)}: overview.uses_zh 至少 2 条`);
  if (!lesson.understanding?.read_zh) fail(`${rel(file)}: understanding.read_zh 必填`);
  if ((lesson.understanding?.elements ?? []).length < 3) fail(`${rel(file)}: understanding.elements 至少 3 条`);
  if ((lesson.understanding?.look_for_zh ?? []).length < 2) fail(`${rel(file)}: understanding.look_for_zh 至少 2 条`);
  if (!Array.isArray(lesson.related?.groups) || lesson.related.groups.length < 2) {
    fail(`${rel(file)}: related.groups 至少 2 个`);
  }
  if (!Array.isArray(lesson.related?.charts) || !lesson.related.charts.length) {
    fail(`${rel(file)}: related.charts 至少 1 个`);
  }
  if (!Array.isArray(lesson.related?.contexts) || !lesson.related.contexts.length) {
    fail(`${rel(file)}: related.contexts 至少 1 个`);
  }
  if (!lesson.spec?.encoding) fail(`${rel(file)}: spec.encoding 必填`);
  lessons.set(id, lesson);
}

const contexts = new Map();
for (const name of await readDir(join(contentRoot, 'contexts'))) {
  const file = join(contentRoot, 'contexts', name);
  const context = await readJson(file);
  if (!context) continue;
  const id = context.id || name.replace(/\.json$/, '');
  if (contexts.has(id)) fail(`${rel(file)}: 场景 id 重复 "${id}"`);
  if (!context.name_en || !context.name_zh || !context.intro_zh || !context.intro_en) {
    fail(`${rel(file)}: 需要 name_en/name_zh/intro_en/intro_zh`);
  }
  if (!Array.isArray(context.moves) || context.moves.length < 3) {
    fail(`${rel(file)}: moves 至少 3 条`);
  }
  for (const [i, move] of (context.moves ?? []).entries()) {
    if (!move.name_en || !move.name_zh || !Array.isArray(move.examples) || !move.examples.length) {
      fail(`${rel(file)}.moves[${i}]: 需要 name_en/name_zh/examples`);
    }
  }
  if (!Array.isArray(context.focus_groups) || context.focus_groups.length < 3) {
    fail(`${rel(file)}: focus_groups 至少 3 个`);
  }
  for (const group of context.focus_groups ?? []) {
    if (!expressionGroups.has(group)) fail(`${rel(file)}: 未知表达分类 "${group}"`);
  }
  if (!Array.isArray(context.charts) || context.charts.length < 3) {
    fail(`${rel(file)}: charts 至少 3 个`);
  }
  for (const chart of context.charts ?? []) {
    if (!chartTypes.some((entry) => entry.id === chart)) fail(`${rel(file)}: 未知图表 "${chart}"`);
  }
  if (!context.worked?.chart || !chartTypes.some((entry) => entry.id === context.worked.chart)) {
    fail(`${rel(file)}: worked.chart 无效`);
  }
  if (!context.worked?.dataset || !datasets.has(context.worked.dataset)) {
    fail(`${rel(file)}: worked.dataset 无效`);
  }
  if (!context.worked?.spec?.encoding) fail(`${rel(file)}: worked.spec.encoding 必填`);
  if (wordCount(context.worked?.en ?? '') < 50) fail(`${rel(file)}: worked.en 至少 50 词`);
  if (!context.worked?.zh) fail(`${rel(file)}: worked.zh 必填`);
  const workedDataset = datasets.get(context.worked?.dataset);
  if (workedDataset && context.worked?.en) {
    checkNumbers(context.worked.en, allowedFor(workedDataset), `${rel(file)}.worked.en`);
  }
  if (context.worked?.spec?.encoding) {
    const workedSpec = {
      type: context.worked.chart,
      data: workedDataset?.rows ?? [],
      encoding: context.worked.spec.encoding,
      options: context.worked.spec.options ?? {},
    };
    const result = validateSpec(workedSpec);
    for (const issue of result.issues ?? []) {
      fail(`${rel(file)}: worked spec 校验失败 [${issue.code}] ${issue.message}`);
    }
  }
  if (!Array.isArray(context.pitfalls_zh) || context.pitfalls_zh.length < 2) {
    fail(`${rel(file)}: pitfalls_zh 至少 2 条`);
  }
  if (typeof context.order !== 'number') fail(`${rel(file)}: 需要 order`);
  contexts.set(id, { ...context, id });
}

// ---- 图表目录与课程 -------------------------------------------------------

if (!site) fail('site.json 缺失');
if (!families.length) fail('families.json 为空');
if (chartTypes.length !== CHARTS.length) {
  fail(`chart-types.json 应有 ${CHARTS.length} 种图表，实际 ${chartTypes.length}`);
}
const chartIds = new Set(chartTypes.map((chart) => chart.id));
for (const def of CHARTS) {
  const entry = chartTypes.find((chart) => chart.id === def.type);
  if (!entry) {
    fail(`chart-types.json 缺少图表 "${def.type}"`);
    continue;
  }
  if (entry.family !== def.group) {
    fail(`chart-types.json.${entry.id}: family 应为 "${def.group}"`);
  }
  if (!entry.name_zh || !entry.what_zh) fail(`chart-types.json.${entry.id}: 需要 name_zh/what_zh`);
  if (!Array.isArray(entry.focus) || entry.focus.length < 2) {
    fail(`chart-types.json.${entry.id}: focus 至少 2 个表达分类`);
  }
  if (!entry.dataset || !datasets.has(entry.dataset)) {
    fail(`chart-types.json.${entry.id}: dataset 无效`);
  }
  for (const group of entry.focus ?? []) {
    if (!expressionGroups.has(group)) fail(`chart-types.json.${entry.id}: 未知表达分类 "${group}"`);
  }
  if (!allowIncomplete && !lessons.has(def.type)) fail(`缺少 lessons/${def.type}.json`);
}

const familyIds = new Set(families.map((family) => family.id));
for (const family of families) {
  if (!['proportion', 'hierarchy', 'flow', 'comparison', 'trend', 'distribution', 'relationship', 'map', 'kpi'].includes(family.id)) {
    fail(`families.json: 未知分类 "${family.id}"`);
  }
  if (!family.name_en || !family.name_zh || !family.intro_zh) {
    fail(`families.json.${family.id}: 需要 name_en/name_zh/intro_zh`);
  }
  if (typeof family.order !== 'number') fail(`families.json.${family.id}: 需要 order`);
}
for (const def of CHARTS) {
  if (!familyIds.has(def.group)) fail(`families.json 缺少 "${def.group}" 分类`);
}

// ---- 交叉引用、数字、措辞 -------------------------------------------------

const chartById = new Map(chartTypes.map((chart) => [chart.id, chart]));

for (const [id, lesson] of lessons) {
  const dataset = datasets.get(lesson.dataset);
  if (!dataset) continue;
  const allowed = allowedFor(dataset);
  const where = `lessons/${id}.json`;
  walkStrings(
    {
      observations: lesson.observations,
      describe: lesson.describe,
      descriptions: lesson.descriptions,
      language_notes: lesson.language_notes,
      overview: lesson.overview,
      understanding: lesson.understanding,
    },
    where,
    (text, at) => {
      scanEnglish(text, at);
      // 中文解释里的「第 95 百分位」这类数字不是数据引用，不参与数字核对。
      if (at.endsWith('_zh') || at.endsWith('.zh')) return;
      checkNumbers(text, allowed, at);
    },
  );
  for (const chart of lesson.related?.charts ?? []) {
    if (!chartById.has(chart)) fail(`${where}: related.charts 未知 "${chart}"`);
  }
  for (const group of lesson.related?.groups ?? []) {
    if (!expressionGroups.has(group)) fail(`${where}: related.groups 未知 "${group}"`);
  }
  for (const context of lesson.related?.contexts ?? []) {
    if (!contexts.has(context)) fail(`${where}: related.contexts 未知 "${context}"`);
  }
  const spec = {
    type: id,
    data: dataset.rows,
    encoding: lesson.spec?.encoding,
    options: lesson.spec?.options ?? {},
  };
  const result = validateSpec(spec);
  for (const issue of result.issues ?? []) {
    fail(`${where}: ztd 校验失败 [${issue.code}] ${issue.message}`);
  }
}

for (const [id, group] of expressionGroups) {
  walkStrings(group, `expressions/${id}.json`, scanEnglish);
}
for (const [id, context] of contexts) {
  walkStrings(context, `contexts/${id}.json`, (text, at) => {
    scanEnglish(text, at);
    if (at.endsWith('.worked.en') || at.endsWith('.intro_en')) return;
  });
}
walkStrings(site, 'site.json', scanEnglish);
walkStrings(families, 'families.json', scanEnglish);
walkStrings(
  chartTypes.map(({ id, name_zh, what_zh }) => ({ id, name_zh, what_zh })),
  'chart-types.json',
  scanEnglish,
);

// ---- 输出 -----------------------------------------------------------------

if (inspectId) {
  const dataset = datasets.get(inspectId);
  if (!dataset) {
    console.error(`没有数据集 "${inspectId}"`);
    process.exit(1);
  }
  console.log(JSON.stringify({ id: dataset.id, title_en: dataset.title_en, unit_en: dataset.unit_en, rows: dataset.rows }, null, 2));
  process.exit(problems.length ? 1 : 0);
}

if (problems.length) {
  console.error(`内容校验失败（${problems.length} 项）：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const expressionCount = [...expressionGroups.values()].reduce((sum, group) => sum + group.expressions.length, 0);
if (checkOnly) {
  console.log(
    `content ok: ${chartTypes.length} charts, ${expressionCount} expressions, ${contexts.size} contexts, ${datasets.size} datasets`,
  );
  process.exit(0);
}

if (!checkOnly) {
  await mkdir(join(publicData, 'charts'), { recursive: true });
  await mkdir(join(publicData, 'expressions'), { recursive: true });
  await mkdir(join(publicData, 'contexts'), { recursive: true });

  const sortedFamilies = [...families].sort((a, b) => a.order - b.order);
  const chartIndex = [...chartTypes]
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .map((entry) => {
      const def = getChartDef(entry.id);
      return {
        id: entry.id,
        family: entry.family,
        level: def.level,
        name_en: def.name,
        name_zh: entry.name_zh,
        what_zh: entry.what_zh,
        focus: entry.focus,
      };
    });

  const index = {
    version: 1,
    site,
    families: sortedFamilies,
    charts: chartIndex,
    expressions: [...expressionGroups.values()]
      .sort((a, b) => a.order - b.order)
      .map(({ id, order, name_en, name_zh, intro_zh, intro_en }) => ({
        id,
        order,
        name_en,
        name_zh,
        intro_zh,
        intro_en,
      })),
    contexts: [...contexts.values()]
      .sort((a, b) => a.order - b.order)
      .map(({ id, order, name_en, name_zh, intro_zh, intro_en }) => ({
        id,
        order,
        name_en,
        name_zh,
        intro_zh,
        intro_en,
      })),
  };
  await writeFile(join(publicData, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  for (const [id, lesson] of lessons) {
    const dataset = datasets.get(lesson.dataset);
    const def = getChartDef(id);
    const entry = chartById.get(id);
    const spec = {
      type: id,
      data: dataset.rows,
      encoding: lesson.spec.encoding,
      options: lesson.spec.options ?? {},
    };
    const payload = {
      ...lesson,
      id,
      name_en: def.name,
      name_zh: entry.name_zh,
      family: def.group,
      level: def.level,
      dataset: {
        id: dataset.id,
        title_en: dataset.title_en,
        title_zh: dataset.title_zh,
        unit_en: dataset.unit_en,
        unit_short: dataset.unit_short ?? '',
        note_zh: dataset.note_zh,
      },
      spec,
    };
    await writeFile(join(publicData, 'charts', `${id}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  for (const [id, group] of expressionGroups) {
    const chartLinks = {};
    for (const [chartId, lesson] of lessons) {
      for (const item of lesson.describe ?? []) {
        if (item.group === id) {
          chartLinks[chartId] = chartLinks[chartId] ?? new Set();
          chartLinks[chartId].add(item.expression);
        }
      }
    }
    const links = Object.entries(chartLinks).map(([chartId, expressions]) => ({
      chart: chartId,
      expressions: [...expressions],
    }));
    await writeFile(
      join(publicData, 'expressions', `${id}.json`),
      `${JSON.stringify({ ...group, charts: links }, null, 2)}\n`,
      'utf8',
    );
  }

  for (const [id, context] of contexts) {
    const workedDataset = datasets.get(context.worked.dataset);
    const workedSpec = {
      type: context.worked.chart,
      data: workedDataset?.rows ?? [],
      encoding: context.worked.spec.encoding,
      options: context.worked.spec.options ?? {},
    };
    const payload = {
      ...context,
      worked: {
        ...context.worked,
        dataset: {
          id: workedDataset.id,
          title_en: workedDataset.title_en,
          title_zh: workedDataset.title_zh,
          unit_en: workedDataset.unit_en,
          unit_short: workedDataset.unit_short ?? '',
          note_zh: workedDataset.note_zh,
        },
        spec: workedSpec,
      },
    };
    await writeFile(join(publicData, 'contexts', `${id}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  const lessonCount = lessons.size;
  console.log(
    `内容就绪：${chartTypes.length} 种图表 · ${expressionCount} 条表达 · ${contexts.size} 个场景 · ${datasets.size} 个数据集`,
  );
  if (lessonCount !== chartTypes.length) console.log(`（课程 ${lessonCount} 篇）`);
}
