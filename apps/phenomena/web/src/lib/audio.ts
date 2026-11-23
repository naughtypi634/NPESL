import type { Span, Voice } from '../data/types';

/** 取包或播放失败时的回调集合。 */
export interface CueEvents {
  /** 播到句子末尾（自然结束）。 */
  onFinish: () => void;
  /** 这句没有语音。 */
  onMissing: () => void;
  /** 取包或播放失败。 */
  onFail: () => void;
  /** 等待提示；空字符串表示清掉。 */
  onStatus: (text: string, sticky: boolean) => void;
}

/** seek 判定容差：落进这块就算到位。 */
const SEEK_TOLERANCE = 0.01;
/** 停句的提前量，和旧页面一致。 */
const END_EPSILON = 0.008;
/** 拿不到整包时，最多等 40 次 × 250ms = 10 秒。 */
const SEEK_ATTEMPTS = 40;
const SEEK_INTERVAL = 250;

/**
 * 整章一条音频：跳到句子起点，等 seek 落地再播，播到终点就停。
 *
 * Cloudflare Pages 的静态资源不支持 Range 请求（Range 被忽略，永远 200 整包）。
 * 媒体元素在没有 Range 时连 seekable 都只有 [0,0]，点后面的句子会被夹回开头。
 * 所以先把整条 sprite 取进内存换成 blob 地址；离线包走 file:// 时 fetch 不可用，
 * 退回直接给媒体元素，并等目标位置变成可跳的再 seek。
 */
export class CuePlayer {
  private el: HTMLAudioElement;
  private cache = new Map<Voice, Promise<string | null>>();
  private assigned: string | null = null;
  private token = 0;
  private stopAt = 0;
  private raf = 0;
  private rate = 0.9;

  constructor(
    private urlFor: (voice: Voice) => string | null,
    private events: CueEvents,
  ) {
    const el = new Audio();
    el.preload = 'auto';
    // 放慢时保持音高，不然 0.6× 听起来像磁带拖速。
    el.preservesPitch = true;
    (el as HTMLAudioElement & { webkitPreservesPitch?: boolean })
      .webkitPreservesPitch = true;
    el.addEventListener('timeupdate', () => {
      if (this.stopAt && el.currentTime >= this.stopAt - END_EPSILON) this.finish();
    });
    el.addEventListener('ended', () => this.finish());
    el.addEventListener('error', () => {
      if (this.stopAt) {
        this.stopAt = 0;
        this.events.onFail();
      }
    });
    el.addEventListener('loadedmetadata', () => {
      // 换源会重置 playbackRate，这里补回来。
      try {
        el.playbackRate = this.rate;
      } catch {
        /* 老浏览器忽略 */
      }
    });
    this.el = el;
  }

  setRate(rate: number): void {
    this.rate = rate;
    try {
      this.el.playbackRate = rate;
    } catch {
      /* 忽略 */
    }
  }

  /** 空闲时先把当前音色的整条 sprite 取进内存，点下去就能出声。 */
  prefetch(voice: Voice): void {
    void this.sourceFor(voice);
  }

  play(voice: Voice, span: Span | undefined): void {
    this.stop();
    const range = span?.[voice];
    if (!range) {
      this.events.onMissing();
      return;
    }
    const token = this.token;
    void this.run(token, voice, range[0], range[1]);
  }

  stop(): void {
    this.token += 1;
    this.stopAt = 0;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    try {
      this.el.pause();
    } catch {
      /* 忽略 */
    }
  }

  private alive(token: number): boolean {
    return token === this.token;
  }

  private async run(
    token: number,
    voice: Voice,
    start: number,
    end: number,
  ): Promise<void> {
    const src = await this.sourceFor(voice);
    if (!this.alive(token)) return;
    if (!src) {
      this.events.onMissing();
      return;
    }
    if (this.assigned !== src) {
      this.el.src = src;
      this.assigned = src;
    }
    const ready = await this.waitSeekable(token, start);
    if (!ready || !this.alive(token)) return;
    try {
      this.el.currentTime = start;
    } catch {
      this.events.onFail();
      return;
    }
    this.stopAt = end;
    try {
      this.el.playbackRate = this.rate;
    } catch {
      /* 忽略 */
    }
    try {
      await this.el.play();
    } catch {
      if (this.alive(token)) {
        this.stopAt = 0;
        this.events.onFail();
      }
      return;
    }
    if (!this.alive(token)) return;
    this.events.onStatus('', false);
    this.watch(token);
  }

  /** rAF 在后台标签页会被节流，timeupdate 兜底，两边都调到 finish。 */
  private watch(token: number): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    const tick = (): void => {
      if (!this.alive(token)) {
        this.raf = 0;
        return;
      }
      if (this.el.currentTime >= this.stopAt - END_EPSILON) {
        this.finish();
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private finish(): void {
    // stop() 会把 stopAt 清零，所以重复回调只生效一次。
    if (!this.stopAt) return;
    this.stop();
    this.events.onFinish();
  }

  private seekableEnd(): number {
    const ranges = this.el.seekable;
    let end = 0;
    for (let i = 0; i < ranges.length; i += 1) {
      if (ranges.end(i) > end) end = ranges.end(i);
    }
    return end;
  }

  private waitSeekable(token: number, start: number): Promise<boolean> {
    return new Promise((resolve) => {
      let attempts = 0;
      const tick = (): void => {
        if (!this.alive(token)) {
          resolve(false);
          return;
        }
        if (this.seekableEnd() >= start - SEEK_TOLERANCE) {
          resolve(true);
          return;
        }
        attempts += 1;
        if (attempts > SEEK_ATTEMPTS) {
          resolve(false);
          return;
        }
        this.events.onStatus('语音加载中…', true);
        window.setTimeout(tick, SEEK_INTERVAL);
      };
      tick();
    });
  }

  private sourceFor(voice: Voice): Promise<string | null> {
    const hit = this.cache.get(voice);
    if (hit) return hit;
    const url = this.urlFor(voice);
    if (!url) {
      const none = Promise.resolve<string | null>(null);
      this.cache.set(voice, none);
      return none;
    }
    const canFetch =
      location.protocol !== 'file:' &&
      typeof fetch === 'function' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function';
    if (!canFetch) {
      const direct = Promise.resolve<string | null>(url);
      this.cache.set(voice, direct);
      return direct;
    }
    const loading = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => url);
    this.cache.set(voice, loading);
    return loading;
  }
}
