//! Content gate — a direct port of `validate.py`.
//!
//! Exit code 0 = no problems. The build calls `validate_all` and refuses to
//! write anything when there are problems.

use regex::Regex;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::sync::LazyLock;

use crate::features::{compute_view, merge_authored, Index};
use crate::goals;
use crate::json::{self, Obj};

pub static TYPES: [&str; 9] = [
    "line", "bar", "pie", "scatter", "stacked", "heatmap", "sankey", "slope", "waterfall",
];
static REGISTERS: [&str; 3] = ["spoken", "neutral", "written"];
static LEVELS: [&str; 3] = ["a2", "b1", "b2"];
pub static DOMAINS: [&str; 5] = ["business", "technology", "lifestyle", "economy", "education"];

static CJKS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("[㐀-鿿　-〿＀-￯]").unwrap());
static SLOT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\{([a-z_]+)\}").unwrap());
static WORD: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[A-Za-z][A-Za-z'’-]*").unwrap());
static APOS_WORD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[a-z']+").unwrap());
static PER_CENT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\bper cent\b").unwrap());
static CAUSAL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)\b(cause[sd]?|causing|leads? to|led to|result(s|ed)? in|due to|because of|drives?|driven by|affect(s|ed)?|impact(s|ed)?)\b",
    )
    .unwrap()
});
static LATIN4: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[A-Za-z]{4,}").unwrap());
static UNCLOSED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\{[^}]*$").unwrap());
static WS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").unwrap());

static ALLOWED_SLOTS: [&str; 38] = [
    "subject", "from", "to", "from_period", "to_period", "period", "pct", "pp", "delta",
    "gap", "peak", "peak_period", "share", "share_number", "category", "rank",
    "rank_before", "source", "target", "x", "y", "value", "row", "col", "entity",
    "series_name", "unit", "top_category", "top_value", "x_value", "y_value",
    "direction", "group", "start", "end", "signed", "total", "r",
];

static BRITISH: [&str; 64] = [
    "colour", "colours", "favourite", "realise", "realised", "centre", "centres", "metre",
    "metres", "litre", "theatre", "travelling", "travelled", "cancelled", "labelled",
    "petrol", "motorway", "queue", "queued", "queueing", "mum", "rubbish", "lorry",
    "aeroplane", "aluminium", "programme", "cheque", "grey", "postcode", "chemist",
    "fortnight", "uni", "organisation", "organise", "neighbour", "neighbours",
    "apologise", "apologised", "practise", "practised", "towards", "whilst", "amongst",
    "analyse", "defence", "licence", "modelling", "fulfil", "enrol", "judgement",
    "ageing", "storey", "tonne", "kerb", "tyre", "pyjamas", "moustache", "plough",
    "mould", "spelt", "learnt", "burnt", "dreamt", "leant",
];

fn py_list(items: &[String]) -> String {
    let quoted: Vec<String> = items.iter().map(|s| format!("'{s}'")).collect();
    format!("[{}]", quoted.join(", "))
}

fn opt_text(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => String::new(),
        Some(value) => json::py_str(value),
    }
}

fn mtext(m: &Obj, key: &str) -> String {
    opt_text(m.get(key))
}

fn words(text: &str) -> Vec<String> {
    WORD.find_iter(text).map(|m| m.as_str().to_string()).collect()
}

fn check_en(
    where_: &str,
    text: &str,
    problems: &mut Vec<String>,
    allow_causal: bool,
    max_words: usize,
) {
    let text = text.trim();
    if text.is_empty() {
        problems.push(format!("{where_}: 空英文"));
        return;
    }
    if CJKS.is_match(text) {
        problems.push(format!("{where_}: 英文里有中文"));
    }
    let low = text.to_lowercase();
    let mut hits: BTreeSet<String> = BTreeSet::new();
    for m in APOS_WORD.find_iter(&low) {
        let word = m.as_str();
        if BRITISH.contains(&word) {
            hits.insert(word.to_string());
        }
    }
    if !hits.is_empty() {
        let list: Vec<String> = hits.into_iter().collect();
        problems.push(format!("{where_}: 英式词 {}", py_list(&list)));
    }
    if PER_CENT.is_match(&low) {
        problems.push(format!("{where_}: 用 percent，不写 per cent"));
    }
    if text.contains('%') {
        problems.push(format!("{where_}: 英文句子里写 percent，不写 %"));
    }
    if !allow_causal {
        if let Some(found) = CAUSAL.find(text) {
            problems.push(format!(
                "{where_}: 出现因果词（{}）",
                found.as_str()
            ));
        }
    }
    let count = words(text).len();
    if !(1..=max_words).contains(&count) {
        problems.push(format!(
            "{where_}: 英文 {count} 词（上限 {max_words}）"
        ));
    }
}

fn check_zh(where_: &str, text: &str, problems: &mut Vec<String>, required: bool) {
    let text = text.trim();
    if required && text.is_empty() {
        problems.push(format!("{where_}: 缺中文"));
    }
    if !text.is_empty() && !CJKS.is_match(text) && LATIN4.is_match(text) {
        problems.push(format!("{where_}: 中文栏里像英文"));
    }
}

fn check_slots(
    where_: &str,
    text: &str,
    requires: &[String],
    problems: &mut Vec<String>,
) -> BTreeSet<String> {
    let mut found: BTreeSet<String> = BTreeSet::new();
    for caps in SLOT.captures_iter(text) {
        found.insert(caps[1].to_string());
    }
    let bad: Vec<String> = found
        .iter()
        .filter(|name| !ALLOWED_SLOTS.contains(&name.as_str()))
        .cloned()
        .collect();
    if !bad.is_empty() {
        problems.push(format!("{where_}: 未知槽位 {}", py_list(&bad)));
    }
    let missing: Vec<String> = found
        .iter()
        .filter(|name| !requires.contains(name))
        .cloned()
        .collect();
    if !missing.is_empty() {
        problems.push(format!("{where_}: 槽位不在 requires 里 {}", py_list(&missing)));
    }
    if text.contains('{') && UNCLOSED.is_match(text) {
        problems.push(format!("{where_}: 未闭合的槽位"));
    }
    found
}

fn check_view(where_: &str, view: &Obj, library: &Obj, problems: &mut Vec<String>) {
    let t = json::text(view, "type");
    if !TYPES.contains(&t.as_str()) {
        problems.push(format!("{where_}: 未知图表类型 {t}"));
        return;
    }
    let unit = json::field(view, "unit").cloned().unwrap_or_default();
    if json::text_or(&unit, "en", "").is_empty() {
        problems.push(format!("{where_}: unit.en 缺失"));
    }
    if !unit.get("decimals").map(json::is_int).unwrap_or(false) {
        problems.push(format!("{where_}: unit.decimals 必须是整数"));
    }
    if json::text(view, "subject").is_empty() {
        problems.push(format!("{where_}: 缺 subject"));
    }
    if json::text(view, "overview_zh").is_empty() {
        problems.push(format!("{where_}: 缺 overview_zh"));
    }
    let desc = json::field(view, "descriptions").cloned().unwrap_or_default();
    let general = json::field(&desc, "general").cloned().unwrap_or_default();
    for key in ["a2", "b1", "b2"] {
        check_en(
            &format!("{where_}/descriptions.general.{key}"),
            &mtext(&general, key),
            problems,
            true,
            90,
        );
    }
    for key in ["ielts", "business"] {
        check_en(
            &format!("{where_}/descriptions.{key}"),
            &mtext(&desc, key),
            problems,
            true,
            90,
        );
    }

    if t == "line" || t == "bar" || t == "stacked" {
        let xs = json::field(view, "x")
            .map(|x| json::array(x, "values"))
            .unwrap_or(json::EMPTY);
        let series = json::objects(view, "series").collect::<Vec<_>>();
        if series.is_empty() {
            problems.push(format!("{where_}: 缺 series"));
        }
        if !(2..=30).contains(&xs.len()) {
            problems.push(format!("{where_}: x 有 {} 个（要 2-30）", xs.len()));
        }
        let slots: Vec<i64> = series.iter().map(|s| json::int_or(s, "slot", 0)).collect();
        let unique: BTreeSet<i64> = slots.iter().copied().collect();
        if unique.len() != slots.len()
            || slots.iter().any(|s| !(1..=8).contains(s))
        {
            problems.push(format!("{where_}: series slot 必须是 1-8 且唯一"));
        }
        for s in &series {
            let values = json::array(s, "values");
            if values.len() != xs.len() {
                problems.push(format!(
                    "{where_}: 系列 {} 长度和 x 不一致",
                    json::text_or(s, "id", "")
                ));
            }
            for v in values {
                if !json::is_number(v) {
                    problems.push(format!(
                        "{where_}: 系列 {} 有非数字",
                        json::text_or(s, "id", "")
                    ));
                }
            }
        }
    } else if t == "pie" {
        let parts = json::objects(view, "parts").collect::<Vec<_>>();
        if !(3..=6).contains(&parts.len()) {
            problems.push(format!(
                "{where_}: 饼图要有 3-6 块（现在 {}）",
                parts.len()
            ));
        }
        let total: f64 = parts.iter().map(|p| json::number(p, "value")).sum();
        if total <= 0.0 {
            problems.push(format!("{where_}: 饼图总值为 0"));
        } else if (total - 100.0).abs() > 1.0 {
            problems.push(format!("{where_}: 饼图合计 {total}，应为 100±1"));
        }
        let ids: BTreeSet<String> = parts
            .iter()
            .map(|p| json::text_or(p, "id", ""))
            .collect();
        if ids.len() != parts.len() {
            problems.push(format!("{where_}: 饼图 id 重复"));
        }
    } else if t == "scatter" {
        let points = json::objects(view, "points").collect::<Vec<_>>();
        let groups = json::objects(view, "groups").collect::<Vec<_>>();
        if !(15..=60).contains(&points.len()) {
            problems.push(format!(
                "{where_}: 散点要有 15-60 个点（现在 {}）",
                points.len()
            ));
        }
        if groups.len() > 3 {
            problems.push(format!("{where_}: 散点最多 3 组"));
        }
        let ids: BTreeSet<String> = points
            .iter()
            .map(|p| json::text_or(p, "id", ""))
            .collect();
        if ids.len() != points.len() {
            problems.push(format!("{where_}: 散点 id 重复"));
        }
        for p in &points {
            if !p.get("x").map(json::is_number).unwrap_or(false)
                || !p.get("y").map(json::is_number).unwrap_or(false)
            {
                problems.push(format!(
                    "{where_}: 散点 {} x/y 不是数字",
                    json::text_or(p, "id", "")
                ));
            }
        }
    } else if t == "heatmap" {
        let rows = json::objects(view, "rows").collect::<Vec<_>>();
        let cols = json::objects(view, "cols").collect::<Vec<_>>();
        let cells = json::array(view, "cells");
        if !(3..=10).contains(&rows.len()) || !(3..=14).contains(&cols.len()) {
            problems.push(format!(
                "{where_}: 热力图行列数 {}×{} 超出范围",
                rows.len(),
                cols.len()
            ));
        }
        let ragged = cells.len() != rows.len()
            || cells.iter().any(|row| {
                row.as_array()
                    .map(|row| row.len() != cols.len())
                    .unwrap_or(true)
            });
        if ragged {
            problems.push(format!("{where_}: 热力图矩阵不齐"));
        }
        for row in cells {
            if let Some(row) = row.as_array() {
                for v in row {
                    if !json::is_number(v) {
                        problems.push(format!("{where_}: 热力图有非数字"));
                    }
                }
            }
        }
    } else if t == "sankey" {
        let nodes = json::objects(view, "nodes").collect::<Vec<_>>();
        let links = json::objects(view, "links").collect::<Vec<_>>();
        let ids: BTreeSet<String> = nodes
            .iter()
            .map(|n| json::text_or(n, "id", ""))
            .collect();
        if !(4..=16).contains(&nodes.len()) {
            problems.push(format!(
                "{where_}: 流向图节点 {} 个（要 4-16）",
                nodes.len()
            ));
        }
        if !(3..=24).contains(&links.len()) {
            problems.push(format!(
                "{where_}: 流向图连线 {} 条（要 3-24）",
                links.len()
            ));
        }
        let cols: std::collections::BTreeMap<String, i64> = nodes
            .iter()
            .map(|n| (json::text_or(n, "id", ""), json::int_or(n, "column", 0)))
            .collect();
        for link in &links {
            let s = json::text_or(link, "source", "");
            let d = json::text_or(link, "target", "");
            if !ids.contains(&s) || !ids.contains(&d) {
                problems.push(format!("{where_}: 流向图连线指向不存在的节点 {s}->{d}"));
            } else if s == d {
                problems.push(format!("{where_}: 流向图不能自连 {s}"));
            } else if cols.get(&d).copied().unwrap_or(0) <= cols.get(&s).copied().unwrap_or(0) {
                problems.push(format!("{where_}: 流向图必须从左列流向右列 {s}->{d}"));
            }
            let value = link.get("value").map(json::num).unwrap_or(f64::NAN);
            if !link.get("value").map(json::is_number).unwrap_or(false) || !(value > 0.0) {
                problems.push(format!("{where_}: 流向图数值必须为正"));
            }
        }
    } else if t == "slope" {
        let periods = json::objects(view, "periods").collect::<Vec<_>>();
        let entities = json::objects(view, "entities").collect::<Vec<_>>();
        if !(2..=3).contains(&periods.len()) {
            problems.push(format!(
                "{where_}: 斜率图要有 2-3 期（现在 {}）",
                periods.len()
            ));
        }
        if !(2..=8).contains(&entities.len()) {
            problems.push(format!(
                "{where_}: 斜率图要有 2-8 个对象（现在 {}）",
                entities.len()
            ));
        }
        for e in &entities {
            if json::array(e, "values").len() != periods.len() {
                problems.push(format!(
                    "{where_}: 斜率图 {} 数值期数不符",
                    json::text_or(e, "id", "")
                ));
            }
        }
    } else if t == "waterfall" {
        let steps = json::objects(view, "steps").collect::<Vec<_>>();
        if !(3..=8).contains(&steps.len()) {
            problems.push(format!(
                "{where_}: 瀑布图要有 3-8 步（现在 {}）",
                steps.len()
            ));
        }
        if !view.get("start_value").map(json::is_number).unwrap_or(false) {
            problems.push(format!("{where_}: 瀑布图缺 start_value"));
        }
    }

    let computed: Index = compute_view(view);
    let library_features = json::field(library, "features").cloned().unwrap_or_default();
    for feature in computed.values() {
        if !library_features.contains_key(&feature.kind) {
            problems.push(format!(
                "{where_}: 计算出的 kind {} 在库里没有",
                feature.kind
            ));
        }
    }
    for authored in json::objects(view, "features") {
        let where_f = format!(
            "{where_}/feature:{}",
            json::text_or(authored, "id", "")
        );
        let kind = json::text(authored, "kind");
        if kind.is_empty() {
            problems.push(format!("{where_f}: 缺 kind"));
            continue;
        }
        if !library_features.contains_key(&kind) {
            problems.push(format!("{where_f}: 库中没有 kind {kind}"));
        }
        let marks: Vec<String> = json::array(authored, "marks")
            .iter()
            .map(json::py_str)
            .collect();
        if marks.is_empty() {
            problems.push(format!("{where_f}: 缺 marks"));
        }
        for mark in &marks {
            if !computed.contains_key(mark) {
                problems.push(format!("{where_f}: mark 不存在 {mark}"));
            }
        }
        for ex in json::objects(authored, "examples") {
            check_en(
                &format!("{where_f}/example"),
                &mtext(ex, "en"),
                problems,
                true,
                45,
            );
            check_zh(
                &format!("{where_f}/example"),
                &mtext(ex, "zh"),
                problems,
                true,
            );
        }
        if !json::text(authored, "note_zh").is_empty() {
            check_zh(
                &format!("{where_f}/note"),
                &json::text(authored, "note_zh"),
                problems,
                true,
            );
        }
        if !json::text(authored, "interpret_zh").is_empty() {
            check_zh(
                &format!("{where_f}/interpret"),
                &json::text(authored, "interpret_zh"),
                problems,
                true,
            );
        }
    }
    let count = json::array(view, "features").len();
    if !(3..=8).contains(&count) {
        problems.push(format!("{where_}: 作者特征 {count} 条（要 3-8）"));
    }

    // Correlation is not causation: scatter copy must hedge.
    if t == "scatter" {
        let mut texts: Vec<String> = Vec::new();
        for ex in json::objects(view, "features") {
            for example in json::objects(ex, "examples") {
                texts.push(json::text_or(example, "en", ""));
            }
        }
        for key in ["a2", "b1", "b2"] {
            texts.push(mtext(&general, key));
        }
        texts.push(mtext(&desc, "ielts"));
        texts.push(mtext(&desc, "business"));
        for text in &texts {
            if let Some(found) = CAUSAL.find(text) {
                problems.push(format!(
                    "{where_}: 散点文本出现因果词（{}）",
                    found.as_str()
                ));
            }
        }
    }
}

fn check_library(type_id: &str, lib: &Obj, problems: &mut Vec<String>) {
    let where_ = format!("library/{type_id}");
    if json::text(lib, "type") != type_id {
        problems.push(format!("{where_}: type 字段不匹配"));
    }
    let features = json::field(lib, "features").cloned().unwrap_or_default();
    let mut comparisons: indexmap::IndexMap<String, &Obj> = indexmap::IndexMap::new();
    for comp in json::objects(lib, "comparisons") {
        comparisons.insert(json::text_or(comp, "id", ""), comp);
    }
    for (cid, comp) in &comparisons {
        if cid.is_empty() {
            problems.push(format!("{where_}: 比较条目缺 id"));
            continue;
        }
        for key in ["a", "b", "meaning_zh", "grammar_zh", "collocations_zh", "usage_zh"] {
            if !json::truthy(comp.get(key)) {
                problems.push(format!("{where_}/{cid}: 缺 {key}"));
            }
        }
        for ex in json::objects(comp, "examples") {
            check_en(
                &format!("{where_}/{cid}/example"),
                &mtext(ex, "en"),
                problems,
                true,
                40,
            );
        }
    }
    for (kind, entry) in &features {
        let kw = format!("{where_}/{kind}");
        let entry = match entry.as_object() {
            Some(entry) => entry,
            None => continue,
        };
        if json::text(entry, "label_zh").is_empty() {
            problems.push(format!("{kw}: 缺 label_zh"));
        }
        let requires: Vec<String> = json::array(entry, "requires")
            .iter()
            .map(json::py_str)
            .collect();
        if !entry.get("requires").map(|v| v.is_array()).unwrap_or(true) {
            problems.push(format!("{kw}: requires 必须是列表"));
        }
        let words_list = json::objects(entry, "words").collect::<Vec<_>>();
        if words_list.len() < 3 {
            problems.push(format!("{kw}: 词汇少于 3 条"));
        }
        let regs: BTreeSet<String> = words_list
            .iter()
            .map(|w| json::text_or(w, "register", ""))
            .collect();
        if !["spoken", "neutral", "written"]
            .iter()
            .all(|r| regs.contains(*r))
        {
            problems.push(format!("{kw}: 词汇没有覆盖 spoken/neutral/written"));
        }
        for w in &words_list {
            check_en(
                &format!("{kw}/word:{}", json::text_or(w, "en", "")),
                &mtext(w, "en"),
                problems,
                true,
                8,
            );
            check_zh(
                &format!("{kw}/word:{}", json::text_or(w, "en", "")),
                &mtext(w, "zh"),
                problems,
                true,
            );
            let register = json::text(w, "register");
            if !REGISTERS.contains(&register.as_str()) {
                problems.push(format!("{kw}: register 非法 {register}"));
            }
        }
        let patterns = json::objects(entry, "patterns").collect::<Vec<_>>();
        if patterns.is_empty() {
            problems.push(format!("{kw}: 缺句型"));
        }
        if !patterns.iter().any(|p| json::text(p, "level") == "a2") {
            problems.push(format!("{kw}: 至少一个 A2 句型"));
        }
        if !patterns
            .iter()
            .any(|p| matches!(json::text(p, "level").as_str(), "b1" | "b2"))
        {
            problems.push(format!("{kw}: 至少一个 B1 或 B2 句型（Advanced）"));
        }
        for p in &patterns {
            let id = json::text_or(p, "id", "");
            check_slots(
                &format!("{kw}/pattern:{id}"),
                &mtext(p, "frame"),
                &requires,
                problems,
            );
            check_slots(
                &format!("{kw}/pattern:{id}"),
                &mtext(p, "zh_frame"),
                &requires,
                problems,
            );
            check_en(
                &format!("{kw}/pattern:{id}"),
                &mtext(p, "frame"),
                problems,
                true,
                30,
            );
            let level = json::text(p, "level");
            if !LEVELS.contains(&level.as_str()) {
                problems.push(format!("{kw}: 句型 level 非法"));
            }
        }
        for cid in json::array(entry, "compare") {
            let cid = json::py_str(cid);
            if !comparisons.contains_key(&cid) {
                problems.push(format!("{kw}: 比较 id 不存在 {cid}"));
            }
        }
        for trap in json::objects(entry, "traps") {
            check_en(
                &format!("{kw}/trap"),
                &mtext(trap, "wrong_en"),
                problems,
                true,
                35,
            );
            check_en(
                &format!("{kw}/trap"),
                &mtext(trap, "right_en"),
                problems,
                true,
                35,
            );
            let wrong = mtext(trap, "wrong_en");
            let right = mtext(trap, "right_en");
            if wrong == right {
                problems.push(format!("{kw}: trap 的 wrong 和 right 相同"));
            }
            let combined = format!("{wrong}{right}");
            if combined.contains("...") {
                problems.push(format!("{kw}: trap 里有占位省略号"));
            }
            if combined.contains('{') {
                problems.push(format!("{kw}: trap 必须是独立例句，不能带槽位"));
            }
            check_zh(
                &format!("{kw}/trap"),
                &mtext(trap, "why_zh"),
                problems,
                true,
            );
        }
        let registers = json::field(entry, "registers").cloned().unwrap_or_default();
        for reg in ["general", "ielts", "business"] {
            let text = mtext(&registers, reg);
            check_slots(
                &format!("{kw}/registers.{reg}"),
                &text,
                &requires,
                problems,
            );
            check_en(
                &format!("{kw}/registers.{reg}"),
                &text,
                problems,
                true,
                35,
            );
        }
    }
}

pub fn validate_all(root: &Path, only_topic: Option<&str>) -> Vec<String> {
    let mut problems: Vec<String> = Vec::new();
    let content = root.join("content").join("data-viz");
    let topics_dir = content.join("topics");
    let library_dir = content.join("library");
    let manifest_path = content.join("manifest.json");
    let manifest = match json::load(&manifest_path) {
        Ok(value) => value,
        Err(error) => {
            problems.push(format!("manifest: {error}"));
            return problems;
        }
    };
    let manifest = match manifest.as_object() {
        Some(manifest) => manifest.clone(),
        None => {
            problems.push("manifest: 不是对象".to_string());
            return problems;
        }
    };
    let type_ids: BTreeSet<String> = json::objects(&manifest, "types")
        .map(|t| json::text_or(t, "id", ""))
        .collect();
    let expected: BTreeSet<String> = TYPES.iter().map(|t| t.to_string()).collect();
    if type_ids != expected {
        let diff: Vec<String> = type_ids
            .symmetric_difference(&expected)
            .cloned()
            .collect();
        problems.push(format!("manifest: 类型列表不全 {}", py_list(&diff)));
    }
    let mut used_types: BTreeSet<String> = BTreeSet::new();
    let mut seen_sentences: indexmap::IndexMap<String, String> = indexmap::IndexMap::new();
    let mut topic_ids: Vec<String> = Vec::new();
    let mut goal_topics: BTreeMap<&'static str, BTreeSet<String>> = BTreeMap::new();
    let entries: Vec<Obj> = if let Some(only) = only_topic {
        let mut entry = Obj::new();
        json::put(&mut entry, "id", only);
        vec![entry]
    } else {
        json::objects(&manifest, "topics").cloned().collect()
    };
    for entry in &entries {
        let slug = json::text_or(entry, "id", "");
        topic_ids.push(slug.clone());
        let path = topics_dir.join(format!("{slug}.json"));
        let topic = match json::load(&path) {
            Ok(value) => value,
            Err(_) => {
                problems.push(format!("topics/{slug}.json 不存在"));
                continue;
            }
        };
        let topic = match topic.as_object() {
            Some(topic) => topic,
            None => {
                problems.push(format!("topics/{slug}: 不是对象"));
                continue;
            }
        };
        if json::text(topic, "id") != slug {
            problems.push(format!("topics/{slug}: id 不匹配"));
        }
        if topic.get("demo") != Some(&Value::Bool(true)) {
            problems.push(format!("topics/{slug}: 必须声明 demo: true"));
        }
        let domain = json::text(topic, "domain");
        if !DOMAINS.contains(&domain.as_str()) {
            problems.push(format!("topics/{slug}: domain 非法 {domain}"));
        }
        for key in ["title_en", "title_zh", "blurb_zh", "scene_zh"] {
            if !json::truthy(topic.get(key)) {
                problems.push(format!("topics/{slug}: 缺 {key}"));
            }
        }
        let views = json::objects(topic, "views").collect::<Vec<_>>();
        if !(1..=8).contains(&views.len()) {
            problems.push(format!(
                "topics/{slug}: views 数量 {}（要 1-8）",
                views.len()
            ));
        }
        for (vi, view) in views.iter().enumerate() {
            let view_id = {
                let id = json::text_or(view, "id", "");
                if id.is_empty() {
                    vi.to_string()
                } else {
                    id
                }
            };
            let where_ = format!("topics/{slug}/{view_id}");
            let t = json::text(view, "type");
            used_types.insert(t.clone());
            let lib_path = library_dir.join(format!("{t}.json"));
            if !lib_path.exists() {
                problems.push(format!("{where_}: 缺 library/{t}.json"));
                continue;
            }
            let lib = match json::load(&lib_path) {
                Ok(lib) => lib,
                Err(error) => {
                    problems.push(format!("{where_}: {error}"));
                    continue;
                }
            };
            let lib = lib.as_object().cloned().unwrap_or_default();
            check_view(&where_, view, &lib, &mut problems);

            // Author ids and mark ownership are stable handles for the app:
            // the UI uses them for the previous / next tour and for editing.
            let mut authored_ids: BTreeSet<String> = BTreeSet::new();
            let mut authored_mark_owner: BTreeMap<String, String> = BTreeMap::new();
            for authored in json::objects(view, "features") {
                let id = json::text(authored, "id");
                if id.is_empty() {
                    problems.push(format!("{where_}/feature: 缺 id"));
                } else if !authored_ids.insert(id.clone()) {
                    problems.push(format!("{where_}/feature:{id}: id 重复"));
                }
                for mark in json::array(authored, "marks") {
                    let mark = json::py_str(mark);
                    if let Some(previous) = authored_mark_owner.insert(mark.clone(), id.clone()) {
                        problems.push(format!(
                            "{where_}: mark {mark} 同时属于 {previous} 和 {id}"
                        ));
                    }
                }
            }

            let merged = merge_authored(view, compute_view(view));
            let goals_here = goals::ordered_goals(
                merged.values().map(|feature| feature.kind.as_str()),
            );
            if goals_here.is_empty() {
                problems.push(format!("{where_}: 没有任何学习目标"));
            }
            for goal in goals_here {
                goal_topics
                    .entry(goal)
                    .or_default()
                    .insert(slug.clone());
            }

            // Duplicate English sentences across the whole corpus.
            let mut texts: Vec<String> = Vec::new();
            for ex in json::objects(view, "features") {
                for example in json::objects(ex, "examples") {
                    texts.push(json::text_or(example, "en", ""));
                }
            }
            let desc = json::field(view, "descriptions").cloned().unwrap_or_default();
            let general = json::field(&desc, "general").cloned().unwrap_or_default();
            for key in ["a2", "b1", "b2"] {
                texts.push(mtext(&general, key));
            }
            for key in ["ielts", "business"] {
                texts.push(mtext(&desc, key));
            }
            for text in texts {
                let norm = WS
                    .replace_all(&text.to_lowercase(), " ")
                    .trim()
                    .to_string();
                if norm.is_empty() {
                    continue;
                }
                if let Some(first) = seen_sentences.get(&norm) {
                    problems.push(format!("{where_}: 句子与 {first} 重复"));
                } else {
                    seen_sentences.insert(norm, where_.clone());
                }
            }
        }
    }
    for t in &used_types {
        let path = library_dir.join(format!("{t}.json"));
        if path.exists() {
            if let Ok(lib) = json::load(&path) {
                if let Some(lib) = lib.as_object() {
                    check_library(t, lib, &mut problems);
                    if let Some(features) = json::field(lib, "features") {
                        for kind in features.keys() {
                            if goals::goal_of(kind).is_none() && !goals::is_generic(kind) {
                                problems.push(format!(
                                    "library/{t}/{kind}: 没有学习目标，也不在通用列表"
                                ));
                            }
                        }
                    }
                }
            }
        }
    }
    if only_topic.is_none() {
        for goal in &goals::GOALS {
            let count = goal_topics
                .get(goal.id)
                .map(|topics| topics.len())
                .unwrap_or(0);
            if count < 3 {
                problems.push(format!(
                    "学习目标 {} 只有 {} 个主题（至少 3）",
                    goal.label_zh, count
                ));
            }
        }
    }
    let unique: BTreeSet<&String> = topic_ids.iter().collect();
    if topic_ids.len() != unique.len() {
        problems.push("manifest: topic id 重复".to_string());
    }
    // Coverage is reported by the build, not enforced while content is being written.
    for t in &used_types {
        let path = library_dir.join(format!("{t}.json"));
        if !path.exists() {
            problems.push(format!("library/{t}.json 不存在"));
        }
    }
    problems
}
