//! Computed feature engine — a direct port of `features.py`.
//!
//! Every clickable mark gets exactly one feature. Authored features in
//! content/data-viz/topics/*.json override the computed feature on the same
//! mark. The build calls this module; the browser only reads the shipped
//! result.
//!
//! Mark ids:
//!     line      seg:<series>:<i>        pt:<series>:<i>
//!     bar       bar:<series>:<i>
//!     pie       slice:<part>
//!     scatter   pt:<point>              grp:<group>          all
//!     stacked   seg:<x>:<series>        stack:<x>
//!     heatmap   cell:<row>:<col>        row:<row>            col:<col>
//!     sankey    link:<source>-><target> node:<node>
//!     slope     line:<entity>           pt:<entity>:<period>
//!     waterfall step:<step>             total:start          total:end

use indexmap::IndexMap;
use serde_json::Value;

use crate::fmt;
use crate::json::{self, Obj};

#[derive(Clone)]
pub struct Feature {
    pub kind: String,
    pub marks: Vec<String>,
    pub slots: Obj,
    pub auto: bool,
    pub id: String,
    pub examples: Vec<Value>,
    pub note_zh: String,
    pub interpret_zh: String,
}

impl Feature {
    pub fn auto(kind: &str, marks: Vec<String>, slots: Obj) -> Self {
        Feature {
            kind: kind.to_string(),
            marks,
            slots,
            auto: true,
            id: String::new(),
            examples: Vec::new(),
            note_zh: String::new(),
            interpret_zh: String::new(),
        }
    }

    /// The shape `compute_view` returns: kind, marks, slots, auto.
    pub fn to_value(&self) -> Value {
        let mut m = Obj::new();
        json::put(&mut m, "kind", &self.kind);
        m.insert(
            "marks".to_string(),
            Value::Array(self.marks.iter().map(|s| Value::String(s.clone())).collect()),
        );
        m.insert("slots".to_string(), Value::Object(self.slots.clone()));
        m.insert("auto".to_string(), Value::Bool(self.auto));
        Value::Object(m)
    }
}

pub type Index = IndexMap<String, Feature>;

fn x_values<'a>(view: &'a Obj) -> &'a [Value] {
    json::field(view, "x")
        .map(|x| json::array(x, "values"))
        .unwrap_or(json::EMPTY)
}

fn value_at(values: &[Value], i: usize) -> f64 {
    values.get(i).map(json::num).unwrap_or(0.0)
}

fn label(view: &Obj, index: usize) -> String {
    x_values(view)
        .get(index)
        .map(json::py_str)
        .unwrap_or_default()
}

fn unit_of(view: &Obj) -> Obj {
    json::field(view, "unit").cloned().unwrap_or_default()
}

fn base_slots(view: &Obj, series: Option<&Obj>) -> Obj {
    let mut slots = Obj::new();
    json::put(&mut slots, "subject", json::text_or(view, "subject", ""));
    let unit_short = json::field(view, "unit")
        .map(|u| json::text_or(u, "short", ""))
        .unwrap_or_default();
    json::put(&mut slots, "unit", unit_short);
    json::put(&mut slots, "category", "");
    json::put(&mut slots, "period", "");
    if let Some(series) = series {
        json::put(&mut slots, "series_name", json::text_or(series, "name_en", ""));
    }
    slots
}

fn change_slots(view: &Obj, series: &Obj, i: usize, unit: &Obj) -> Obj {
    let values = json::array(series, "values");
    let a = value_at(values, i);
    let b = value_at(values, i + 1);
    let mut slots = base_slots(view, Some(series));
    json::put(&mut slots, "from", fmt::fmt_value(a, unit));
    json::put(&mut slots, "to", fmt::fmt_value(b, unit));
    json::put(&mut slots, "from_period", label(view, i));
    json::put(&mut slots, "to_period", label(view, i + 1));
    json::put(
        &mut slots,
        "period",
        format!("{} to {}", label(view, i), label(view, i + 1)),
    );
    json::put(&mut slots, "pct", fmt::pct_text(a, b));
    json::put(&mut slots, "pp", fmt::pp_text(b - a, unit));
    json::put(&mut slots, "delta", fmt::fmt_delta(b - a, unit));
    slots
}

fn add(out: &mut Index, mark: String, feature: Feature) {
    out.insert(mark, feature);
}

fn first_max(values: &[Value]) -> f64 {
    let mut best = f64::NEG_INFINITY;
    for value in values {
        let v = json::num(value);
        if v > best {
            best = v;
        }
    }
    best
}

fn first_max_index(values: &[Value]) -> usize {
    let mut best = f64::NEG_INFINITY;
    let mut index = 0;
    for (i, value) in values.iter().enumerate() {
        let v = json::num(value);
        if v > best {
            best = v;
            index = i;
        }
    }
    index
}

fn sort_desc(values: &[Value]) -> Vec<usize> {
    let mut order: Vec<usize> = (0..values.len()).collect();
    order.sort_by(|&a, &b| {
        json::num(&values[b])
            .partial_cmp(&json::num(&values[a]))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    order
}

// ---------------------------------------------------------------- line

fn compute_line(view: &Obj, out: &mut Index) {
    let unit = unit_of(view);
    let n = x_values(view).len();
    for series in json::objects(view, "series") {
        let values = json::array(series, "values");
        let series_id = json::text(series, "id");
        let mut kinds: Vec<String> = (0..n.saturating_sub(1))
            .map(|i| {
                fmt::classify_change(value_at(values, i), value_at(values, i + 1), &unit).to_string()
            })
            .collect();
        // Plateau runs: two or more adjacent flat segments.
        let mut i = 0;
        while i < kinds.len() {
            if kinds[i] != "flat" {
                i += 1;
                continue;
            }
            let mut j = i;
            while j < kinds.len() && kinds[j] == "flat" {
                j += 1;
            }
            let plateau = j - i >= 2;
            for kind in kinds.iter_mut().take(j).skip(i) {
                *kind = if plateau { "plateau" } else { "flat" }.to_string();
            }
            i = j;
        }
        // Alternating runs of three or more segments read as fluctuation.
        fn dir_of(kind: &str) -> i32 {
            if kind.contains("rise") {
                1
            } else if kind.contains("fall") {
                -1
            } else {
                0
            }
        }
        let mut i = 0;
        while i + 1 < kinds.len() {
            if dir_of(&kinds[i]) != 0 && dir_of(&kinds[i]) != dir_of(&kinds[i + 1]) {
                let mut j = i + 1;
                while j + 1 < kinds.len()
                    && dir_of(&kinds[j + 1]) != 0
                    && dir_of(&kinds[j + 1]) != dir_of(&kinds[j])
                {
                    j += 1;
                }
                if j - i + 1 >= 3 {
                    for kind in kinds.iter_mut().take(j + 1).skip(i) {
                        *kind = "fluctuate".to_string();
                    }
                }
                i = j + 1;
            } else {
                i += 1;
            }
        }
        for i in 0..n.saturating_sub(1) {
            let mark = format!("seg:{series_id}:{i}");
            let kind = kinds.get(i).cloned().unwrap_or_else(|| "flat".to_string());
            add(
                out,
                mark.clone(),
                Feature::auto(&kind, vec![mark], change_slots(view, series, i, &unit)),
            );
        }
        let peak = first_max(values);
        let peak_index = first_max_index(values);
        for i in 0..n {
            let mark = format!("pt:{series_id}:{i}");
            let value = value_at(values, i);
            let mut neighbors: Vec<f64> = Vec::new();
            if i > 0 {
                neighbors.push(value_at(values, i - 1));
            }
            if i < n - 1 {
                neighbors.push(value_at(values, i + 1));
            }
            let mut kind = "point";
            if !neighbors.is_empty() && neighbors.iter().all(|v| value > *v) {
                kind = "peak";
            } else if !neighbors.is_empty() && neighbors.iter().all(|v| value < *v) {
                kind = "trough";
            }
            let mut slots = base_slots(view, Some(series));
            json::put(&mut slots, "value", fmt::fmt_value(value, &unit));
            json::put(&mut slots, "period", label(view, i));
            json::put(&mut slots, "peak", fmt::fmt_value(peak, &unit));
            json::put(&mut slots, "peak_period", label(view, peak_index));
            add(
                out,
                mark.clone(),
                Feature::auto(kind, vec![mark], slots),
            );
        }
    }
}

// ---------------------------------------------------------------- bar

fn compute_bar(view: &Obj, out: &mut Index) {
    let unit = unit_of(view);
    let count = x_values(view).len();
    for series in json::objects(view, "series") {
        let values = json::array(series, "values");
        let series_id = json::text(series, "id");
        let order = sort_desc(values);
        let mut rank = vec![0usize; count];
        for (r, &idx) in order.iter().enumerate() {
            if idx < count {
                rank[idx] = r + 1;
            }
        }
        let top = order.first().map(|&i| value_at(values, i)).unwrap_or(0.0);
        let second = if count > 1 {
            order.get(1).map(|&i| value_at(values, i)).unwrap_or(0.0)
        } else {
            top
        };
        let max = first_max(values);
        let min = {
            let mut best = f64::INFINITY;
            for value in values {
                let v = json::num(value);
                if v < best {
                    best = v;
                }
            }
            best
        };
        let max_or_one = if max == 0.0 { 1.0 } else { max };
        let spread = (max - min) / max_or_one.abs();
        for i in 0..count {
            let mark = format!("bar:{series_id}:{i}");
            let value = value_at(values, i);
            let mut kind = "ranking";
            if rank.get(i) == Some(&1) {
                // The top bar always reads as "highest". The large_gap entry
                // assumes the clicked bar is the lower of a pair, so it stays
                // authored content rather than an automatic kind.
                kind = "highest";
            } else if rank.get(i) == Some(&2)
                && second != 0.0
                && (top - second).abs() / (if top == 0.0 { 1.0 } else { top }).abs() <= 0.10
            {
                kind = "small_gap";
            } else if rank.get(i) == Some(&count) {
                kind = "lowest";
            } else if spread <= 0.10 {
                kind = "similar_values";
            }
            let mut slots = base_slots(view, Some(series));
            json::put(&mut slots, "category", label(view, i));
            json::put(&mut slots, "value", fmt::fmt_value(value, &unit));
            json::put(&mut slots, "unit", json::text_or(&unit, "short", ""));
            json::put(&mut slots, "rank", rank.get(i).copied().unwrap_or(0).to_string());
            json::put(&mut slots, "gap", fmt::fmt_delta((top - value).abs(), &unit));
            json::put(
                &mut slots,
                "top_category",
                label(view, order.first().copied().unwrap_or(0)),
            );
            json::put(
                &mut slots,
                "top_value",
                fmt::fmt_value(top, &unit),
            );
            add(out, mark.clone(), Feature::auto(kind, vec![mark], slots));
        }
    }
}

// ---------------------------------------------------------------- pie

fn compute_pie(view: &Obj, out: &mut Index) {
    let unit = unit_of(view);
    let parts = json::objects(view, "parts").collect::<Vec<_>>();
    let total = {
        let sum: f64 = parts.iter().map(|p| json::number(p, "value")).sum();
        if sum == 0.0 { 1.0 } else { sum }
    };
    let mut order: Vec<usize> = (0..parts.len()).collect();
    order.sort_by(|&a, &b| {
        json::number(&parts[b], "value")
            .partial_cmp(&json::number(&parts[a], "value"))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut rank = vec![0usize; parts.len()];
    for (r, &idx) in order.iter().enumerate() {
        rank[idx] = r + 1;
    }
    for (i, part) in parts.iter().enumerate() {
        let value = json::number(part, "value");
        let share = value / total * 100.0;
        let mark = format!("slice:{}", json::text_or(part, "id", ""));
        let kind = if rank[i] == 1 {
            if share > 55.0 {
                "majority"
            } else if (45.0..=55.0).contains(&share) {
                "about_half"
            } else {
                "largest_share"
            }
        } else if rank[i] == parts.len() {
            if share < 10.0 {
                "minority"
            } else {
                "smallest_share"
            }
        } else {
            "item"
        };
        let mut slots = Obj::new();
        json::put(&mut slots, "subject", json::text_or(view, "subject", ""));
        json::put(&mut slots, "category", json::text_or(part, "name_en", ""));
        json::put(&mut slots, "share", fmt::fmt_value(share, &unit));
        json::put(
            &mut slots,
            "share_number",
            fmt::fmt_num(share, fmt::decimals_of(&unit)),
        );
        json::put(&mut slots, "value", fmt::fmt_value(value, &unit));
        json::put(&mut slots, "rank", rank[i].to_string());
        add(out, mark.clone(), Feature::auto(kind, vec![mark], slots));
    }
}

// ---------------------------------------------------------------- scatter

fn pearson(points: &[&Obj]) -> f64 {
    let n = points.len();
    if n < 3 {
        return 0.0;
    }
    let mx: f64 = points.iter().map(|p| json::number(p, "x")).sum::<f64>() / n as f64;
    let my: f64 = points.iter().map(|p| json::number(p, "y")).sum::<f64>() / n as f64;
    let sx: f64 = points
        .iter()
        .map(|p| (json::number(p, "x") - mx).powi(2))
        .sum::<f64>()
        .sqrt();
    let sy: f64 = points
        .iter()
        .map(|p| (json::number(p, "y") - my).powi(2))
        .sum::<f64>()
        .sqrt();
    if sx == 0.0 || sy == 0.0 {
        return 0.0;
    }
    points
        .iter()
        .map(|p| (json::number(p, "x") - mx) * (json::number(p, "y") - my))
        .sum::<f64>()
        / (sx * sy)
}

fn scatter_kind(r: f64) -> &'static str {
    if r.abs() >= 0.7 {
        if r > 0.0 {
            "positive_strong"
        } else {
            "negative_strong"
        }
    } else if r.abs() >= 0.4 {
        if r > 0.0 {
            "positive_moderate"
        } else {
            "negative_moderate"
        }
    } else {
        "weak_or_none"
    }
}

fn scatter_slots(subject: &str, group: &str, r: f64, view: &Obj, unit: &Obj, groups: &IndexMap<String, String>) -> Obj {
    let x_label = json::field(view, "x")
        .map(|x| json::text_or(x, "label_en", "x"))
        .unwrap_or_else(|| "x".to_string());
    let y_label = json::field(view, "y")
        .map(|y| json::text_or(y, "label_en", "y"))
        .unwrap_or_else(|| "y".to_string());
    let mut slots = Obj::new();
    json::put(&mut slots, "subject", subject);
    json::put(&mut slots, "x", x_label);
    json::put(&mut slots, "y", y_label);
    json::put(&mut slots, "r", format!("{:.2}", r.abs()));
    json::put(&mut slots, "direction", if r > 0.0 { "positive" } else { "negative" });
    json::put(&mut slots, "group", groups.get(group).cloned().unwrap_or_default());
    json::put(&mut slots, "unit", json::text_or(unit, "short", ""));
    slots
}

fn compute_scatter(view: &Obj, out: &mut Index) {
    let unit = unit_of(view);
    let points = json::objects(view, "points").collect::<Vec<_>>();
    let xs: Vec<f64> = points.iter().map(|p| json::number(p, "x")).collect();
    let ys: Vec<f64> = points.iter().map(|p| json::number(p, "y")).collect();
    let n = points.len();
    let mx = if n > 0 { xs.iter().sum::<f64>() / n as f64 } else { 0.0 };
    let my = if n > 0 { ys.iter().sum::<f64>() / n as f64 } else { 0.0 };
    let denom = {
        let sum: f64 = xs.iter().map(|x| (x - mx).powi(2)).sum();
        if sum == 0.0 { 1.0 } else { sum }
    };
    let slope: f64 = xs
        .iter()
        .zip(ys.iter())
        .map(|(x, y)| (x - mx) * (y - my))
        .sum::<f64>()
        / denom;
    let intercept = my - slope * mx;
    let residuals: Vec<f64> = xs
        .iter()
        .zip(ys.iter())
        .map(|(x, y)| y - (slope * x + intercept))
        .collect();
    let sd = {
        let sum: f64 = residuals.iter().map(|r| r * r).sum::<f64>() / n.max(1) as f64;
        let value = sum.sqrt();
        if value == 0.0 { 1e-9 } else { value }
    };
    let mut groups: IndexMap<String, String> = IndexMap::new();
    for group in json::objects(view, "groups") {
        groups.insert(
            json::text_or(group, "id", ""),
            json::text_or(group, "name_en", ""),
        );
    }
    let mut by_group: IndexMap<String, Vec<&Obj>> = IndexMap::new();
    for p in &points {
        let key = json::text_or(p, "group", "");
        by_group.entry(key).or_default().push(*p);
    }

    let overall = pearson(&points);
    let subject = json::text_or(view, "subject", "");
    add(
        out,
        "all".to_string(),
        Feature::auto(
            scatter_kind(overall),
            vec!["all".to_string()],
            scatter_slots(&subject, "", overall, view, &unit, &groups),
        ),
    );
    for (group, pts) in &by_group {
        let r = pearson(pts);
        let mark = format!("grp:{group}");
        add(
            out,
            mark.clone(),
            Feature::auto(
                scatter_kind(r),
                vec![mark],
                scatter_slots(&subject, group, r, view, &unit, &groups),
            ),
        );
    }
    for (index, p) in points.iter().enumerate() {
        let mark = format!("pt:{}", json::text_or(p, "id", ""));
        let residual = ys[index] - (slope * xs[index] + intercept);
        let is_outlier = residual.abs() > 2.0 * sd;
        let group = json::text_or(p, "group", "");
        let r = pearson(by_group.get(&group).map(|v| v.as_slice()).unwrap_or(&points));
        let kind = if is_outlier { "outlier" } else { scatter_kind(r) };
        let mut slots = scatter_slots(&subject, &group, r, view, &unit, &groups);
        json::put(&mut slots, "x_value", fmt::one_decimal_trimmed(xs[index]));
        json::put(&mut slots, "y_value", fmt::one_decimal_trimmed(ys[index]));
        json::put(
            &mut slots,
            "category",
            json::text_or(p, "name_en", &json::text_or(p, "id", "")),
        );
        add(out, mark.clone(), Feature::auto(kind, vec![mark], slots));
    }
}

// ---------------------------------------------------------------- stacked

fn compute_stacked(view: &Obj, out: &mut Index) {
    let unit = unit_of(view);
    let n = x_values(view).len();
    let series = json::objects(view, "series").collect::<Vec<_>>();
    let totals: Vec<f64> = (0..n)
        .map(|i| series.iter().map(|s| value_at(json::array(s, "values"), i)).sum())
        .collect();
    for i in 0..n {
        let total = if totals.get(i).copied().unwrap_or(0.0) == 0.0 {
            1.0
        } else {
            totals[i]
        };
        let mut largest = 0usize;
        for (idx, s) in series.iter().enumerate() {
            if value_at(json::array(s, "values"), i)
                > value_at(json::array(series[largest], "values"), i)
            {
                largest = idx;
            }
        }
        let stack_mark = format!("stack:{i}");
        let mut slots = base_slots(view, None);
        json::put(&mut slots, "category", label(view, i));
        json::put(&mut slots, "period", label(view, i));
        json::put(&mut slots, "value", fmt::fmt_value(total, &unit));
        json::put(
            &mut slots,
            "share",
            if view.get("mode").and_then(|v| v.as_str()) == Some("percent") {
                "100 percent"
            } else {
                ""
            },
        );
        add(
            out,
            stack_mark.clone(),
            Feature::auto("composition", vec![stack_mark], slots),
        );
        for (idx, s) in series.iter().enumerate() {
            let mark = format!("seg:{i}:{}", json::text_or(s, "id", ""));
            let value = value_at(json::array(s, "values"), i);
            let share = value / total * 100.0;
            let kind = if idx == largest {
                "largest_component"
            } else {
                "item"
            };
            let mut slots = base_slots(view, Some(s));
            json::put(&mut slots, "category", label(view, i));
            json::put(&mut slots, "period", label(view, i));
            json::put(&mut slots, "value", fmt::fmt_value(value, &unit));
            json::put(&mut slots, "share", fmt::fmt_value(share, &unit));
            json::put(
                &mut slots,
                "share_number",
                fmt::fmt_num(share, fmt::decimals_of(&unit)),
            );
            json::put(&mut slots, "total", fmt::fmt_value(total, &unit));
            add(out, mark.clone(), Feature::auto(kind, vec![mark], slots));
        }
    }
}

// ---------------------------------------------------------------- heatmap

fn compute_heatmap(view: &Obj, out: &mut Index) {
    let unit = unit_of(view);
    let rows = json::objects(view, "rows").collect::<Vec<_>>();
    let cols = json::objects(view, "cols").collect::<Vec<_>>();
    let cells = json::array(view, "cells");
    let mut top = (0usize, 0usize, f64::NEG_INFINITY);
    let mut low = (0usize, 0usize, f64::INFINITY);
    for (r, row) in cells.iter().enumerate() {
        let row = match row.as_array() {
            Some(row) => row,
            None => continue,
        };
        for (c, value) in row.iter().enumerate() {
            let v = json::num(value);
            if v > top.2 {
                top = (r, c, v);
            }
            if v < low.2 {
                low = (r, c, v);
            }
        }
    }
    let cell = |r: usize, c: usize| -> f64 {
        cells
            .get(r)
            .and_then(|row| row.as_array())
            .and_then(|row| row.get(c))
            .map(json::num)
            .unwrap_or(0.0)
    };
    for (r, row) in rows.iter().enumerate() {
        for (c, col) in cols.iter().enumerate() {
            let value = cell(r, c);
            let mark = format!(
                "cell:{}:{}",
                json::text_or(row, "id", ""),
                json::text_or(col, "id", "")
            );
            let kind = if (r, c) == (top.0, top.1) {
                "peak_cell"
            } else if (r, c) == (low.0, low.1) {
                "low_cell"
            } else {
                "cell"
            };
            let mut slots = Obj::new();
            json::put(&mut slots, "subject", json::text_or(view, "subject", ""));
            json::put(&mut slots, "row", json::text_or(row, "name_en", ""));
            json::put(&mut slots, "col", json::text_or(col, "name_en", ""));
            json::put(
                &mut slots,
                "category",
                format!(
                    "{} · {}",
                    json::text_or(row, "name_en", ""),
                    json::text_or(col, "name_en", "")
                ),
            );
            json::put(&mut slots, "period", json::text_or(col, "name_en", ""));
            json::put(&mut slots, "value", fmt::fmt_value(value, &unit));
            json::put(&mut slots, "unit", json::text_or(&unit, "short", ""));
            add(out, mark.clone(), Feature::auto(kind, vec![mark], slots));
        }
        let mut busiest = 0usize;
        for c in 1..cols.len() {
            if cell(r, c) > cell(r, busiest) {
                busiest = c;
            }
        }
        let mark = format!("row:{}", json::text_or(row, "id", ""));
        let average = if cols.is_empty() {
            0.0
        } else {
            (0..cols.len()).map(|c| cell(r, c)).sum::<f64>() / cols.len() as f64
        };
        let mut slots = Obj::new();
        json::put(&mut slots, "subject", json::text_or(view, "subject", ""));
        json::put(&mut slots, "row", json::text_or(row, "name_en", ""));
        json::put(
            &mut slots,
            "col",
            cols.get(busiest)
                .map(|c| json::text_or(c, "name_en", ""))
                .unwrap_or_default(),
        );
        json::put(&mut slots, "category", json::text_or(row, "name_en", ""));
        json::put(&mut slots, "period", "the week");
        json::put(&mut slots, "value", fmt::fmt_value(average, &unit));
        json::put(&mut slots, "unit", json::text_or(&unit, "short", ""));
        add(out, mark.clone(), Feature::auto("pattern", vec![mark], slots));
    }
    for (c, col) in cols.iter().enumerate() {
        let mark = format!("col:{}", json::text_or(col, "id", ""));
        let average = if rows.is_empty() {
            0.0
        } else {
            (0..rows.len()).map(|r| cell(r, c)).sum::<f64>() / rows.len() as f64
        };
        let mut busiest = 0usize;
        for r in 1..rows.len() {
            if cell(r, c) > cell(busiest, c) {
                busiest = r;
            }
        }
        let mut slots = Obj::new();
        json::put(&mut slots, "subject", json::text_or(view, "subject", ""));
        json::put(
            &mut slots,
            "row",
            rows.get(busiest)
                .map(|r| json::text_or(r, "name_en", ""))
                .unwrap_or_default(),
        );
        json::put(&mut slots, "col", json::text_or(col, "name_en", ""));
        json::put(&mut slots, "category", json::text_or(col, "name_en", ""));
        json::put(&mut slots, "period", json::text_or(col, "name_en", ""));
        json::put(&mut slots, "value", fmt::fmt_value(average, &unit));
        json::put(&mut slots, "unit", json::text_or(&unit, "short", ""));
        add(
            out,
            mark.clone(),
            Feature::auto("compare_periods", vec![mark], slots),
        );
    }
}

// ---------------------------------------------------------------- sankey

fn compute_sankey(view: &Obj, out: &mut Index) {
    let unit = unit_of(view);
    let nodes = json::objects(view, "nodes").collect::<Vec<_>>();
    let links = json::objects(view, "links").collect::<Vec<_>>();
    let node_name = |id: &str| -> String {
        nodes
            .iter()
            .find(|n| json::text_or(n, "id", "") == id)
            .map(|n| json::text_or(n, "name_en", id))
            .unwrap_or_else(|| id.to_string())
    };
    let mut out_total: IndexMap<String, f64> = IndexMap::new();
    let mut in_total: IndexMap<String, f64> = IndexMap::new();
    for link in &links {
        let source = json::text_or(link, "source", "");
        let target = json::text_or(link, "target", "");
        *out_total.entry(source).or_insert(0.0) += json::number(link, "value");
        *in_total.entry(target).or_insert(0.0) += json::number(link, "value");
    }
    let first_column: Vec<String> = match view.get("columns") {
        Some(Value::Array(cols)) => match cols.first() {
            Some(Value::Array(first)) => first.iter().map(json::py_str).collect(),
            _ => Vec::new(),
        },
        _ => Vec::new(),
    };
    let root_total = {
        let sum: f64 = links
            .iter()
            .filter(|l| first_column.contains(&json::text_or(l, "source", "")))
            .map(|l| json::number(l, "value"))
            .sum();
        if sum == 0.0 { 1.0 } else { sum }
    };
    for link in &links {
        let source = json::text_or(link, "source", "");
        let target = json::text_or(link, "target", "");
        let value = json::number(link, "value");
        let mark = format!("link:{source}->{target}");
        let top = links
            .iter()
            .filter(|l| json::text_or(l, "source", "") == source)
            .map(|l| json::number(l, "value"))
            .fold(1.0f64, f64::max);
        let kind = if value == top {
            "main_path"
        } else if value < top * 0.5 {
            "drop_off"
        } else {
            "secondary_path"
        };
        let share = value / {
            let out = out_total.get(&source).copied().unwrap_or(0.0);
            if out == 0.0 { 1.0 } else { out }
        } * 100.0;
        let percent_unit = {
            let mut u = Obj::new();
            json::put(&mut u, "kind", "percent");
            u.insert("decimals".to_string(), Value::Number(0.into()));
            u
        };
        let mut slots = Obj::new();
        json::put(&mut slots, "subject", json::text_or(view, "subject", ""));
        json::put(&mut slots, "source", node_name(&source));
        json::put(&mut slots, "target", node_name(&target));
        json::put(&mut slots, "value", fmt::fmt_value(value, &unit));
        json::put(&mut slots, "share", fmt::fmt_value(share, &percent_unit));
        json::put(&mut slots, "pct", format!("{share:.0}"));
        json::put(&mut slots, "period", json::text_or(view, "period_label", ""));
        json::put(&mut slots, "unit", json::text_or(&unit, "short", ""));
        add(out, mark.clone(), Feature::auto(kind, vec![mark], slots));
    }
    for node in &nodes {
        let id = json::text_or(node, "id", "");
        let mark = format!("node:{id}");
        let ins = in_total.get(&id).copied().unwrap_or(0.0);
        let outs = out_total.get(&id).copied().unwrap_or(0.0);
        let node_kind = if ins > outs && ins != 0.0 {
            "merge"
        } else {
            "split"
        };
        let incoming: Vec<&&Obj> = links
            .iter()
            .filter(|l| json::text_or(l, "target", "") == id)
            .collect();
        let outgoing: Vec<&&Obj> = links
            .iter()
            .filter(|l| json::text_or(l, "source", "") == id)
            .collect();
        let (source, target, share) = if node_kind == "merge" && !incoming.is_empty() {
            let mut main = incoming[0];
            for link in &incoming[1..] {
                if json::number(link, "value") > json::number(main, "value") {
                    main = *link;
                }
            }
            (
                node_name(&json::text_or(main, "source", "")),
                json::text_or(node, "name_en", ""),
                ins.max(outs) / root_total * 100.0,
            )
        } else if !outgoing.is_empty() {
            let mut main = outgoing[0];
            for link in &outgoing[1..] {
                if json::number(link, "value") > json::number(main, "value") {
                    main = *link;
                }
            }
            (
                json::text_or(node, "name_en", ""),
                node_name(&json::text_or(main, "target", "")),
                if outs == 0.0 {
                    0.0
                } else {
                    json::number(main, "value") / outs * 100.0
                },
            )
        } else {
            (
                json::text_or(node, "name_en", ""),
                json::text_or(node, "name_en", ""),
                0.0,
            )
        };
        let percent_unit = {
            let mut u = Obj::new();
            json::put(&mut u, "kind", "percent");
            u.insert("decimals".to_string(), Value::Number(0.into()));
            u
        };
        let mut slots = Obj::new();
        json::put(&mut slots, "subject", json::text_or(view, "subject", ""));
        json::put(&mut slots, "source", source);
        json::put(&mut slots, "target", target);
        json::put(&mut slots, "category", json::text_or(node, "name_en", ""));
        json::put(&mut slots, "value", fmt::fmt_value(ins.max(outs), &unit));
        json::put(&mut slots, "share", fmt::fmt_value(share, &percent_unit));
        json::put(&mut slots, "pct", format!("{share:.0}"));
        json::put(&mut slots, "period", json::text_or(view, "period_label", ""));
        json::put(&mut slots, "unit", json::text_or(&unit, "short", ""));
        add(out, mark.clone(), Feature::auto(node_kind, vec![mark], slots));
    }
}

// ---------------------------------------------------------------- slope

fn compute_slope(view: &Obj, out: &mut Index) {
    let unit = unit_of(view);
    let entities = json::objects(view, "entities").collect::<Vec<_>>();
    let periods = json::objects(view, "periods").collect::<Vec<_>>();
    let mut ranks: Vec<Vec<usize>> = Vec::new();
    for pi in 0..periods.len() {
        let mut order: Vec<usize> = (0..entities.len()).collect();
        order.sort_by(|&a, &b| {
            json::num(&json::array(entities[b], "values")[pi])
                .partial_cmp(&json::num(&json::array(entities[a], "values")[pi]))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let mut rank = vec![0usize; entities.len()];
        for (r, &ei) in order.iter().enumerate() {
            rank[ei] = r + 1;
        }
        ranks.push(rank);
    }
    let period_label = |pi: usize| -> String {
        periods
            .get(pi)
            .map(|p| json::text_or(p, "label_en", ""))
            .unwrap_or_default()
    };
    for (ei, entity) in entities.iter().enumerate() {
        let values = json::array(entity, "values");
        let a = value_at(values, 0);
        let b = value_at(values, values.len().saturating_sub(1));
        let mark = format!("line:{}", json::text_or(entity, "id", ""));
        let delta = b - a;
        let first_rank = ranks.first().map(|r| r[ei]).unwrap_or(0);
        let last_rank = ranks.last().map(|r| r[ei]).unwrap_or(0);
        let mut kind = if first_rank == last_rank {
            "stable_rank"
        } else if last_rank < first_rank {
            "rank_up"
        } else {
            "rank_down"
        };
        // Overtake: a rank gain of two or more places.
        if kind == "rank_up" && first_rank - last_rank >= 2 {
            kind = "overtake";
        }
        let mut slots = Obj::new();
        json::put(&mut slots, "subject", json::text_or(view, "subject", ""));
        json::put(&mut slots, "entity", json::text_or(entity, "name_en", ""));
        json::put(&mut slots, "category", json::text_or(entity, "name_en", ""));
        json::put(&mut slots, "from", fmt::fmt_value(a, &unit));
        json::put(&mut slots, "to", fmt::fmt_value(b, &unit));
        json::put(&mut slots, "from_period", period_label(0));
        json::put(
            &mut slots,
            "to_period",
            period_label(periods.len().saturating_sub(1)),
        );
        json::put(
            &mut slots,
            "period",
            format!(
                "{} to {}",
                period_label(0),
                period_label(periods.len().saturating_sub(1))
            ),
        );
        json::put(&mut slots, "pct", fmt::pct_text(a, b));
        json::put(&mut slots, "pp", fmt::pp_text(delta, &unit));
        json::put(&mut slots, "delta", fmt::fmt_delta(delta, &unit));
        json::put(&mut slots, "rank", last_rank.to_string());
        json::put(&mut slots, "rank_before", first_rank.to_string());
        json::put(&mut slots, "gap", (first_rank as i64 - last_rank as i64).abs().to_string());
        add(out, mark.clone(), Feature::auto(kind, vec![mark], slots.clone()));
        for pi in 0..periods.len() {
            let pm = format!("pt:{}:{pi}", json::text_or(entity, "id", ""));
            let mut ps = slots.clone();
            json::put(&mut ps, "value", fmt::fmt_value(value_at(values, pi), &unit));
            json::put(&mut ps, "period", period_label(pi));
            json::put(&mut ps, "rank", ranks[pi][ei].to_string());
            add(out, pm.clone(), Feature::auto("point", vec![pm], ps));
        }
    }
}

// ---------------------------------------------------------------- waterfall

fn compute_waterfall(view: &Obj, out: &mut Index) {
    let unit = unit_of(view);
    let steps = json::objects(view, "steps").collect::<Vec<_>>();
    let start = json::number(view, "start_value");
    let end = start + steps.iter().map(|s| json::number(s, "value")).sum::<f64>();
    let mut largest = 0usize;
    for (i, step) in steps.iter().enumerate() {
        if json::number(step, "value").abs() > json::number(&steps[largest], "value").abs() {
            largest = i;
        }
    }
    let pos: f64 = steps
        .iter()
        .filter(|s| json::number(s, "value") > 0.0)
        .map(|s| json::number(s, "value"))
        .sum();
    let neg: f64 = steps
        .iter()
        .filter(|s| json::number(s, "value") < 0.0)
        .map(|s| -json::number(s, "value"))
        .sum();
    for (i, step) in steps.iter().enumerate() {
        let mark = format!("step:{}", json::text_or(step, "id", ""));
        let value = json::number(step, "value");
        let mut kind = if i == largest {
            "largest_step"
        } else if value > 0.0 {
            "increase_contributor"
        } else {
            "decrease_contributor"
        };
        if i == largest
            && neg != 0.0
            && pos != 0.0
            && neg / pos >= 0.5
            && value > 0.0
        {
            kind = "offset";
        }
        let mut slots = Obj::new();
        json::put(&mut slots, "subject", json::text_or(view, "subject", ""));
        json::put(&mut slots, "category", json::text_or(step, "name_en", ""));
        json::put(&mut slots, "value", fmt::fmt_value(value.abs(), &unit));
        json::put(
            &mut slots,
            "signed",
            format!(
                "{}{}",
                if value > 0.0 { "+" } else { "-" },
                fmt::fmt_value(value.abs(), &unit)
            ),
        );
        json::put(&mut slots, "start", fmt::fmt_value(start, &unit));
        json::put(&mut slots, "end", fmt::fmt_value(end, &unit));
        json::put(&mut slots, "pct", fmt::pct_text(start, end));
        json::put(&mut slots, "pp", fmt::pp_text(end - start, &unit));
        json::put(&mut slots, "period", json::text_or(view, "period_label", ""));
        json::put(&mut slots, "unit", json::text_or(&unit, "short", ""));
        add(out, mark.clone(), Feature::auto(kind, vec![mark], slots));
    }
    let start_label = json::field(view, "start")
        .map(|s| json::text_or(s, "name_en", "Start"))
        .unwrap_or_else(|| "Start".to_string());
    let end_label = json::field(view, "end")
        .map(|s| json::text_or(s, "name_en", "End"))
        .unwrap_or_else(|| "End".to_string());
    for (mark, value, label_en) in [
        ("total:start", start, start_label),
        ("total:end", end, end_label),
    ] {
        let mut slots = Obj::new();
        json::put(&mut slots, "subject", json::text_or(view, "subject", ""));
        json::put(&mut slots, "category", label_en);
        json::put(&mut slots, "value", fmt::fmt_value(value, &unit));
        json::put(&mut slots, "start", fmt::fmt_value(start, &unit));
        json::put(&mut slots, "end", fmt::fmt_value(end, &unit));
        json::put(&mut slots, "pct", fmt::pct_text(start, end));
        json::put(&mut slots, "pp", fmt::pp_text(end - start, &unit));
        json::put(&mut slots, "period", json::text_or(view, "period_label", ""));
        json::put(&mut slots, "unit", json::text_or(&unit, "short", ""));
        add(
            out,
            mark.to_string(),
            Feature::auto("net_change", vec![mark.to_string()], slots),
        );
    }
}

// ---------------------------------------------------------------- dispatch

pub fn compute_view(view: &Obj) -> Index {
    let mut out = Index::new();
    match view.get("type").and_then(|v| v.as_str()).unwrap_or("") {
        "line" => compute_line(view, &mut out),
        "bar" => compute_bar(view, &mut out),
        "pie" => compute_pie(view, &mut out),
        "scatter" => compute_scatter(view, &mut out),
        "stacked" => compute_stacked(view, &mut out),
        "heatmap" => compute_heatmap(view, &mut out),
        "sankey" => compute_sankey(view, &mut out),
        "slope" => compute_slope(view, &mut out),
        "waterfall" => compute_waterfall(view, &mut out),
        _ => {}
    }
    out
}

/// For an authored feature covering several line segments, describe the whole
/// span (first start -> last end), not just the clicked segment.
fn span_slots(view: &Obj, marks: &[String]) -> Obj {
    if view.get("type").and_then(|v| v.as_str()) != Some("line") {
        return Obj::new();
    }
    let segs: Vec<Vec<&str>> = marks
        .iter()
        .filter(|m| m.starts_with("seg:"))
        .map(|m| m.split(':').collect())
        .collect();
    if segs.len() < 2 {
        return Obj::new();
    }
    let series_id = segs[0].get(1).copied().unwrap_or("");
    let mut idx: Vec<usize> = segs
        .iter()
        .filter_map(|s| s.get(2).and_then(|v| v.parse::<usize>().ok()))
        .collect();
    idx.sort_unstable();
    if idx.is_empty() {
        return Obj::new();
    }
    let series = match json::objects(view, "series").find(|s| json::text_or(s, "id", "") == series_id) {
        Some(series) => series,
        None => return Obj::new(),
    };
    let unit = unit_of(view);
    let values = json::array(series, "values");
    let a = value_at(values, idx[0]);
    let b = value_at(values, idx[idx.len() - 1] + 1);
    let mut slots = base_slots(view, Some(series));
    json::put(&mut slots, "from", fmt::fmt_value(a, &unit));
    json::put(&mut slots, "to", fmt::fmt_value(b, &unit));
    json::put(&mut slots, "from_period", label(view, idx[0]));
    json::put(
        &mut slots,
        "to_period",
        label(view, idx[idx.len() - 1] + 1),
    );
    json::put(
        &mut slots,
        "period",
        format!(
            "{} to {}",
            label(view, idx[0]),
            label(view, idx[idx.len() - 1] + 1)
        ),
    );
    json::put(&mut slots, "pct", fmt::pct_text(a, b));
    json::put(&mut slots, "pp", fmt::pp_text(b - a, &unit));
    json::put(&mut slots, "delta", fmt::fmt_delta(b - a, &unit));
    slots
}

/// Apply authored features over computed ones, keyed by mark id.
pub fn merge_authored(view: &Obj, computed: Index) -> Index {
    let mut index = computed;
    for authored in json::objects(view, "features") {
        let marks: Vec<String> = json::array(authored, "marks")
            .iter()
            .map(json::py_str)
            .collect();
        if marks.is_empty() {
            continue;
        }
        let feature = Feature {
            kind: json::text(authored, "kind"),
            marks: marks.clone(),
            slots: authored
                .get("slots")
                .and_then(|v| v.as_object())
                .cloned()
                .unwrap_or_default(),
            auto: false,
            id: json::text(authored, "id"),
            examples: json::array(authored, "examples").to_vec(),
            note_zh: json::text_or(authored, "note_zh", ""),
            interpret_zh: json::text_or(authored, "interpret_zh", ""),
        };
        let span = span_slots(view, &marks);
        for mark in &marks {
            if !index.contains_key(mark) {
                continue;
            }
            let mut slots = if span.is_empty() {
                index
                    .get(mark)
                    .map(|f| f.slots.clone())
                    .unwrap_or_default()
            } else {
                span.clone()
            };
            for (key, value) in &feature.slots {
                slots.insert(key.clone(), value.clone());
            }
            let mut merged = feature.clone();
            merged.slots = slots;
            index.insert(mark.clone(), merged);
        }
    }
    index
}
