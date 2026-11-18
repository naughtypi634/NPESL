//! Page and data-package builder — a direct port of `build.py`.

use indexmap::IndexMap;
use regex::Regex;
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::Path;
use std::sync::LazyLock;

use crate::features::{self, Index};
use crate::json::{self, Obj};
use crate::validate;

static SLOT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\{([a-z_]+)\}").unwrap());

fn fill(template: &str, slots: &Obj) -> String {
    SLOT.replace_all(template, |caps: &regex::Captures| match slots.get(&caps[1]) {
        Some(value) => json::py_str(value),
        None => caps[0].to_string(),
    })
    .to_string()
}

fn marks_value(marks: &[String]) -> Value {
    Value::Array(marks.iter().map(|m| Value::String(m.clone())).collect())
}

fn ship_view(view: &Obj) -> Value {
    let computed = features::compute_view(view);
    let index = features::merge_authored(view, computed);
    let mut features_out: Vec<Value> = Vec::new();
    let mut seen: BTreeSet<String> = BTreeSet::new();
    for feature in index.values() {
        let key = if !feature.id.is_empty() {
            feature.id.clone()
        } else {
            format!("{}{}", json::compact(&marks_value(&feature.marks)), feature.kind)
        };
        if !seen.insert(key) {
            continue;
        }
        let mut item = Obj::new();
        json::put(&mut item, "kind", &feature.kind);
        item.insert("marks".to_string(), marks_value(&feature.marks));
        item.insert("slots".to_string(), Value::Object(feature.slots.clone()));
        item.insert("auto".to_string(), Value::Bool(feature.auto));
        if !feature.id.is_empty() {
            json::put(&mut item, "id", &feature.id);
        }
        if !feature.examples.is_empty() {
            item.insert("examples".to_string(), Value::Array(feature.examples.clone()));
        }
        if !feature.note_zh.is_empty() {
            json::put(&mut item, "note_zh", &feature.note_zh);
        }
        if !feature.interpret_zh.is_empty() {
            json::put(&mut item, "interpret_zh", &feature.interpret_zh);
        }
        features_out.push(Value::Object(item));
    }

    let skip = [
        "features",
        "overview_zh",
        "descriptions",
        "label_zh",
        "label_en",
        "subject",
        "subtitle_en",
        "unit",
        "type",
        "id",
    ];
    let mut data = Obj::new();
    for (key, value) in view {
        if !skip.contains(&key.as_str()) {
            data.insert(key.clone(), value.clone());
        }
    }

    let mut shipped = Obj::new();
    json::put(&mut shipped, "id", json::text(view, "id"));
    json::put(&mut shipped, "type", json::text(view, "type"));
    json::put(&mut shipped, "label_zh", json::text_or(view, "label_zh", ""));
    json::put(&mut shipped, "label_en", json::text_or(view, "label_en", ""));
    json::put(&mut shipped, "subject", json::text_or(view, "subject", ""));
    json::put(
        &mut shipped,
        "subtitle_en",
        json::text_or(view, "subtitle_en", ""),
    );
    shipped.insert(
        "unit".to_string(),
        json::field(view, "unit")
            .cloned()
            .map(Value::Object)
            .unwrap_or(Value::Object(Obj::new())),
    );
    shipped.insert("data".to_string(), Value::Object(data));
    shipped.insert("features".to_string(), Value::Array(features_out));
    json::put(&mut shipped, "overview_zh", json::text_or(view, "overview_zh", ""));
    shipped.insert(
        "descriptions".to_string(),
        json::field(view, "descriptions")
            .cloned()
            .map(Value::Object)
            .unwrap_or(Value::Object(Obj::new())),
    );
    Value::Object(shipped)
}

fn build_manifest_data(
    manifest: &Obj,
    topics: &IndexMap<String, Obj>,
    bundles: Value,
) -> Value {
    let mut entries: Vec<&Obj> = json::objects(manifest, "topics").collect();
    entries.sort_by_key(|entry| json::int_or(entry, "order", 0));
    let mut cards: Vec<Value> = Vec::new();
    for entry in entries {
        let slug = json::text_or(entry, "id", "");
        let topic = match topics.get(&slug) {
            Some(topic) => topic,
            None => continue,
        };
        let views = json::objects(topic, "views").collect::<Vec<_>>();
        let primary = match views.first() {
            Some(primary) => *primary,
            None => continue,
        };
        let types: Vec<Value> = views
            .iter()
            .map(|v| Value::String(json::text(v, "type")))
            .collect();
        let allowed = [
            "x",
            "series",
            "parts",
            "points",
            "groups",
            "rows",
            "cols",
            "cells",
            "nodes",
            "links",
            "columns",
            "periods",
            "entities",
            "steps",
            "start_value",
            "start",
            "end",
            "mode",
            "period_label",
        ];
        let mut primary_data = Obj::new();
        for (key, value) in primary {
            if allowed.contains(&key.as_str()) {
                primary_data.insert(key.clone(), value.clone());
            }
        }
        let mut primary_out = Obj::new();
        json::put(&mut primary_out, "type", json::text(primary, "type"));
        json::put(
            &mut primary_out,
            "subject",
            json::text_or(primary, "subject", ""),
        );
        primary_out.insert(
            "unit".to_string(),
            json::field(primary, "unit")
                .cloned()
                .map(Value::Object)
                .unwrap_or(Value::Object(Obj::new())),
        );
        primary_out.insert("data".to_string(), Value::Object(primary_data));

        let mut card = Obj::new();
        json::put(&mut card, "id", &slug);
        card.insert(
            "order".to_string(),
            Value::Number(serde_json::Number::from(json::int_or(entry, "order", 0))),
        );
        json::put(&mut card, "domain", json::text_or(topic, "domain", ""));
        json::put(&mut card, "title_en", json::text_or(topic, "title_en", ""));
        json::put(&mut card, "title_zh", json::text_or(topic, "title_zh", ""));
        json::put(&mut card, "blurb_zh", json::text_or(topic, "blurb_zh", ""));
        card.insert("types".to_string(), Value::Array(types));
        json::put(&mut card, "default_view", json::text(primary, "id"));
        card.insert("primary".to_string(), Value::Object(primary_out));
        cards.push(Value::Object(card));
    }
    let mut out = Obj::new();
    out.insert(
        "version".to_string(),
        manifest
            .get("version")
            .cloned()
            .unwrap_or(Value::Number(1.into())),
    );
    out.insert(
        "types".to_string(),
        manifest
            .get("types")
            .cloned()
            .unwrap_or(Value::Array(Vec::new())),
    );
    out.insert("topics".to_string(), Value::Array(cards));
    out.insert("bundles".to_string(), bundles);
    Value::Object(out)
}

pub fn run(root: &Path) -> i32 {
    let problems = validate::validate_all(root, None);
    if !problems.is_empty() {
        println!("内容校验失败（{} 项），未写入任何文件：", problems.len());
        for problem in &problems {
            println!("  - {problem}");
        }
        return 1;
    }

    let content = root.join("content").join("data-viz");
    let app = root.join("apps").join("data-viz");
    let library_dir = content.join("library");
    let topics_dir = content.join("topics");

    let manifest = match json::load(&content.join("manifest.json")) {
        Ok(value) => value,
        Err(error) => {
            println!("{error}");
            return 1;
        }
    };
    let manifest = match manifest.as_object() {
        Some(manifest) => manifest.clone(),
        None => {
            println!("manifest.json: 不是对象");
            return 1;
        }
    };

    let mut topics: IndexMap<String, Obj> = IndexMap::new();
    for entry in json::objects(&manifest, "topics") {
        let slug = json::text_or(entry, "id", "");
        let path = topics_dir.join(format!("{slug}.json"));
        match json::load(&path) {
            Ok(value) => {
                if let Some(topic) = value.as_object() {
                    topics.insert(slug, topic.clone());
                }
            }
            Err(error) => {
                println!("{error}");
                return 1;
            }
        }
    }

    let mut libraries: IndexMap<String, Value> = IndexMap::new();
    for topic in topics.values() {
        for view in json::objects(topic, "views") {
            let type_id = json::text(view, "type");
            if libraries.contains_key(&type_id) {
                continue;
            }
            let path = library_dir.join(format!("{type_id}.json"));
            match json::load(&path) {
                Ok(library) => {
                    libraries.insert(type_id, library);
                }
                Err(error) => {
                    println!("{error}");
                    return 1;
                }
            }
        }
    }

    let data_dir = app.join("web").join("public").join("data");
    let lang_dir = data_dir.join("lang");
    let topic_dir = data_dir.join("topics");
    if let Err(error) = std::fs::create_dir_all(&lang_dir) {
        println!("{error}");
        return 1;
    }
    if let Err(error) = std::fs::create_dir_all(&topic_dir) {
        println!("{error}");
        return 1;
    }

    let mut keep_lang: BTreeSet<String> = BTreeSet::new();
    let mut lang_urls = Obj::new();
    for (type_id, library) in &libraries {
        let text = json::compact(library);
        let hash = json::digest(&text);
        let name = format!("{type_id}.{hash}.json");
        keep_lang.insert(name.clone());
        lang_urls.insert(type_id.clone(), Value::String(format!("lang/{name}")));
        if let Err(error) = json::write_text(&lang_dir.join(&name), &text) {
            println!("{error}");
            return 1;
        }
    }
    if let Ok(entries) = std::fs::read_dir(&lang_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !keep_lang.contains(&name) {
                let _ = std::fs::remove_file(&path);
            }
        }
    }

    let order: IndexMap<String, i64> = json::objects(&manifest, "topics")
        .map(|entry| {
            (
                json::text_or(entry, "id", ""),
                json::int_or(entry, "order", 0),
            )
        })
        .collect();

    let mut keep_topics: BTreeSet<String> = BTreeSet::new();
    let mut topic_urls = Obj::new();
    for (slug, topic) in &topics {
        let mut shipped = Obj::new();
        json::put(&mut shipped, "id", slug);
        shipped.insert(
            "order".to_string(),
            Value::Number(serde_json::Number::from(
                order.get(slug).copied().unwrap_or(0),
            )),
        );
        json::put(&mut shipped, "domain", json::text_or(topic, "domain", ""));
        json::put(&mut shipped, "title_en", json::text_or(topic, "title_en", ""));
        json::put(&mut shipped, "title_zh", json::text_or(topic, "title_zh", ""));
        json::put(&mut shipped, "blurb_zh", json::text_or(topic, "blurb_zh", ""));
        json::put(&mut shipped, "scene_zh", json::text_or(topic, "scene_zh", ""));
        let views: Vec<Value> = json::objects(topic, "views")
            .map(ship_view)
            .collect();
        shipped.insert("views".to_string(), Value::Array(views));
        let text = json::compact(&Value::Object(shipped));
        let hash = json::digest(&text);
        let name = format!("{slug}.{hash}.json");
        keep_topics.insert(name.clone());
        topic_urls.insert(slug.clone(), Value::String(format!("topics/{name}")));
        if let Err(error) = json::write_text(&topic_dir.join(&name), &text) {
            println!("{error}");
            return 1;
        }
    }
    if let Ok(entries) = std::fs::read_dir(&topic_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !keep_topics.contains(&name) {
                let _ = std::fs::remove_file(&path);
            }
        }
    }

    let mut bundles = Obj::new();
    bundles.insert("lang".to_string(), Value::Object(lang_urls));
    bundles.insert("topics".to_string(), Value::Object(topic_urls));
    let gallery = build_manifest_data(&manifest, &topics, Value::Object(bundles));
    let payload = json::compact(&gallery);
    if let Err(error) = json::write_text(&data_dir.join("index.json"), &payload) {
        println!("{error}");
        return 1;
    }

    println!("主题 {} 个，视图 {} 个", topics.len(), {
        topics
            .values()
            .map(|topic| json::objects(topic, "views").count())
            .sum::<usize>()
    });
    println!(
        "语言包 {} 个：{}",
        libraries.len(),
        libraries
            .keys()
            .cloned()
            .collect::<BTreeSet<String>>()
            .into_iter()
            .collect::<Vec<String>>()
            .join(", ")
    );
    println!("数据包：{}", data_dir.display());
    0
}

pub fn explain(root: &Path, spec: &str) -> i32 {
    let content = root.join("content").join("data-viz");
    let (slug, view_id) = match spec.split_once('/') {
        Some((slug, view_id)) => (slug, Some(view_id)),
        None => (spec, None),
    };
    let topic = match json::load(&content.join("topics").join(format!("{slug}.json"))) {
        Ok(topic) => topic,
        Err(error) => {
            println!("{error}");
            return 2;
        }
    };
    let topic = match topic.as_object() {
        Some(topic) => topic.clone(),
        None => return 2,
    };
    let views = json::objects(&topic, "views").collect::<Vec<_>>();
    let view = match view_id {
        Some(id) => views
            .iter()
            .find(|view| json::text(view, "id") == id)
            .copied(),
        None => views.first().copied(),
    };
    let view = match view {
        Some(view) => view,
        None => {
            println!(
                "没有这个视图：{slug}/{}",
                view_id.unwrap_or("None")
            );
            return 2;
        }
    };
    let library = match json::load(
        &content
            .join("library")
            .join(format!("{}.json", json::text(view, "type"))),
    ) {
        Ok(library) => library,
        Err(error) => {
            println!("{error}");
            return 2;
        }
    };
    let library = library.as_object().cloned().unwrap_or_default();
    let index: Index = features::merge_authored(view, features::compute_view(view));
    println!(
        "{slug}/{} · {} · {}",
        json::text(view, "id"),
        json::text(view, "type"),
        json::text_or(view, "subject", "")
    );
    let mut seen: BTreeSet<String> = BTreeSet::new();
    for (mark, feature) in &index {
        let key = if !feature.id.is_empty() {
            feature.id.clone()
        } else {
            mark.clone()
        };
        if !seen.insert(key) {
            continue;
        }
        let entry = json::field(&library, "features")
            .and_then(|features| features.get(&feature.kind))
            .and_then(|entry| entry.as_object())
            .cloned()
            .unwrap_or_default();
        println!(
            "\n[{}] marks={}",
            feature.kind,
            feature.marks.join(",")
        );
        for ex in &feature.examples {
            if let Some(ex) = ex.as_object() {
                println!("  例：{}", json::text_or(ex, "en", ""));
            }
        }
        for pattern in json::objects(&entry, "patterns").take(2) {
            println!(
                "  {}: {}",
                json::text_or(pattern, "level", ""),
                fill(&json::text_or(pattern, "frame", ""), &feature.slots)
            );
        }
        let registers = json::field(&entry, "registers").cloned().unwrap_or_default();
        for reg in ["general", "ielts", "business"] {
            let text = json::text_or(&registers, reg, "");
            if !text.is_empty() {
                println!("  {reg}: {}", fill(&text, &feature.slots));
            }
        }
    }
    0
}
