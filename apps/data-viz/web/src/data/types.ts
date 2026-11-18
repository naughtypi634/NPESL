import type { EngineFeature, EngineLibrary } from '../engine';

export type Section = 'gallery' | 'play' | 'lab' | 'data';
export type Register = 'general' | 'ielts' | 'business';
export type Level = 'a2' | 'b1' | 'b2';
export type Tab = 'observe' | 'words' | 'patterns' | 'describe' | 'table' | 'edit';
export type Domain = 'business' | 'technology' | 'lifestyle' | 'economy' | 'education';

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
  periods?: { label_en?: string }[];
  entities?: (Category & { values: number[] })[];
  steps?: (Category & { value: number })[];
  start_value?: number;
  start?: { name_en?: string };
  end?: { name_en?: string };
  mode?: string;
  period_label?: string;
  [key: string]: unknown;
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
  overview_zh?: string;
  descriptions?: {
    general?: Record<Level, string>;
    ielts?: string;
    business?: string;
  };
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

export interface TopicCard {
  id: string;
  order: number;
  domain?: Domain;
  title_en: string;
  title_zh: string;
  blurb_zh: string;
  types: string[];
  default_view: string;
  primary: {
    type: string;
    subject: string;
    unit: Unit;
    data: ViewData;
  };
}

export interface ViewType {
  id: string;
  label_en: string;
  label_zh: string;
  order: number;
}

export interface Gallery {
  version: number;
  types: ViewType[];
  topics: TopicCard[];
  bundles: {
    lang: Record<string, string>;
    topics: Record<string, string>;
  };
}

export type Library = EngineLibrary;

export interface ChartOptions {
  smooth: boolean;
  labels: boolean;
  sort: 'none' | 'asc' | 'desc';
  percent: boolean;
}

export interface Route {
  section: Section;
  slug?: string;
  view?: string;
  mark?: string;
  tab?: Tab;
  family?: string;
  sample?: string;
  domain?: string;
}

export const TABS: { id: Tab; label: string }[] = [
  { id: 'observe', label: '观察' },
  { id: 'words', label: '词汇' },
  { id: 'patterns', label: '句型' },
  { id: 'describe', label: '整图描述' },
  { id: 'table', label: '数据表' },
  { id: 'edit', label: '编辑数据' },
];

export const DOMAINS: { id: Domain; label_en: string; label_zh: string }[] = [
  { id: 'business', label_en: 'Business', label_zh: '商务' },
  { id: 'technology', label_en: 'Technology', label_zh: '科技' },
  { id: 'lifestyle', label_en: 'Lifestyle', label_zh: '生活' },
  { id: 'economy', label_en: 'Economy', label_zh: '经济' },
  { id: 'education', label_en: 'Education', label_zh: '教育' },
];
