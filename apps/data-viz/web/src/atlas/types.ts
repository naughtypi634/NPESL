import type { ChartSpec } from 'ztd-charts';

export type Scene = 'academic' | 'business' | 'everyday';

export interface Entry {
  id: string;
  name_en: string;
  name_zh: string;
  desc_zh: string;
  href: string;
}

export interface SiteCopy {
  title_en: string;
  title_zh: string;
  tagline_en: string;
  tagline_zh: string;
  intro_zh: string;
  entries: Entry[];
  footer_note: string;
  site_back: string;
}

export interface Family {
  id: string;
  order: number;
  name_en: string;
  name_zh: string;
  intro_zh: string;
  intro_en: string;
}

export interface ChartSummary {
  id: string;
  family: string;
  level: 'basic' | 'intermediate' | 'advanced';
  name_en: string;
  name_zh: string;
  what_zh: string;
  focus: string[];
  preview: { light: string; dark: string } | null;
}

export interface GroupSummary {
  id: string;
  order: number;
  name_en: string;
  name_zh: string;
  intro_zh: string;
  intro_en: string;
}

export interface ContextSummary {
  id: string;
  order: number;
  name_en: string;
  name_zh: string;
  intro_zh: string;
  intro_en: string;
}

export interface AtlasIndex {
  version: number;
  site: SiteCopy;
  families: Family[];
  charts: ChartSummary[];
  expressions: GroupSummary[];
  contexts: ContextSummary[];
}

export interface ExpressionExample {
  en: string;
  zh: string;
  chart?: string;
}

export interface Expression {
  id: string;
  head: string;
  kind: string;
  meaning_zh: string;
  pattern: string;
  cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  register: 'neutral' | 'formal' | 'informal';
  scenes: Scene[];
  collocations: string[];
  examples: ExpressionExample[];
  contrast_zh: string;
  caution_zh?: string;
}

export interface ExpressionGroup extends GroupSummary {
  expressions: Expression[];
  charts: { chart: string; expressions: string[] }[];
}

export interface DatasetMeta {
  id: string;
  title_en: string;
  title_zh: string;
  unit_en: string;
  unit_short: string;
  decimals: number;
  note_zh: string;
}

export interface Observation {
  en: string;
  zh: string;
}

export interface DescribeItem {
  group: string;
  expression: string;
  en: string;
  zh: string;
  pattern: string;
  alternatives: string[];
  note_zh?: string;
}

export interface Version {
  en: string;
  zh: string;
}

export interface LanguageNote {
  title_en: string;
  body_zh: string;
  examples: string[];
}

export interface ChartLesson {
  id: string;
  name_en: string;
  name_zh: string;
  family: string;
  level: 'basic' | 'intermediate' | 'advanced';
  dataset: DatasetMeta;
  spec: ChartSpec;
  overview: {
    purpose_zh: string;
    works_zh: string[];
    uses_zh: string[];
  };
  understanding: {
    read_zh: string;
    elements: { name_en: string; name_zh: string; note_zh: string }[];
    look_for_zh: string[];
  };
  observations: Observation[];
  describe: DescribeItem[];
  descriptions: {
    academic: Version;
    business: Version;
    simple: Version;
  };
  language_notes: LanguageNote[];
  related: {
    charts: string[];
    groups: string[];
    contexts: string[];
  };
}

export interface Move {
  name_en: string;
  name_zh: string;
  examples: string[];
}

export interface ContextDetail extends ContextSummary {
  moves: Move[];
  focus_groups: string[];
  charts: string[];
  worked: {
    chart: string;
    dataset: DatasetMeta;
    spec: ChartSpec;
    en: string;
    zh: string;
  };
  pitfalls_zh: string[];
}
