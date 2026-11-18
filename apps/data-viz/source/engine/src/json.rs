//! JSON helpers: load, compact serialization, and the small pieces of Python
//! semantics the build output depends on (key order, number formatting,
//! truthiness, `str()`).

use serde_json::{Map, Number, Value};
use sha1::{Digest, Sha1};
use std::path::Path;

pub type Obj = Map<String, Value>;

pub const EMPTY: &[Value] = &[];

pub fn load(path: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
}

pub fn field<'a>(m: &'a Obj, key: &str) -> Option<&'a Obj> {
    m.get(key).and_then(|v| v.as_object())
}

pub fn array<'a>(m: &'a Obj, key: &str) -> &'a [Value] {
    match m.get(key) {
        Some(Value::Array(a)) => a,
        _ => EMPTY,
    }
}

pub fn objects<'a>(m: &'a Obj, key: &str) -> impl Iterator<Item = &'a Obj> + 'a {
    array(m, key).iter().filter_map(|v| v.as_object())
}

pub fn text(m: &Obj, key: &str) -> String {
    m.get(key).map(py_str).unwrap_or_default()
}

pub fn text_or(m: &Obj, key: &str, default: &str) -> String {
    m.get(key).map(py_str).unwrap_or_else(|| default.to_string())
}

pub fn num(v: &Value) -> f64 {
    v.as_f64().unwrap_or(0.0)
}

pub fn number(m: &Obj, key: &str) -> f64 {
    m.get(key).map(num).unwrap_or(0.0)
}

pub fn int_of(v: &Value) -> i64 {
    match v {
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                i
            } else if let Some(u) = n.as_u64() {
                u as i64
            } else {
                n.as_f64().unwrap_or(0.0) as i64
            }
        }
        Value::Bool(b) => *b as i64,
        _ => 0,
    }
}

pub fn int_or(m: &Obj, key: &str, default: i64) -> i64 {
    m.get(key).map(int_of).unwrap_or(default)
}

pub fn is_number(v: &Value) -> bool {
    v.is_number()
}

pub fn is_int(v: &Value) -> bool {
    match v {
        Value::Number(n) => n.is_i64() || n.is_u64(),
        _ => false,
    }
}

/// Python truthiness for the values that reach these checks.
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().map(|x| x != 0.0).unwrap_or(true),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(o)) => !o.is_empty(),
    }
}

pub fn put(m: &mut Obj, key: &str, value: impl Into<String>) {
    m.insert(key.to_string(), Value::String(value.into()));
}

pub fn compact(value: &Value) -> String {
    serde_json::to_string(value).expect("serialize")
}

pub fn digest(text: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(text.as_bytes());
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>()[..10]
        .to_string()
}

pub fn read_text(path: &Path) -> std::io::Result<String> {
    // Python text mode uses universal newlines.
    let text = std::fs::read_to_string(path)?;
    Ok(text.replace("\r\n", "\n").replace('\r', "\n"))
}

pub fn write_text(path: &Path, text: &str) -> std::io::Result<()> {
    // Python `write_text` translates newlines to the platform separator.
    if cfg!(windows) {
        std::fs::write(path, text.replace('\n', "\r\n"))
    } else {
        std::fs::write(path, text)
    }
}

fn float_repr(x: f64) -> String {
    if x.is_nan() {
        return "nan".to_string();
    }
    if x.is_infinite() {
        return if x > 0.0 { "inf" } else { "-inf" }.to_string();
    }
    if x == 0.0 {
        return if x.is_sign_negative() { "-0.0" } else { "0.0" }.to_string();
    }
    let sci = format!("{x:e}");
    let (mantissa, exponent) = sci.split_once('e').expect("exponent");
    let exp: i32 = exponent.parse().expect("exponent number");
    let negative = mantissa.starts_with('-');
    let mantissa = mantissa.trim_start_matches('-');
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let mut out = String::new();
    if negative {
        out.push('-');
    }
    if (-4..16).contains(&exp) {
        if exp >= 0 {
            let e = exp as usize;
            if digits.len() > e + 1 {
                out.push_str(&digits[..e + 1]);
                out.push('.');
                out.push_str(&digits[e + 1..]);
            } else {
                out.push_str(&digits);
                out.push_str(&"0".repeat(e + 1 - digits.len()));
                out.push_str(".0");
            }
        } else {
            out.push_str("0.");
            out.push_str(&"0".repeat((-exp - 1) as usize));
            out.push_str(&digits);
        }
    } else {
        out.push_str(&digits[..1]);
        if digits.len() > 1 {
            out.push('.');
            out.push_str(&digits[1..]);
        }
        out.push('e');
        out.push(if exp < 0 { '-' } else { '+' });
        out.push_str(&format!("{:02}", exp.abs()));
    }
    out
}

fn number_str(n: &Number) -> String {
    if let Some(i) = n.as_i64() {
        return i.to_string();
    }
    if let Some(u) = n.as_u64() {
        return u.to_string();
    }
    float_repr(n.as_f64().unwrap_or(0.0))
}

/// Python `str()` for the JSON value kinds that appear in content.
pub fn py_str(v: &Value) -> String {
    match v {
        Value::Null => "None".to_string(),
        Value::Bool(b) => if *b { "True" } else { "False" }.to_string(),
        Value::Number(n) => number_str(n),
        Value::String(s) => s.clone(),
        Value::Array(a) => {
            let parts: Vec<String> = a
                .iter()
                .map(|x| match x {
                    Value::String(s) => format!("'{s}'"),
                    _ => py_str(x),
                })
                .collect();
            format!("[{}]", parts.join(", "))
        }
        Value::Object(o) => {
            let parts: Vec<String> = o
                .iter()
                .map(|(k, x)| {
                    let value = match x {
                        Value::String(s) => format!("'{s}'"),
                        _ => py_str(x),
                    };
                    format!("'{k}': {value}")
                })
                .collect();
            format!("{{{}}}", parts.join(", "))
        }
    }
}
