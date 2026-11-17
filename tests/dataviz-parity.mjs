// Parity check: browser feature engine (apps/data-viz/js/05-compute.js) against
// the build-time engine (apps/data-viz/source/features.py), over every view in
// content/data-viz.
//
//   node tests/dataviz-parity.mjs
//
// Exit code 0 = identical kinds, marks, and slots for every mark.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PY = join(ROOT, '.venv', 'Scripts', 'python.exe');

const pyDump = String.raw`
import copy, json, sys
from pathlib import Path
root = Path(sys.argv[1])
sys.path.insert(0, str(root / "apps" / "data-viz" / "source"))
from features import compute_view
manifest = json.loads((root / "content" / "data-viz" / "manifest.json").read_text(encoding="utf-8"))

def bump(value, factor=1.13):
    return round(float(value) * factor, 2)

def mutate(view):
    w = copy.deepcopy(view)
    t = w["type"]
    if t in ("line", "bar", "stacked"):
        for s in w["series"]:
            s["values"] = [bump(v) for v in s["values"]]
    elif t == "pie":
        for part in w["parts"]:
            part["value"] = bump(part["value"])
    elif t == "scatter":
        for p in w["points"]:
            p["x"] = round(float(p["x"]) * 1.07 + 0.5, 2)
            p["y"] = round(float(p["y"]) * 0.93 - 0.5, 2)
    elif t == "heatmap":
        w["cells"] = [[round(float(v) * 1.11 + 1, 2) for v in row] for row in w["cells"]]
    elif t == "sankey":
        for link in w["links"]:
            link["value"] = bump(link["value"])
    elif t == "slope":
        for entity in w["entities"]:
            entity["values"] = [bump(v) for v in entity["values"]]
    elif t == "waterfall":
        w["start_value"] = bump(w["start_value"])
        for step in w["steps"]:
            step["value"] = bump(step["value"])
    return w

out = []
for entry in manifest["topics"]:
    topic = json.loads((root / "content" / "data-viz" / "topics" / (entry["id"] + ".json")).read_text(encoding="utf-8"))
    for view in topic["views"]:
        for variant, data in (("shipped", view), ("edited", mutate(view))):
            out.append({
                "topic": entry["id"],
                "view": view["id"],
                "type": view["type"],
                "variant": variant,
                "data": data,
                "computed": compute_view(data),
            })
print(json.dumps(out, ensure_ascii=False))
`;

const raw = execFileSync(PY, ['-I', '-X', 'utf8', '-c', pyDump, ROOT], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const fixtures = JSON.parse(raw);

const context = {};
context.window = context;
vm.createContext(context);
for (const file of ['01-core.js', '05-compute.js']) {
  const code = readFileSync(join(ROOT, 'apps', 'data-viz', 'js', file), 'utf8');
  vm.runInContext(code, context, { filename: file });
}
const DV = context.window.DV;

const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = normalize(value[key]);
    return out;
  }
  return value;
};

let totalMarks = 0;
const problems = [];
for (const fixture of fixtures) {
  const js = DV.compute.view(fixture.data);
  const py = fixture.computed;
  const where = `${fixture.topic}/${fixture.view} (${fixture.type}, ${fixture.variant})`;
  const jsKeys = Object.keys(js).sort();
  const pyKeys = Object.keys(py).sort();
  totalMarks += pyKeys.length;
  const missing = pyKeys.filter((k) => !jsKeys.includes(k));
  const extra = jsKeys.filter((k) => !pyKeys.includes(k));
  if (missing.length) problems.push(`${where}: JS 缺 mark ${missing.join(', ')}`);
  if (extra.length) problems.push(`${where}: JS 多 mark ${extra.join(', ')}`);
  for (const mark of pyKeys.filter((k) => js[k])) {
    const a = py[mark];
    const b = js[mark];
    if (a.kind !== b.kind) problems.push(`${where} ${mark}: kind ${a.kind} -> ${b.kind}`);
    if (JSON.stringify(a.marks) !== JSON.stringify(b.marks)) {
      problems.push(`${where} ${mark}: marks ${JSON.stringify(a.marks)} -> ${JSON.stringify(b.marks)}`);
    }
    const as = JSON.stringify(normalize(a.slots));
    const bs = JSON.stringify(normalize(b.slots));
    if (as !== bs) problems.push(`${where} ${mark}: slots\n  py ${as}\n  js ${bs}`);
  }
}

if (problems.length) {
  console.log(`不一致 ${problems.length} 处（共 ${totalMarks} 个 mark）：`);
  for (const problem of problems.slice(0, 40)) console.log('  - ' + problem);
  if (problems.length > 40) console.log(`  …还有 ${problems.length - 40} 处`);
  process.exit(1);
}
console.log(`一致：${fixtures.length} 个视图样本，${totalMarks} 个 mark`);
