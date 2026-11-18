export interface EngineFeature {
  kind: string;
  marks: string[];
  slots: Record<string, string>;
  auto?: boolean;
  id?: string;
  examples?: { en: string; zh: string }[];
  note_zh?: string;
  interpret_zh?: string;
}

export interface EngineWord {
  en: string;
  zh: string;
  register: 'spoken' | 'neutral' | 'written';
}

export interface EnginePattern {
  id: string;
  level: 'a2' | 'b1' | 'b2';
  frame: string;
  zh_frame?: string;
  note_zh?: string;
}

export interface EngineLibraryFeature {
  label_zh?: string;
  requires?: string[];
  words?: EngineWord[];
  patterns?: EnginePattern[];
  registers?: Record<string, string>;
  compare?: string[];
  traps?: { wrong_en: string; right_en: string; why_zh: string }[];
}

export interface EngineLibrary {
  type: string;
  features: Record<string, EngineLibraryFeature>;
  comparisons?: {
    id: string;
    a: string;
    b: string;
    meaning_zh: string;
    grammar_zh: string;
    collocations_zh: string;
    usage_zh: string;
    examples?: { en: string; zh: string }[];
  }[];
}

export const DV: {
  compute: {
    view(view: unknown): Record<string, EngineFeature>;
    classifyChange(a: number, b: number, unit: unknown): string;
    changeSlots(view: unknown, series: unknown, i: number, unit: unknown): Record<string, string>;
    label(view: unknown, index: number): string;
    fmtValue(value: number, unit: unknown): string;
    fmtAxis(value: number, unit: unknown): string;
    pctText(a: number, b: number): string;
    ppText(delta: number, unit: unknown): string;
    fmtDelta(delta: number, unit: unknown): string;
  };
  gen: {
    levels(view: unknown, features: unknown, library: unknown): { a2: string; b1: string; b2: string };
    describe(view: unknown, features: unknown, library: unknown, register?: string, level?: string): string;
    overviewZh(view: unknown, features: unknown, library: unknown): string;
    chinese(feature: unknown, library: unknown, level?: string): string;
    sentence(feature: unknown, library: unknown, register?: string, level?: string): string;
    slots(slots: Record<string, string>): Record<string, string>;
    pick(view: unknown, features: unknown): EngineFeature[];
  };
  featureIndex(features: unknown): Record<string, EngineFeature>;
  liveView(shipped: unknown, data: unknown): unknown;
  clone<T>(value: T): T;
  fill(template: string, slots: Record<string, string>): string;
  num(value: number, decimals?: number): string;
  fmtValue(value: number, unit: unknown): string;
};
