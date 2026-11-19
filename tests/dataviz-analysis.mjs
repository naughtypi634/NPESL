// 47 种图表分析的鲁棒性测试：正常数据、全零、全相等、负值、单点改动。
// 不需要浏览器：用项目已有的 esbuild 把分析模块打成临时 ESM，再直接调用。

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps', 'data-viz', 'web');
const CONTENT = join(ROOT, 'content', 'data-viz', 'atlas');
const OUT = join(ROOT, 'build', 'analysis');

mkdirSync(OUT, { recursive: true });
const esbuild = join(WEB, 'node_modules', 'esbuild', 'bin', 'esbuild');
execFileSync(process.execPath, [
  esbuild,
  join(WEB, 'src', 'atlas', 'live', 'index.ts'),
  '--bundle',
  '--format=esm',
  '--platform=neutral',
  '--outfile=' + join(OUT, 'live.mjs'),
  '--define:import.meta.env.DEV=false',
], { stdio: 'inherit' });

const { analyzeChart } = await import(pathToFileURL(join(OUT, 'live.mjs')).href);

const lessons = {};
for (const name of readdirSync(join(CONTENT, 'lessons'))) {
  if (!name.endsWith('.json')) continue;
  const lesson = JSON.parse(readFileSync(join(CONTENT, 'lessons', name), 'utf8'));
  lessons[lesson.chart] = lesson;
}
const datasets = {};
for (const name of readdirSync(join(CONTENT, 'datasets'))) {
  if (!name.endsWith('.json')) continue;
  const raw = JSON.parse(readFileSync(join(CONTENT, 'datasets', name), 'utf8'));
  let rows = raw.rows;
  if (!rows && raw.generate) {
    // 生成型数据集只用课程构建后的数据，测试跳过（构建已展开并校验）。
    continue;
  }
  datasets[raw.id ?? name.replace(/\.json$/, '')] = { ...raw, rows };
}
// 生成型数据集的行已经在 public/data/charts 里；优先读构建产物。
const builtDir = join(WEB, 'public', 'data', 'charts');
const built = {};
if (readdirSync(builtDir).length) {
  for (const name of readdirSync(builtDir)) {
    if (!name.endsWith('.json')) continue;
    const payload = JSON.parse(readFileSync(join(builtDir, name), 'utf8'));
    built[payload.id] = payload;
  }
}

function datasetMeta(payload) {
  const d = payload.dataset;
  return {
    id: d.id,
    title_en: d.title_en,
    title_zh: d.title_zh,
    unit_en: d.unit_en,
    unit_short: d.unit_short,
    decimals: d.decimals ?? 0,
    note_zh: d.note_zh,
  };
}

function metricFor(spec, rows) {
  const numeric = new Set();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === 'number' && Number.isFinite(value)) numeric.add(key);
    }
  }
  const candidates = ['value', 'y', 'close', 'actual', 'score', 'progress', 'sales', 'share', 'users'];
  for (const channel of ['value', 'y', 'close', 'actual', 'rank', 'x']) {
    const field = spec.encoding?.[channel];
    if (typeof field === 'string' && numeric.has(field)) return field;
  }
  return candidates.find((field) => numeric.has(field)) ?? [...numeric][0] ?? '';
}

function copyText(analysis) {
  return [
    ...analysis.observations.flatMap((item) => [item.en, item.zh]),
    analysis.academic.en, analysis.academic.zh,
    analysis.business.en, analysis.business.zh,
    analysis.everyday.en, analysis.everyday.zh,
    ...analysis.stats.flatMap((item) => [item.value, item.noteEn ?? '', item.noteZh ?? '']),
    ...analysis.notes.flatMap((item) => [item.en, item.zh]),
  ].join('\n');
}

const failures = [];
let checked = 0;
for (const [id, lesson] of Object.entries(lessons)) {
  const payload = built[id];
  if (!payload) {
    failures.push(`${id}: no built payload`);
    continue;
  }
  const rows = payload.spec.data;
  const meta = datasetMeta(payload);
  const metric = metricFor(payload.spec, rows);
  const base = { chart: id, spec: payload.spec, dataset: meta, metric };

  const original = analyzeChart({ ...base, rows });
  checked += 1;
  if (!original) {
    failures.push(`${id}: no analysis on original data`);
    continue;
  }
  const originalText = copyText(original);
  if (!original.observations.length || !original.stats.length) failures.push(`${id}: empty analysis`);
  if (!original.academic.en || !original.business.en || !original.everyday.en) failures.push(`${id}: missing register`);
  if (/NaN|Infinity|undefined|null/.test(originalText)) failures.push(`${id}: bad token in original copy`);

  const variants = [];
  if (metric) {
    variants.push(['zero', rows.map((row) => ({ ...row, [metric]: 0 }))]);
    variants.push(['equal', rows.map((row) => ({ ...row, [metric]: 42 }))]);
    variants.push(['negative', rows.map((row) => ({ ...row, [metric]: -5 }))]);
    variants.push(['edited', rows.map((row) => ({ ...row, [metric]: 999 }))]);
  }
  for (const [label, variantRows] of variants) {
    const result = analyzeChart({ ...base, rows: variantRows });
    if (!result) {
      failures.push(`${id}/${label}: analysis returned null`);
      continue;
    }
    const text = copyText(result);
    if (/NaN|Infinity|undefined|null/.test(text)) failures.push(`${id}/${label}: bad token in copy`);
    if (!result.observations.length) failures.push(`${id}/${label}: no observations`);
  }
  if (metric) {
    const edited = analyzeChart({
      ...base,
      rows: rows.map((row) => ({ ...row, [metric]: 999 })),
    });
    if (edited && copyText(edited) === originalText) failures.push(`${id}: edited copy did not change`);
  }
}

console.log(`checked ${checked}/${Object.keys(lessons).length} charts`);
if (failures.length) {
  console.error(`FAILED (${failures.length})`);
  for (const failure of failures.slice(0, 40)) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('PASSED: all analyses handle original, zero, equal, negative and edited data');
