//! Number formatting shared by the feature engine — mirrors the Python
//! helpers in the original `features.py` exactly.

use crate::json::{self, Obj};

pub const FLAT: f64 = 0.03;
pub const SLIGHT: f64 = 0.10;
pub const STEADY: f64 = 0.25;

pub const PP_FLAT: f64 = 0.5;
pub const PP_SLIGHT: f64 = 1.5;
pub const PP_STEADY: f64 = 3.0;

pub fn decimals_of(unit: &Obj) -> usize {
    let value = json::int_or(unit, "decimals", 0);
    value.max(0) as usize
}

/// Fixed-point text with thousands separators, before the zero trim.
pub fn fixed_comma(value: f64, decimals: usize) -> String {
    let raw = format!("{value:.decimals$}");
    let (sign, rest) = match raw.strip_prefix('-') {
        Some(rest) => ("-", rest),
        None => ("", raw.as_str()),
    };
    let (int_part, fraction) = match rest.find('.') {
        Some(i) => (&rest[..i], Some(&rest[i..])),
        None => (rest, None),
    };
    let mut grouped = String::new();
    let len = int_part.len();
    for (i, ch) in int_part.chars().enumerate() {
        if i > 0 && (len - i) % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(ch);
    }
    let mut out = String::new();
    out.push_str(sign);
    out.push_str(&grouped);
    if let Some(fraction) = fraction {
        out.push_str(fraction);
    }
    out
}

/// Python `f"{value:,.{decimals}f}"` with trailing zeros stripped.
pub fn fmt_num(value: f64, decimals: usize) -> String {
    let mut text = fixed_comma(value, decimals);
    if text.contains('.') {
        while text.ends_with('0') {
            text.pop();
        }
        if text.ends_with('.') {
            text.pop();
        }
    }
    if text == "-0" || text.is_empty() {
        return "0".to_string();
    }
    text
}

/// A value as it reads inside a sentence (scaled, with its noun).
pub fn fmt_value(value: f64, unit: &Obj) -> String {
    let scale = match unit.get("scale") {
        Some(v) => json::num(v),
        None => 1.0,
    };
    let scale = if scale == 0.0 { 1.0 } else { scale };
    let x = value * scale;
    let dec = decimals_of(unit);
    if unit.get("kind").and_then(|v| v.as_str()) == Some("percent") {
        return format!("{} percent", fmt_num(x, dec));
    }
    if json::truthy(unit.get("million")) && x.abs() >= 1_000_000.0 {
        let noun = json::text_or(unit, "en", "");
        return format!("{} million {}", fmt_num(x / 1_000_000.0, 1), noun)
            .trim()
            .to_string();
    }
    let noun = json::text_or(unit, "en", "");
    format!("{} {}", fmt_num(x, dec), noun).trim().to_string()
}

/// An absolute change, with points for percent-share data.
pub fn fmt_delta(delta: f64, unit: &Obj) -> String {
    if json::truthy(unit.get("points")) {
        return format!(
            "{} percentage points",
            fmt_num(delta.abs(), decimals_of(unit))
        );
    }
    fmt_value(delta.abs(), unit)
}

pub fn rel_pct(a: f64, b: f64) -> Option<f64> {
    if a == 0.0 {
        return None;
    }
    Some((b - a) / a.abs() * 100.0)
}

pub fn pct_text(a: f64, b: f64) -> String {
    match rel_pct(a, b) {
        None => String::new(),
        Some(value) => {
            if value.abs() < 10.0 {
                fmt_num(value.abs(), 1)
            } else {
                fmt_num(value.abs(), 0)
            }
        }
    }
}

pub fn pp_text(delta: f64, unit: &Obj) -> String {
    fmt_num(delta.abs(), decimals_of(unit))
}

pub fn classify_change(a: f64, b: f64, unit: &Obj) -> &'static str {
    let delta = b - a;
    if json::truthy(unit.get("points")) {
        let step = delta.abs();
        if step < PP_FLAT {
            return "flat";
        }
        if step < PP_SLIGHT {
            return if delta > 0.0 { "rise_slight" } else { "fall_slight" };
        }
        if step < PP_STEADY {
            return if delta > 0.0 { "rise_steady" } else { "fall_steady" };
        }
        return if delta > 0.0 { "rise_sharp" } else { "fall_sharp" };
    }
    match rel_pct(a, b) {
        None => "flat",
        Some(pct) => {
            if pct.abs() < FLAT * 100.0 {
                return "flat";
            }
            let step = pct.abs() / 100.0;
            if step < SLIGHT {
                if pct > 0.0 {
                    "rise_slight"
                } else {
                    "fall_slight"
                }
            } else if step < STEADY {
                if pct > 0.0 {
                    "rise_steady"
                } else {
                    "fall_steady"
                }
            } else if pct > 0.0 {
                "rise_sharp"
            } else {
                "fall_sharp"
            }
        }
    }
}

/// Python `round(x, digits)` — decimal rounding of the exact binary value.
pub fn py_round(x: f64, digits: usize) -> f64 {
    if !x.is_finite() {
        return x;
    }
    format!("{x:.digits$}").parse::<f64>().unwrap_or(x)
}

/// `f"{x:,.1f}".rstrip("0").rstrip(".")` — used for scatter point values.
pub fn one_decimal_trimmed(x: f64) -> String {
    let raw = fixed_comma(x, 1);
    raw.trim_end_matches('0').trim_end_matches('.').to_string()
}
