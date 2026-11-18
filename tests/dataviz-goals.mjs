import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'apps', 'data-viz', 'web', 'public', 'data');
const LIBRARY = join(ROOT, 'content', 'data-viz', 'library');

const problems = [];
const index = JSON.parse(readFileSync(join(DATA, 'index.json'), 'utf8'));
const goalIds = (index.goals ?? []).map((goal) => goal.id);
const expectedGoals = ['change', 'stable', 'peak', 'fluctuate', 'compare'];
if (JSON.stringify(goalIds) !== JSON.stringify(expectedGoals)) {
  problems.push(`goals 必须是 ${expectedGoals.join(' / ')}，现在是 ${goalIds.join(' / ')}`);
}
if (index.version !== 2) problems.push(`index.version 应为 2，现在是 ${index.version}`);

const libraryKinds = new Set();
for (const file of readdirSync(LIBRARY)) {
  if (!file.endsWith('.json')) continue;
  const library = JSON.parse(readFileSync(join(LIBRARY, file), 'utf8'));
  for (const kind of Object.keys(library.features ?? {})) libraryKinds.add(kind);
}
const generic = new Set(index.generic_kinds ?? []);
const mapped = new Set(Object.keys(index.kind_goals ?? {}));
for (const kind of generic) {
  if (mapped.has(kind)) problems.push(`通用 kind ${kind} 不应出现在 kind_goals`);
}
for (const kind of libraryKinds) {
  if (!mapped.has(kind) && !generic.has(kind)) {
    problems.push(`library kind ${kind} 没有学习目标`);
  }
}
for (const kind of mapped) {
  if (!libraryKinds.has(kind)) problems.push(`kind_goals 里的 ${kind} 不在语言库里`);
  if (!expectedGoals.includes(index.kind_goals[kind])) {
    problems.push(`kind_goals.${kind} 的目标非法：${index.kind_goals[kind]}`);
  }
}

const allowedData = new Set([
  'x', 'series', 'parts', 'points', 'groups', 'rows', 'cols', 'cells', 'nodes', 'links',
  'columns', 'periods', 'entities', 'steps', 'start_value', 'start', 'end', 'mode',
  'period_label',
]);
const typeIds = new Set((index.types ?? []).map((type) => type.id));
const goalTopics = new Map(expectedGoals.map((goal) => [goal, new Set()]));
let viewCount = 0;

for (const card of index.topics ?? []) {
  if (!Array.isArray(card.views) || card.views.length === 0) {
    problems.push(`${card.id}: 没有 views`);
    continue;
  }
  const union = new Set();
  for (const view of card.views) {
    viewCount += 1;
    if (!view.id) problems.push(`${card.id}: view 缺 id`);
    if (!typeIds.has(view.type)) problems.push(`${card.id}/${view.id}: 未知类型 ${view.type}`);
    if (!Array.isArray(view.goals)) {
      problems.push(`${card.id}/${view.id}: 缺 goals`);
      continue;
    }
    if (view.goals.length === 0) problems.push(`${card.id}/${view.id}: goals 为空`);
    for (const goal of view.goals) {
      if (!expectedGoals.includes(goal)) problems.push(`${card.id}/${view.id}: 目标非法 ${goal}`);
      union.add(goal);
      goalTopics.get(goal)?.add(card.id);
    }
    for (const key of Object.keys(view.data ?? {})) {
      if (!allowedData.has(key)) problems.push(`${card.id}/${view.id}: data 出现未允许字段 ${key}`);
    }
  }
  for (const goal of card.goals ?? []) {
    if (!union.has(goal)) problems.push(`${card.id}: 主题目标 ${goal} 不在视图目标里`);
  }
  for (const goal of union) {
    if (!(card.goals ?? []).includes(goal)) problems.push(`${card.id}: 视图目标 ${goal} 没进主题目标`);
  }
}

for (const goal of expectedGoals) {
  const count = goalTopics.get(goal)?.size ?? 0;
  if (count < 3) problems.push(`学习目标 ${goal} 只有 ${count} 个主题（至少 3）`);
}

if (problems.length) {
  console.log(`目标标签检查失败（${problems.length} 项）：`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}
console.log(
  `目标标签检查通过：${index.topics.length} 个主题，${viewCount} 个视图，` +
    expectedGoals.map((goal) => `${goal} ${goalTopics.get(goal).size}`).join(' / '),
);
