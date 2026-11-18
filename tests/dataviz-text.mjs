// Generated-text sweep for the Data Visualization Gallery.
//
//   node tests/dataviz-text.mjs
//
// Renders the whole-chart text for every view, level, and register from the
// same feature engine the page uses. Guards against blank slots, double
// spaces, percent signs in English frames, cardinal ranks, and causal wording
// in scatter text.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DV } from '../apps/data-viz/web/src/engine/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'content/data-viz/manifest.json'), 'utf8'));
const libraries = {};
for (const file of readdirSync(join(ROOT, 'content/data-viz/library'))) {
  const lib = JSON.parse(readFileSync(join(ROOT, 'content/data-viz/library', file), 'utf8'));
  libraries[lib.type] = lib;
}

const CAUSAL = /\b(cause[sd]?|causing|leads? to|led to|result(s|ed)? in|due to|because of|drives?|driven by|affect(s|ed)?|impact(s|ed)?)\b/i;
const problems = [];
let views = 0;
let texts = 0;

function check(where, text, { english = true, scatter = false } = {}) {
  texts += 1;
  text = String(text || '');
  if (text.length < 8) problems.push(`${where}: empty`);
  if (/\{[a-z_]+\}/.test(text)) problems.push(`${where}: unfilled slot ${text.match(/\{[a-z_]+\}/)[0]}`);
  if (/undefined|NaN/.test(text)) problems.push(`${where}: undefined/NaN`);
  if (/\s{2,}/.test(text)) problems.push(`${where}: double space`);
  if (english) {
    if (/%/.test(text)) problems.push(`${where}: percent sign in English`);
    if (/most high|more high/i.test(text)) problems.push(`${where}: most high`);
    if (scatter && CAUSAL.test(text)) problems.push(`${where}: causal word in scatter`);
    if (/\bcomes? \d+\b/.test(text)) problems.push(`${where}: cardinal rank`);
  }
}

for (const entry of manifest.topics) {
  const topic = JSON.parse(readFileSync(join(ROOT, 'content/data-viz/topics', `${entry.id}.json`), 'utf8'));
  for (const view of topic.views) {
    views += 1;
    const features = DV.compute.view(view);
    const library = libraries[view.type];
    const levels = DV.gen.levels(view, features, library);
    for (const level of ['a2', 'b1', 'b2']) {
      check(`${entry.id}/${view.id}/${level}`, levels[level], { scatter: view.type === 'scatter' });
    }
    check(`${entry.id}/${view.id}/ielts`,
      DV.gen.describe(view, features, library, 'ielts', 'b1'), { scatter: view.type === 'scatter' });
    check(`${entry.id}/${view.id}/business`,
      DV.gen.describe(view, features, library, 'business', 'b1'), { scatter: view.type === 'scatter' });
    check(`${entry.id}/${view.id}/zh`, DV.gen.overviewZh(view, features, library), { english: false });
  }
}

if (problems.length) {
  console.log(`文本问题 ${problems.length} 处（${views} 个视图，${texts} 段文本）：`);
  for (const problem of problems.slice(0, 40)) console.log('  - ' + problem);
  if (problems.length > 40) console.log(`  …还有 ${problems.length - 40} 处`);
  process.exit(1);
}
console.log(`文本一致：${views} 个视图，${texts} 段文本`);
