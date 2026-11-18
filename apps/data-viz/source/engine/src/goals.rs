//! Learning goals for the Data Visualization Gallery.
//!
//! The five goals are the only place the homepage filter learns what a chart
//! can teach. The mapping lives here so the build, the validator and the
//! shipped `index.json` cannot drift apart.

use std::collections::BTreeSet;

pub struct GoalMeta {
    pub id: &'static str,
    pub label_zh: &'static str,
    pub label_en: &'static str,
}

pub static GOALS: [GoalMeta; 5] = [
    GoalMeta {
        id: "change",
        label_zh: "上升/下降",
        label_en: "Increase / decrease",
    },
    GoalMeta {
        id: "stable",
        label_zh: "持平",
        label_en: "Staying stable",
    },
    GoalMeta {
        id: "peak",
        label_zh: "峰值/低谷",
        label_en: "Peaks and lows",
    },
    GoalMeta {
        id: "fluctuate",
        label_zh: "波动",
        label_en: "Fluctuation",
    },
    GoalMeta {
        id: "compare",
        label_zh: "比较",
        label_en: "Comparison",
    },
];

/// Kinds that describe a single value rather than a change, an extreme or a
/// comparison. They stay clickable and get a generated sentence, but they do
/// not decide whether a chart appears under a learning goal.
pub static GENERIC_KINDS: [&str; 4] = ["point", "cell", "item", "pattern"];

pub fn is_generic(kind: &str) -> bool {
    GENERIC_KINDS.contains(&kind)
}

pub fn goal_of(kind: &str) -> Option<&'static str> {
    Some(match kind {
        // Change.
        "rise_sharp" | "rise_steady" | "rise_slight" | "fall_sharp" | "fall_steady"
        | "fall_slight" | "increase_contributor" | "decrease_contributor" | "rank_up"
        | "rank_down" | "overtake" | "turning_point" | "component_growth" | "share_shift"
        | "dominant_trend" | "largest_step" | "net_change" | "offset" => "change",

        // Staying stable.
        "flat" | "plateau" | "stable_rank" => "stable",

        // Peaks and lows.
        "peak" | "trough" | "peak_cell" | "low_cell" | "highest" | "lowest"
        | "largest_share" | "smallest_share" | "majority" | "minority" | "about_half"
        | "largest_component" => "peak",

        // Fluctuation.
        "fluctuate" => "fluctuate",

        // Comparison and contrast.
        "ranking" | "small_gap" | "large_gap" | "similar_values" | "compare_groups"
        | "compare_periods" | "compare_shares" | "combined_share" | "composition"
        | "main_path" | "secondary_path" | "drop_off" | "merge" | "split" | "gradient"
        | "concentration" | "cluster" | "outlier" | "positive_strong" | "positive_moderate"
        | "negative_strong" | "negative_moderate" | "weak_or_none" | "converge"
        | "diverge" => "compare",

        _ => return None,
    })
}

/// Goals in the fixed homepage order, de-duplicated from the kinds present.
pub fn ordered_goals<'a>(kinds: impl IntoIterator<Item = &'a str>) -> Vec<&'static str> {
    let present: BTreeSet<&'static str> = kinds.into_iter().filter_map(goal_of).collect();
    GOALS
        .iter()
        .map(|goal| goal.id)
        .filter(|id| present.contains(id))
        .collect()
}
