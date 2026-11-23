export interface Unit {
  en: string;
  short: string;
  decimals: number;
}

export interface Series {
  id: string;
  label_en: string;
  label_zh: string;
  values: number[];
}

export interface Dataset {
  id: string;
  title_en: string;
  title_zh: string;
  unit: Unit;
  x_label_en: string;
  x_label_zh: string;
  categories: string[];
  series: Series[];
  note_zh?: string;
}

export interface ChartConfig {
  layout: 'grouped' | 'stacked' | 'percent';
  focus_series: string;
  compare_series: string;
  y_label_en?: string;
  y_label_zh?: string;
}

export interface Preset {
  id: string;
  label_zh: string;
  op: 'add' | 'floor';
  category?: string;
  delta?: number;
  floor?: number;
}

export interface PlaygroundConfig {
  kind: 'category_values';
  editable_series: string;
  min: number;
  max: number;
  step: number;
  presets: Preset[];
}

export interface LessonFile {
  id: string;
  dataset: string;
  form: string;
  chart: ChartConfig;
  playground: PlaygroundConfig;
  intro_en: string;
  intro_zh: string;
  phrase_family: string;
}

export interface CatalogLesson {
  id: string;
  group: string;
  order: number;
  title_en: string;
  title_zh: string;
  question_en: string;
  question_zh: string;
  form: string;
  dataset: string;
  phrases: string;
}

export interface CatalogGroup {
  id: string;
  order: number;
  title_en: string;
  title_zh: string;
  summary_en: string;
  summary_zh: string;
  lessons: string[];
}

export interface Catalog {
  version: number;
  featured: string;
  groups: CatalogGroup[];
  lessons: CatalogLesson[];
}

export interface FormDef {
  component: string;
  family: string;
  layout: string;
  controls: string[];
}

export interface Expression {
  id: string;
  word: string;
  meaning_zh: string;
  function: string;
  register: 'spoken' | 'neutral' | 'written';
  intensity: 'slight' | 'steady' | 'sharp' | 'neutral';
  conditions: Record<string, number>;
  example_frame: string;
  collocations: string[];
  caution_zh: string;
}

export interface PhraseFile {
  family: string;
  expressions: Expression[];
}

export interface ContentBundle {
  version: number;
  catalog: Catalog;
  forms: Record<string, FormDef>;
  datasets: Record<string, Dataset>;
  lessons: Record<string, LessonFile>;
  phrases: Record<string, PhraseFile>;
}

export interface ExpressionView extends Expression {
  example: string;
  category?: string;
}

export interface QuestionView {
  id: string;
  prompt_en: string;
  answer_en: string;
  category?: string;
}

export interface SentenceSegment {
  text: string;
  added: boolean;
}

export interface SentenceLevel {
  level: number;
  label: string;
  segments: SentenceSegment[];
  note_zh: string;
}
