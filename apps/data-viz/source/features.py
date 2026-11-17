"""Computed feature engine for the Data Visualization Playground.

Every clickable mark gets exactly one feature. Authored features in
content/data-viz/topics/*.json override the computed feature on the same mark.
The build calls this module; the browser only reads the shipped result.

Mark ids:
    line      seg:<series>:<i>        pt:<series>:<i>
    bar       bar:<series>:<i>
    pie       slice:<part>
    scatter   pt:<point>              grp:<group>          all
    stacked   seg:<x>:<series>        stack:<x>
    heatmap   cell:<row>:<col>        row:<row>            col:<col>
    sankey    link:<source>-><target> node:<node>
    slope     line:<entity>           pt:<entity>:<period>
    waterfall step:<step>             total:start          total:end
"""

from __future__ import annotations

import math

FLAT = 0.03
SLIGHT = 0.10
STEADY = 0.25

PP_FLAT = 0.5
PP_SLIGHT = 1.5
PP_STEADY = 3.0


# ---------------------------------------------------------------- numbers

def fmt_num(value: float, decimals: int = 0) -> str:
    return f"{float(value):,.{decimals}f}"


def fmt_value(value: float, unit: dict) -> str:
    """A value as it reads inside a sentence (scaled, with its noun)."""
    scale = float(unit.get("scale", 1) or 1)
    x = float(value) * scale
    dec = int(unit.get("decimals", 0) or 0)
    if unit.get("kind") == "percent":
        return f"{x:,.{dec}f} percent"
    if unit.get("million") and abs(x) >= 1_000_000:
        return f"{x / 1_000_000:,.1f} million {unit.get('en', '')}".strip()
    noun = unit.get("en", "")
    return f"{x:,.{dec}f} {noun}".strip()


def fmt_axis(value: float, unit: dict) -> str:
    dec = int(unit.get("decimals", 0) or 0)
    return fmt_num(value, dec)


def fmt_delta(delta: float, unit: dict) -> str:
    """An absolute change, with points for percent-share data."""
    if unit.get("points"):
        dec = int(unit.get("decimals", 0) or 0)
        return f"{abs(delta):,.{dec}f} percentage points"
    return fmt_value(abs(delta), unit)


def rel_pct(a: float, b: float) -> float | None:
    if a == 0:
        return None
    return (b - a) / abs(a) * 100.0


def pct_text(a: float, b: float) -> str:
    value = rel_pct(a, b)
    if value is None:
        return ""
    if abs(value) < 10:
        return f"{abs(value):.1f}"
    return f"{abs(value):.0f}"


def pp_text(delta: float, unit: dict) -> str:
    dec = int(unit.get("decimals", 0) or 0)
    return f"{abs(delta):,.{dec}f}"


# ---------------------------------------------------------------- classify

def classify_change(a: float, b: float, unit: dict) -> str:
    delta = b - a
    if unit.get("points"):
        step = abs(delta)
        if step < PP_FLAT:
            return "flat"
        if step < PP_SLIGHT:
            return "rise_slight" if delta > 0 else "fall_slight"
        if step < PP_STEADY:
            return "rise_steady" if delta > 0 else "fall_steady"
        return "rise_sharp" if delta > 0 else "fall_sharp"
    pct = rel_pct(a, b)
    if pct is None or abs(pct) < FLAT * 100:
        return "flat"
    step = abs(pct) / 100.0
    if step < SLIGHT:
        return "rise_slight" if pct > 0 else "fall_slight"
    if step < STEADY:
        return "rise_steady" if pct > 0 else "fall_steady"
    return "rise_sharp" if pct > 0 else "fall_sharp"


def direction_of(kind: str) -> int:
    if kind.startswith("rise") or kind in {"increase_contributor", "rank_up"}:
        return 1
    if kind.startswith("fall") or kind in {"decrease_contributor", "rank_down"}:
        return -1
    return 0


# ---------------------------------------------------------------- helpers

def label(view: dict, index: int) -> str:
    return str(view["x"]["values"][index])


def base_slots(view: dict, series: dict | None = None) -> dict:
    slots = {
        "subject": view.get("subject", ""),
        "unit": view.get("unit", {}).get("short", ""),
        "category": "",
        "period": "",
    }
    if series:
        slots["series_name"] = series.get("name_en", "")
    return slots


def change_slots(view: dict, series: dict, i: int, unit: dict) -> dict:
    a, b = series["values"][i], series["values"][i + 1]
    slots = base_slots(view, series)
    slots.update({
        "from": fmt_value(a, unit),
        "to": fmt_value(b, unit),
        "from_period": label(view, i),
        "to_period": label(view, i + 1),
        "period": f"{label(view, i)} to {label(view, i + 1)}",
        "pct": pct_text(a, b),
        "pp": pp_text(b - a, unit),
        "delta": fmt_delta(b - a, unit),
    })
    return slots


def make(kind: str, marks: list[str], slots: dict) -> dict:
    return {"kind": kind, "marks": list(marks), "slots": slots, "auto": True}


# ---------------------------------------------------------------- line

def compute_line(view: dict) -> dict[str, dict]:
    unit = view.get("unit", {})
    out: dict[str, dict] = {}
    n = len(view["x"]["values"])
    for series in view["series"]:
        values = series["values"]
        kinds = [classify_change(values[i], values[i + 1], unit) for i in range(n - 1)]
        # Plateau runs: two or more adjacent flat segments.
        i = 0
        while i < len(kinds):
            if kinds[i] != "flat":
                i += 1
                continue
            j = i
            while j < len(kinds) and kinds[j] == "flat":
                j += 1
            for k in range(i, j):
                kinds[k] = "plateau" if j - i >= 2 else "flat"
            i = j
        # Alternating runs of three or more segments read as fluctuation.
        def dir_of(kind: str) -> int:
            if "rise" in kind:
                return 1
            if "fall" in kind:
                return -1
            return 0

        i = 0
        while i < len(kinds) - 1:
            if dir_of(kinds[i]) and dir_of(kinds[i]) != dir_of(kinds[i + 1]):
                j = i + 1
                while (j + 1 < len(kinds) and dir_of(kinds[j + 1])
                       and dir_of(kinds[j + 1]) != dir_of(kinds[j])):
                    j += 1
                if j - i + 1 >= 3:
                    for k in range(i, j + 1):
                        kinds[k] = "fluctuate"
                i = j + 1
            else:
                i += 1
        for i in range(n - 1):
            mark = f"seg:{series['id']}:{i}"
            out[mark] = make(kinds[i], [mark], change_slots(view, series, i, unit))
        for i in range(n):
            mark = f"pt:{series['id']}:{i}"
            value = values[i]
            neighbors = []
            if i > 0:
                neighbors.append(values[i - 1])
            if i < n - 1:
                neighbors.append(values[i + 1])
            kind = "point"
            if neighbors and all(value > v for v in neighbors):
                kind = "peak"
            elif neighbors and all(value < v for v in neighbors):
                kind = "trough"
            slots = base_slots(view, series)
            slots.update({
                "value": fmt_value(value, unit),
                "period": label(view, i),
                "peak": fmt_value(max(values), unit),
                "peak_period": label(view, values.index(max(values))),
            })
            out[mark] = make(kind, [mark], slots)
    return out


# ---------------------------------------------------------------- bar

def compute_bar(view: dict) -> dict[str, dict]:
    unit = view.get("unit", {})
    out: dict[str, dict] = {}
    count = len(view["x"]["values"])
    for series in view["series"]:
        values = series["values"]
        order = sorted(range(count), key=lambda i: values[i], reverse=True)
        rank = {idx: r + 1 for r, idx in enumerate(order)}
        top, second = values[order[0]], values[order[1]] if count > 1 else values[order[0]]
        spread = (max(values) - min(values)) / abs(max(values) or 1)
        for i in range(count):
            mark = f"bar:{series['id']}:{i}"
            kind = "ranking"
            if rank[i] == 1:
                if second and top / second >= 1.5:
                    kind = "large_gap"
                elif second and abs(top - second) / abs(top) <= 0.10:
                    kind = "small_gap"
                else:
                    kind = "highest"
            elif rank[i] == count:
                kind = "lowest"
            elif spread <= 0.10:
                kind = "similar_values"
            slots = base_slots(view, series)
            slots.update({
                "category": label(view, i),
                "value": fmt_value(values[i], unit),
                "unit": unit.get("short", ""),
                "rank": str(rank[i]),
                "gap": fmt_delta(abs(top - values[i]), unit),
                "top_category": label(view, order[0]),
                "top_value": fmt_value(top, unit),
            })
            out[mark] = make(kind, [mark], slots)
    return out


# ---------------------------------------------------------------- pie

def compute_pie(view: dict) -> dict[str, dict]:
    unit = view.get("unit", {})
    parts = view["parts"]
    total = sum(p["value"] for p in parts) or 1
    order = sorted(range(len(parts)), key=lambda i: parts[i]["value"], reverse=True)
    rank = {idx: r + 1 for r, idx in enumerate(order)}
    out: dict[str, dict] = {}
    for i, part in enumerate(parts):
        share = part["value"] / total * 100
        mark = f"slice:{part['id']}"
        kind = "item"
        if rank[i] == 1:
            kind = "majority" if share > 55 else "about_half" if 45 <= share <= 55 else "largest_share"
        elif rank[i] == len(parts):
            kind = "minority" if share < 10 else "smallest_share"
        slots = {
            "subject": view.get("subject", ""),
            "category": part.get("name_en", ""),
            "share": fmt_value(share, unit),
            "share_number": f"{share:,.{int(unit.get('decimals', 0) or 0)}f}",
            "value": fmt_value(part["value"], unit),
            "rank": str(rank[i]),
        }
        out[mark] = make(kind, [mark], slots)
    return out


# ---------------------------------------------------------------- scatter

def pearson(points: list[dict]) -> float:
    n = len(points)
    if n < 3:
        return 0.0
    mx = sum(p["x"] for p in points) / n
    my = sum(p["y"] for p in points) / n
    sx = math.sqrt(sum((p["x"] - mx) ** 2 for p in points))
    sy = math.sqrt(sum((p["y"] - my) ** 2 for p in points))
    if sx == 0 or sy == 0:
        return 0.0
    return sum((p["x"] - mx) * (p["y"] - my) for p in points) / (sx * sy)


def scatter_kind(r: float) -> str:
    if abs(r) >= 0.7:
        return "positive_strong" if r > 0 else "negative_strong"
    if abs(r) >= 0.4:
        return "positive_moderate" if r > 0 else "negative_moderate"
    return "weak_or_none"


def compute_scatter(view: dict) -> dict[str, dict]:
    unit = view.get("unit", {})
    points = view["points"]
    out: dict[str, dict] = {}
    xs = [p["x"] for p in points]
    ys = [p["y"] for p in points]
    mx = sum(xs) / len(xs)
    my = sum(ys) / len(ys)
    denom = sum((x - mx) ** 2 for x in xs) or 1
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / denom
    intercept = my - slope * mx
    residuals = [y - (slope * x + intercept) for x, y in zip(xs, ys)]
    sd = math.sqrt(sum(r * r for r in residuals) / len(residuals)) or 1e-9
    groups = {g["id"]: g for g in view.get("groups", [])}
    by_group: dict[str, list[dict]] = {}
    for p in points:
        by_group.setdefault(p.get("group", ""), []).append(p)

    def slots_for(subject: str, group: str, r: float) -> dict:
        return {
            "subject": subject,
            "x": view.get("x", {}).get("label_en", "x"),
            "y": view.get("y", {}).get("label_en", "y"),
            "r": f"{abs(r):.2f}",
            "direction": "positive" if r > 0 else "negative",
            "group": groups.get(group, {}).get("name_en", ""),
            "unit": unit.get("short", ""),
        }

    overall = pearson(points)
    out["all"] = make(scatter_kind(overall), ["all"],
                      slots_for(view.get("subject", ""), "", overall))
    for group, pts in by_group.items():
        r = pearson(pts)
        mark = f"grp:{group}"
        out[mark] = make(scatter_kind(r), [mark],
                         slots_for(view.get("subject", ""), group, r))
    for p in points:
        mark = f"pt:{p['id']}"
        res = p["y"] - (slope * p["x"] + intercept)
        is_outlier = abs(res) > 2 * sd
        group = p.get("group", "")
        r = pearson(by_group.get(group, points))
        kind = "outlier" if is_outlier else scatter_kind(r)
        slots = slots_for(view.get("subject", ""), group, r)
        slots.update({
            "x_value": f"{p['x']:,.1f}".rstrip("0").rstrip("."),
            "y_value": f"{p['y']:,.1f}".rstrip("0").rstrip("."),
            "category": p.get("name_en", p["id"]),
        })
        out[mark] = make(kind, [mark], slots)
    return out


# ---------------------------------------------------------------- stacked

def compute_stacked(view: dict) -> dict[str, dict]:
    unit = view.get("unit", {})
    out: dict[str, dict] = {}
    n = len(view["x"]["values"])
    series = view["series"]
    totals = [sum(s["values"][i] for s in series) for i in range(n)]
    for i in range(n):
        total = totals[i] or 1
        largest = max(series, key=lambda s: s["values"][i])
        stack_mark = f"stack:{i}"
        slots = base_slots(view, None)
        slots.update({
            "category": label(view, i),
            "period": label(view, i),
            "value": fmt_value(total, unit),
            "share": "100 percent" if view.get("mode") == "percent" else "",
        })
        out[stack_mark] = make("composition", [stack_mark], slots)
        for s in series:
            mark = f"seg:{i}:{s['id']}"
            value = s["values"][i]
            share = value / total * 100
            kind = "largest_component" if s is largest else "item"
            slots = base_slots(view, s)
            slots.update({
                "category": label(view, i),
                "period": label(view, i),
                "value": fmt_value(value, unit),
                "share": fmt_value(share, unit),
                "share_number": f"{share:,.{int(unit.get('decimals', 0) or 0)}f}",
                "total": fmt_value(total, unit),
            })
            out[mark] = make(kind, [mark], slots)
    return out


# ---------------------------------------------------------------- heatmap

def compute_heatmap(view: dict) -> dict[str, dict]:
    unit = view.get("unit", {})
    rows, cols, cells = view["rows"], view["cols"], view["cells"]
    flat = [(r, c, cells[r][c]) for r in range(len(rows))
            for c in range(len(cols))]
    top = max(flat, key=lambda t: t[2])
    low = min(flat, key=lambda t: t[2])
    out: dict[str, dict] = {}
    for r, row in enumerate(rows):
        for c, col in enumerate(cols):
            value = cells[r][c]
            mark = f"cell:{row['id']}:{col['id']}"
            kind = "cell"
            if (r, c) == (top[0], top[1]):
                kind = "peak_cell"
            elif (r, c) == (low[0], low[1]):
                kind = "low_cell"
            slots = {
                "subject": view.get("subject", ""),
                "row": row.get("name_en", ""),
                "col": col.get("name_en", ""),
                "category": f"{row.get('name_en', '')} · {col.get('name_en', '')}",
                "period": col.get("name_en", ""),
                "value": fmt_value(value, unit),
                "unit": unit.get("short", ""),
            }
            out[mark] = make(kind, [mark], slots)
        mark = f"row:{row['id']}"
        slots = {
            "subject": view.get("subject", ""),
            "row": row.get("name_en", ""),
            "category": row.get("name_en", ""),
            "period": "the week",
            "value": fmt_value(sum(cells[r]) / len(cols), unit),
            "unit": unit.get("short", ""),
        }
        out[mark] = make("pattern", [mark], slots)
    for c, col in enumerate(cols):
        mark = f"col:{col['id']}"
        avg = sum(cells[r][c] for r in range(len(rows))) / len(rows)
        slots = {
            "subject": view.get("subject", ""),
            "col": col.get("name_en", ""),
            "category": col.get("name_en", ""),
            "period": col.get("name_en", ""),
            "value": fmt_value(avg, unit),
            "unit": unit.get("short", ""),
        }
        out[mark] = make("compare_periods", [mark], slots)
    return out


# ---------------------------------------------------------------- sankey

def compute_sankey(view: dict) -> dict[str, dict]:
    unit = view.get("unit", {})
    nodes = {n["id"]: n for n in view["nodes"]}
    links = view["links"]
    out: dict[str, dict] = {}
    out_total: dict[str, float] = {}
    in_total: dict[str, float] = {}
    for link in links:
        out_total[link["source"]] = out_total.get(link["source"], 0) + link["value"]
        in_total[link["target"]] = in_total.get(link["target"], 0) + link["value"]
    for link in links:
        src, dst = link["source"], link["target"]
        mark = f"link:{src}->{dst}"
        top = max((l["value"] for l in links if l["source"] == src), default=1)
        kind = "main_path" if link["value"] == top else (
            "drop_off" if link["value"] < top * 0.5 else "secondary_path")
        share = link["value"] / (out_total.get(src) or 1) * 100
        slots = {
            "subject": view.get("subject", ""),
            "source": nodes.get(src, {}).get("name_en", src),
            "target": nodes.get(dst, {}).get("name_en", dst),
            "value": fmt_value(link["value"], unit),
            "share": fmt_value(share, unit),
            "pct": f"{share:.0f}",
            "period": view.get("period_label", ""),
            "unit": unit.get("short", ""),
        }
        out[mark] = make(kind, [mark], slots)
    for node in nodes.values():
        mark = f"node:{node['id']}"
        ins = in_total.get(node["id"], 0)
        outs = out_total.get(node["id"], 0)
        kind = "merge" if ins > outs and ins else "split"
        slots = {
            "subject": view.get("subject", ""),
            "source": node.get("name_en", ""),
            "target": node.get("name_en", ""),
            "category": node.get("name_en", ""),
            "value": fmt_value(max(ins, outs), unit),
            "share": "",
            "pct": "",
            "period": view.get("period_label", ""),
            "unit": unit.get("short", ""),
        }
        out[mark] = make(kind, [mark], slots)
    return out


# ---------------------------------------------------------------- slope

def compute_slope(view: dict) -> dict[str, dict]:
    unit = view.get("unit", {})
    entities = view["entities"]
    periods = view["periods"]
    out: dict[str, dict] = {}
    ranks = []
    for pi in range(len(periods)):
        order = sorted(range(len(entities)),
                       key=lambda ei: entities[ei]["values"][pi], reverse=True)
        ranks.append({ei: r + 1 for r, ei in enumerate(order)})
    for ei, entity in enumerate(entities):
        a, b = entity["values"][0], entity["values"][-1]
        mark = f"line:{entity['id']}"
        delta = b - a
        kind = "stable_rank" if ranks[0][ei] == ranks[-1][ei] else (
            "rank_up" if ranks[-1][ei] < ranks[0][ei] else "rank_down")
        # Overtake: a rank gain of two or more places.
        if kind == "rank_up" and ranks[0][ei] - ranks[-1][ei] >= 2:
            kind = "overtake"
        slots = {
            "subject": view.get("subject", ""),
            "entity": entity.get("name_en", ""),
            "category": entity.get("name_en", ""),
            "from": fmt_value(a, unit),
            "to": fmt_value(b, unit),
            "from_period": periods[0].get("label_en", ""),
            "to_period": periods[-1].get("label_en", ""),
            "period": f"{periods[0].get('label_en', '')} to {periods[-1].get('label_en', '')}",
            "pct": pct_text(a, b),
            "pp": pp_text(delta, unit),
            "delta": fmt_delta(delta, unit),
            "rank": str(ranks[-1][ei]),
            "rank_before": str(ranks[0][ei]),
            "gap": str(abs(ranks[0][ei] - ranks[-1][ei])),
        }
        out[mark] = make(kind, [mark], slots)
        for pi, period in enumerate(periods):
            pm = f"pt:{entity['id']}:{pi}"
            ps = dict(slots)
            ps.update({
                "value": fmt_value(entity["values"][pi], unit),
                "period": period.get("label_en", ""),
                "rank": str(ranks[pi][ei]),
            })
            out[pm] = make("point", [pm], ps)
    return out


# ---------------------------------------------------------------- waterfall

def compute_waterfall(view: dict) -> dict[str, dict]:
    unit = view.get("unit", {})
    steps = view["steps"]
    start = float(view.get("start_value", 0))
    end = start + sum(s["value"] for s in steps)
    largest = max(range(len(steps)), key=lambda i: abs(steps[i]["value"]))
    pos = sum(s["value"] for s in steps if s["value"] > 0)
    neg = sum(-s["value"] for s in steps if s["value"] < 0)
    out: dict[str, dict] = {}
    running = start
    for i, step in enumerate(steps):
        mark = f"step:{step['id']}"
        kind = "largest_step" if i == largest else (
            "increase_contributor" if step["value"] > 0 else "decrease_contributor")
        if i == largest and neg and pos and neg / pos >= 0.5 and step["value"] > 0:
            kind = "offset"
        slots = {
            "subject": view.get("subject", ""),
            "category": step.get("name_en", ""),
            "value": fmt_value(abs(step["value"]), unit),
            "signed": ("+" if step["value"] > 0 else "-") + fmt_value(abs(step["value"]), unit),
            "start": fmt_value(start, unit),
            "end": fmt_value(end, unit),
            "pct": pct_text(start, end),
            "pp": pp_text(end - start, unit),
            "period": view.get("period_label", ""),
            "unit": unit.get("short", ""),
        }
        out[mark] = make(kind, [mark], slots)
        running += step["value"]
    for mark, value, label_en in (
            ("total:start", start, view.get("start", {}).get("name_en", "Start")),
            ("total:end", end, view.get("end", {}).get("name_en", "End"))):
        slots = {
            "subject": view.get("subject", ""),
            "category": label_en,
            "value": fmt_value(value, unit),
            "start": fmt_value(start, unit),
            "end": fmt_value(end, unit),
            "pct": pct_text(start, end),
            "pp": pp_text(end - start, unit),
            "period": view.get("period_label", ""),
            "unit": unit.get("short", ""),
        }
        out[mark] = make("net_change", [mark], slots)
    return out


COMPUTERS = {
    "line": compute_line,
    "bar": compute_bar,
    "pie": compute_pie,
    "scatter": compute_scatter,
    "stacked": compute_stacked,
    "heatmap": compute_heatmap,
    "sankey": compute_sankey,
    "slope": compute_slope,
    "waterfall": compute_waterfall,
}


def compute_view(view: dict) -> dict[str, dict]:
    fn = COMPUTERS.get(view.get("type"))
    if not fn:
        return {}
    return fn(view)


def span_slots(view: dict, marks: list[str], fallback: dict) -> dict:
    """For an authored feature covering several line segments, describe the
    whole span (first start -> last end), not just the clicked segment."""
    if view.get("type") != "line":
        return fallback
    segs = [m.split(":") for m in marks if m.startswith("seg:")]
    if len(segs) < 2:
        return fallback
    series_id = segs[0][1]
    idx = sorted(int(s[2]) for s in segs)
    series = next((s for s in view.get("series", []) if s["id"] == series_id), None)
    if not series:
        return fallback
    unit = view.get("unit", {})
    a = series["values"][idx[0]]
    b = series["values"][idx[-1] + 1]
    slots = base_slots(view, series)
    slots.update({
        "from": fmt_value(a, unit),
        "to": fmt_value(b, unit),
        "from_period": label(view, idx[0]),
        "to_period": label(view, idx[-1] + 1),
        "period": f"{label(view, idx[0])} to {label(view, idx[-1] + 1)}",
        "pct": pct_text(a, b),
        "pp": pp_text(b - a, unit),
        "delta": fmt_delta(b - a, unit),
    })
    return slots


def merge_authored(view: dict, computed: dict[str, dict]) -> dict[str, dict]:
    """Apply authored features over computed ones, keyed by mark id."""
    index = dict(computed)
    for authored in view.get("features", []):
        marks = authored.get("marks") or []
        if not marks:
            continue
        feature = {
            "id": authored.get("id") or "",
            "kind": authored["kind"],
            "marks": list(marks),
            "slots": authored.get("slots") or {},
            "examples": authored.get("examples") or [],
            "note_zh": authored.get("note_zh", ""),
            "interpret_zh": authored.get("interpret_zh", ""),
            "auto": False,
        }
        span = span_slots(view, marks, {})
        for mark in marks:
            if mark not in index:
                continue
            slots = dict(span or index[mark].get("slots", {}))
            slots.update(feature["slots"])
            merged = dict(feature)
            merged["slots"] = slots
            index[mark] = merged
    return index
