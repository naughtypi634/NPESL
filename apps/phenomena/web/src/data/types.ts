/** 音频与内容的数据形状 —— 由 apps/phenomena/source/build.py 产出。 */

export type Voice = 'f' | 'm';

/** 一句话在某条 sprite 里的起止秒数。两条音色各自一条 sprite。 */
export type Span = Partial<Record<Voice, readonly [number, number]>>;

/** `[文本, 读音或 0]`：读音是浮在文字上方的弱读提示。与小程序同一套结构。 */
export type Segment = readonly [string, string | 0];

export interface Target {
  written: string;
  spoken: string;
  /** 有示范句时才有：切好的段落。 */
  seg?: Segment[];
  span?: Span;
}

export interface Line {
  seg: Segment[];
  zh: string;
  span: Span;
}

export interface Lesson {
  num: number;
  slug: string;
  title_en: string;
  title_zh: string;
  category: string;
  sprites: Partial<Record<Voice, string>>;
  targets: Target[];
  lines: Line[];
}

export interface PhenomenaData {
  categories: string[];
  lessons: Lesson[];
}
