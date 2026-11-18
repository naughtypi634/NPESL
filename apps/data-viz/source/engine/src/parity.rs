//! Test-fixture dump for `tests/dataviz-parity.mjs`: computes every view in
//! both its shipped form and a perturbed form, so the browser engine and the
//! build engine are compared over more than the original numbers.

use serde_json::{Number, Value};
use std::path::Path;

use crate::features;
use crate::fmt;
use crate::json::{self, Obj};

fn number(x: f64) -> Value {
    Value::Number(Number::from_f64(x).unwrap_or_else(|| Number::from(0)))
}

fn bump(value: &Value) -> Value {
    number(fmt::py_round(json::num(value) * 1.13, 2))
}

fn mutate(view: &mut Value) {
    let kind = view
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    match kind.as_str() {
        "line" | "bar" | "stacked" => {
            if let Some(series) = view.get_mut("series").and_then(|v| v.as_array_mut()) {
                for s in series {
                    if let Some(values) = s.get_mut("values").and_then(|v| v.as_array_mut()) {
                        for value in values.iter_mut() {
                            let next = bump(value);
                            *value = next;
                        }
                    }
                }
            }
        }
        "pie" => {
            if let Some(parts) = view.get_mut("parts").and_then(|v| v.as_array_mut()) {
                for part in parts {
                    if let Some(value) = part.get_mut("value") {
                        let next = bump(value);
                        *value = next;
                    }
                }
            }
        }
        "scatter" => {
            if let Some(points) = view.get_mut("points").and_then(|v| v.as_array_mut()) {
                for point in points {
                    if let Some(x) = point.get_mut("x") {
                        let next = number(fmt::py_round(json::num(x) * 1.07 + 0.5, 2));
                        *x = next;
                    }
                    if let Some(y) = point.get_mut("y") {
                        let next = number(fmt::py_round(json::num(y) * 0.93 - 0.5, 2));
                        *y = next;
                    }
                }
            }
        }
        "heatmap" => {
            if let Some(cells) = view.get_mut("cells").and_then(|v| v.as_array_mut()) {
                for row in cells {
                    if let Some(row) = row.as_array_mut() {
                        for value in row.iter_mut() {
                            let next = number(fmt::py_round(json::num(value) * 1.11 + 1.0, 2));
                            *value = next;
                        }
                    }
                }
            }
        }
        "sankey" => {
            if let Some(links) = view.get_mut("links").and_then(|v| v.as_array_mut()) {
                for link in links {
                    if let Some(value) = link.get_mut("value") {
                        let next = bump(value);
                        *value = next;
                    }
                }
            }
        }
        "slope" => {
            if let Some(entities) = view.get_mut("entities").and_then(|v| v.as_array_mut()) {
                for entity in entities {
                    if let Some(values) = entity.get_mut("values").and_then(|v| v.as_array_mut()) {
                        for value in values.iter_mut() {
                            let next = bump(value);
                            *value = next;
                        }
                    }
                }
            }
        }
        "waterfall" => {
            if let Some(start) = view.get_mut("start_value") {
                let next = bump(start);
                *start = next;
            }
            if let Some(steps) = view.get_mut("steps").and_then(|v| v.as_array_mut()) {
                for step in steps {
                    if let Some(value) = step.get_mut("value") {
                        let next = bump(value);
                        *value = next;
                    }
                }
            }
        }
        _ => {}
    }
}

pub fn dump(root: &Path) -> Result<String, String> {
    let content = root.join("content").join("data-viz");
    let manifest = json::load(&content.join("manifest.json"))?;
    let manifest = manifest.as_object().ok_or("manifest.json: 不是对象")?;
    let mut out: Vec<Value> = Vec::new();
    for entry in json::objects(manifest, "topics") {
        let slug = json::text_or(entry, "id", "");
        let topic = json::load(&content.join("topics").join(format!("{slug}.json")))?;
        let topic = topic.as_object().ok_or("topic: 不是对象")?;
        for view in json::objects(topic, "views") {
            let mut edited = Value::Object(view.clone());
            mutate(&mut edited);
            let variants = [
                ("shipped", Value::Object(view.clone())),
                ("edited", edited),
            ];
            for (variant, data) in variants {
                let data_obj = data.as_object().expect("view object");
                let computed = features::compute_view(data_obj);
                let mut computed_obj = Obj::new();
                for (mark, feature) in &computed {
                    computed_obj.insert(mark.clone(), feature.to_value());
                }
                let mut item = Obj::new();
                json::put(&mut item, "topic", &slug);
                json::put(&mut item, "view", json::text_or(view, "id", ""));
                json::put(&mut item, "type", json::text_or(view, "type", ""));
                json::put(&mut item, "variant", variant);
                item.insert("data".to_string(), data);
                item.insert("computed".to_string(), Value::Object(computed_obj));
                out.push(Value::Object(item));
            }
        }
    }
    Ok(json::compact(&Value::Array(out)))
}
