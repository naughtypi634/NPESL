import type { EngineFeature, EngineLibrary } from '../engine';

export type GoalId = 'change' | 'stable' | 'peak' | 'fluctuate' | 'compare';
export type LearnerLevel = 'basic' | 'advanced';
export type EngineLevel = 'a2' | 'b1' | 'b2';
export type Domain = 'business' | 'technology' | 'lifestyle' | 'economy' | 'education';

export const GOAL_IDS: GoalId[] = ['change', 'stable', 'peak', 'fluctuate', 'compare'];
export const VIEW_TYPE_IDS = [
  'line',
  'bar',
  'pie',
  'scatter',
  'stacked',
  'heatmap',
  'sankey',
  'slope',
  'waterfall',
] as const;

export interface Unit {
  en?: string;
  short?: string;
  decimals?: number;
  kind?: string;
  points?: boolean;
  scale?: number;
  million?: boolean;
}

export interface Series {
  id: string;
  name_en: string;
  name_zh?: string;
  slot?: number;
  values: number[];
}

export interface Axis {
  label_en?: string;
  label_zh?: string;
  values?: string[];
}

export interface Category {
  id: string;
  name_en: string;
  name_zh?: string;
}

export interface ViewData {
  x?: Axis;
  y?: Axis;
  series?: Series[];
  parts?: (Category & { value: number })[];
  points?: (Category & { x: number; y: number; group?: string })[];
  groups?: Category[];
  rows?: Category[];
  cols?: Category[];
  cells?: number[][];
  nodes?: (Category & { column?: number })[];
  links?: { source: string; target: string; value: number }[];
  columns?: string[][];
  periods?: { id?: string; label_en?: string }[];
  entities?: (Category & { values: number[] })[];
  steps?: (Category & { value: number })[];
  start_value?: number;
  start?: { name_en?: string };
  end?: { name_en?: string };
  mode?: string;
  period_label?: string;
  [key: string]: unknown;
}

export interface Descriptions {
  general?: { a2?: string; b1?: string; b2?: string };
  ielts?: string;
  business?: string;
}

export interface View {
  id: string;
  type: string;
  label_zh?: string;
  label_en?: string;
  subject?: string;
  subtitle_en?: string;
  unit?: Unit;
  data?: ViewData;
  features?: EngineFeature[];
  goals?: GoalId[];
  overview_zh?: string;
  descriptions?: Descriptions;
  [key: string]: unknown;
}

export interface Topic {
  id: string;
  order: number;
  domain?: Domain;
  title_en: string;
  title_zh: string;
  blurb_zh: string;
  scene_zh: string;
  views: View[];
}

export interface CardView {
  id: string;
  type: string;
  label_zh: string;
  label_en?: string;
  subject: string;
  unit: Unit;
  goals: GoalId[];
  data: ViewData;
}

export interface TopicCard {
  id: string;
  order: number;
  domain?: Domain;
  title_en: string;
  title_zh: string;
  blurb_zh: string;
  types: string[];
  default_view: string;
  goals: GoalId[];
  views: CardView[];
  primary?: {
    type: string;
    subject: string;
    unit: Unit;
    data: ViewData;
  };
}

export interface GoalMeta {
  id: GoalId;
  label_zh: string;
  label_en: string;
}

export interface ViewType {
  id: string;
  label_en: string;
  label_zh: string;
  order: number;
}

export interface Gallery {
  version: number;
  goals: GoalMeta[];
  kind_goals: Record<string, GoalId>;
  generic_kinds: string[];
  types: ViewType[];
  topics: TopicCard[];
  bundles: {
    lang: Record<string, string>;
    topics: Record<string, string>;
  };
}

export type Library = EngineLibrary;

export interface Route {
  section: 'home' | 'detail';
  slug?: string;
  view?: string;
  mark?: string;
  goal?: GoalId;
  domain?: Domain;
  type?: string;
}

export const DOMAINS: { id: Domain; label_en: string; label_zh: string }[] = [
  { id: 'business', label_en: 'Business', label_zh: '商务' },
  { id: 'technology', label_en: 'Technology', label_zh: '科技' },
  { id: 'lifestyle', label_en: 'Lifestyle', label_zh: '生活' },
  { id: 'economy', label_en: 'Economy', label_zh: '经济' },
  { id: 'education', label_en: 'Education', label_zh: '教育' },
];
