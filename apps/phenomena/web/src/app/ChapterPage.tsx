import { Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/ui/segmented-control';
import { Toggle } from '@/components/ui/toggle';

import type { Lesson, Span, Voice } from '../data/types';
import { CuePlayer } from '../lib/audio';
import {
  DEFAULT_SPEED,
  formatSpeed,
  snapSpeed,
  SPEEDS,
  type Speed,
} from '../lib/speed';
import { Segments } from './Segments';
import { ThemeToggle } from './ThemeToggle';

const KEY_VOICE = 'rs-voice';
const KEY_SPEED = 'rs-speed';
const KEY_ZH = 'rs-zh';

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 存不下不影响当前页面 */
  }
}

function initialVoice(): Voice {
  return load(KEY_VOICE) === 'm' ? 'm' : 'f';
}

function initialSpeed(): Speed {
  return snapSpeed(Number.parseFloat(load(KEY_SPEED) ?? ''));
}

function initialZh(): 'on' | 'off' {
  return load(KEY_ZH) === 'off' ? 'off' : 'on';
}

/**
 * 一句台词在某条 sprite 里的起止时间。
 *
 * 这四个属性是迁移的验收标准之一：tests/verify_runtime.mjs 的 phenomena 用例
 * 直接读 data-start-f 判断点读有没有跳到正确的位置。别改名。
 */
function spanAttrs(span: Span) {
  return {
    'data-start-f': span.f ? span.f[0].toFixed(3) : undefined,
    'data-end-f': span.f ? span.f[1].toFixed(3) : undefined,
    'data-start-m': span.m ? span.m[0].toFixed(3) : undefined,
    'data-end-m': span.m ? span.m[1].toFixed(3) : undefined,
  };
}

/** 语速三档的图标：一格 / 回转箭头 / 三格。三个带音频的应用用同一套。 */
function SpeedIcon({ step }: { step: 0 | 1 | 2 }) {
  if (step === 1) {
    return (
      <svg className="speed-ico" viewBox="0 0 24 24" aria-hidden="true">
        <path className="stroke" d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3" />
        <path className="stroke" d="M3.5 4.5v5h5" />
      </svg>
    );
  }
  const bars: [number, number, number, number][] =
    step === 0
      ? [[4.5, 4, 3, 8]]
      : [[1, 7, 3, 5], [4.5, 4, 3, 8], [8, 1, 3, 11]];
  return (
    <svg className="speed-ico" viewBox="0 0 12 12" aria-hidden="true">
      {bars.map(([x, y, w, h]) => (
        <rect key={x} x={x} y={y} width={w} height={h} rx={1} />
      ))}
    </svg>
  );
}

export function ChapterPage({ lesson }: { lesson: Lesson }) {
  const [voice, setVoice] = useState<Voice>(initialVoice);
  const [speed, setSpeed] = useState<Speed>(initialSpeed);
  const [zh, setZh] = useState<'on' | 'off'>(initialZh);
  const [playing, setPlaying] = useState<string | null>(null);
  const [queueOn, setQueueOn] = useState(false);
  const [status, setStatus] = useState<{ text: string; sticky: boolean } | null>(null);

  // 播放器回调里读 ref，避免拿到旧闭包里的状态。
  const voiceRef = useRef(voice);
  const playingRef = useRef<string | null>(null);
  const currentRef = useRef<{ id: string; span: Span } | null>(null);
  const queueRef = useRef<number | null>(null);
  const playerRef = useRef<CuePlayer | null>(null);
  const statusTimer = useRef(0);
  const linesRef = useRef(lesson.lines);
  linesRef.current = lesson.lines;

  const showStatus = useCallback((text: string, sticky: boolean) => {
    window.clearTimeout(statusTimer.current);
    if (!text) {
      setStatus(null);
      return;
    }
    setStatus({ text, sticky });
    if (!sticky) {
      statusTimer.current = window.setTimeout(() => setStatus(null), 4000);
    }
  }, []);

  const clearPlaying = useCallback(() => {
    queueRef.current = null;
    playingRef.current = null;
    currentRef.current = null;
    setQueueOn(false);
    setPlaying(null);
  }, []);

  const stopAll = useCallback(() => {
    clearPlaying();
    playerRef.current?.stop();
  }, [clearPlaying]);

  const scrollToLine = useCallback((index: number) => {
    const el = document.querySelector<HTMLElement>(`[data-line="${index}"]`);
    const box = el?.getBoundingClientRect();
    if (box && (box.top < 80 || box.bottom > window.innerHeight - 32)) {
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, []);

  /** 按 id 播一句；id 就是页面上高亮的位置。 */
  const startCue = useCallback(
    (id: string, span: Span) => {
      currentRef.current = { id, span };
      playingRef.current = id;
      setPlaying(id);
      playerRef.current?.play(voiceRef.current, span);
    },
    [],
  );

  const getPlayer = useCallback((): CuePlayer => {
    if (!playerRef.current) {
      const player = new CuePlayer(
        (v) => (lesson.sprites[v] ? `audio/${lesson.sprites[v]}` : null),
        {
          onFinish: () => {
            const at = queueRef.current;
            if (at === null) {
              playingRef.current = null;
              currentRef.current = null;
              setPlaying(null);
              return;
            }
            const lines = linesRef.current;
            const next = at + 1;
            if (next >= lines.length) {
              clearPlaying();
              return;
            }
            queueRef.current = next;
            startCue(`line:${next}`, lines[next].span);
            scrollToLine(next);
          },
          onMissing: () => {
            showStatus('这一句暂无语音', false);
            stopAll();
          },
          onFail: () => {
            showStatus('语音加载失败，请重试', false);
            stopAll();
          },
          onStatus: (text, sticky) => showStatus(text, sticky),
        },
      );
      playerRef.current = player;
      player.setRate(speed);
    }
    return playerRef.current;
    // speed 只在建播放器时用一次，之后由 changeSpeed 推
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, clearPlaying, scrollToLine, showStatus, startCue, stopAll]);

  /** 点句子：同一句再点一次是停，不是重播。 */
  const playLine = useCallback(
    (index: number) => {
      const line = linesRef.current[index];
      if (!line) return;
      const id = `line:${index}`;
      if (playingRef.current === id) {
        stopAll();
        return;
      }
      // 手点任何一句都退出连播。
      queueRef.current = null;
      setQueueOn(false);
      startCue(id, line.span);
    },
    [startCue, stopAll],
  );

  const playTarget = useCallback(
    (index: number, span: Span) => {
      const id = `target:${index}`;
      if (playingRef.current === id) {
        stopAll();
        return;
      }
      queueRef.current = null;
      setQueueOn(false);
      startCue(id, span);
    },
    [startCue, stopAll],
  );

  useEffect(() => {
    const player = getPlayer();
    const timer = window.setTimeout(() => player.prefetch(voiceRef.current), 1200);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(statusTimer.current);
      player.stop();
    };
  }, [getPlayer]);

  // 切到后台就停：连播不该在看不见的标签页里继续出声。
  useEffect(() => {
    const onHide = (): void => {
      if (!document.hidden) return;
      stopAll();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [stopAll]);

  function chooseVoice(next: Voice): void {
    if (next === voiceRef.current) return;
    voiceRef.current = next;
    setVoice(next);
    store(KEY_VOICE, next);
    // 正在播的那一句用新音色重放；连播继续往下走。
    const current = currentRef.current;
    if (current) playerRef.current?.play(next, current.span);
    getPlayer().prefetch(next);
  }

  function changeSpeed(value: Speed): void {
    setSpeed(value);
    store(KEY_SPEED, String(value));
    getPlayer().setRate(value);
  }

  function toggleZh(): void {
    const next = zh === 'on' ? 'off' : 'on';
    setZh(next);
    store(KEY_ZH, next);
  }

  function togglePlayAll(): void {
    if (queueRef.current !== null) {
      stopAll();
      return;
    }
    if (!linesRef.current.length) return;
    queueRef.current = 0;
    setQueueOn(true);
    startCue('line:0', linesRef.current[0].span);
    scrollToLine(0);
  }

  return (
    <div data-zh={zh}>
      <header className="ch-head">
        <p className="cat">{lesson.category}</p>
        <h1>{lesson.title_en}</h1>
        <p className="zh-title">{lesson.title_zh}</p>
      </header>

      {lesson.targets.length > 0 && (
        <section className="targets">
          {lesson.targets.map((target, index) => (
            <div className="target" key={`${target.written}-${target.spoken}`}>
              <span className="pair">
                <span className="w">{target.written}</span>
                <span className="arrow">→</span>
                <span className="s">{target.spoken}</span>
              </span>
              {target.seg && target.span && (
                <button
                  type="button"
                  className="pill"
                  data-kind="demo"
                  {...spanAttrs(target.span)}
                  onClick={() => playTarget(index, target.span as Span)}
                >
                  <span className="play">
                    <Play aria-hidden="true" size={11} />
                  </span>
                  <Segments seg={target.seg} />
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <div className="toolbar">
        <SegmentedControl aria-label="音色">
          {(['f', 'm'] as const).map((value) => (
            <SegmentedControlItem
              key={value}
              data-voice={value}
              data-checked={voice === value ? '' : undefined}
              aria-pressed={voice === value ? 'true' : 'false'}
              onClick={() => chooseVoice(value)}
            >
              {value === 'f' ? '女声' : '男声'}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>

        <div className="speed" role="group" aria-label="语速">
          {SPEEDS.map((value, step) => {
            const label =
              value < DEFAULT_SPEED ? '慢速' : value > DEFAULT_SPEED ? '快速' : '恢复';
            return (
              <Button
                key={value}
                size="sm"
                variant={speed === value ? 'default' : 'outline'}
                data-speed-set={value}
                data-speed-label={formatSpeed(value)}
                aria-pressed={speed === value ? 'true' : 'false'}
                onClick={() => changeSpeed(value)}
              >
                <SpeedIcon step={step as 0 | 1 | 2} />
                {label}
              </Button>
            );
          })}
        </div>

        <Toggle
          variant="outline"
          data-zh-toggle=""
          pressed={zh === 'on'}
          onPressedChange={toggleZh}
        >
          中文
        </Toggle>

        <Button
          variant={queueOn ? 'default' : 'outline'}
          data-play-all=""
          aria-pressed={queueOn ? 'true' : 'false'}
          onClick={togglePlayAll}
        >
          <span data-play-label>{queueOn ? '停止' : '连播'}</span>
        </Button>
      </div>

      <section className="dialogue">
        {lesson.lines.map((line, index) => (
          <button
            type="button"
            className={`line${playing === `line:${index}` ? ' playing' : ''}`}
            key={index}
            data-kind="line"
            data-index={index}
            data-line={index}
            {...spanAttrs(line.span)}
            onClick={() => playLine(index)}
          >
            <span className="txt">
              <Segments seg={line.seg} />
            </span>
            <span className="zh">{line.zh}</span>
          </button>
        ))}
      </section>

      <p className={`status${status ? ' show' : ''}`} data-audio-status>
        {status?.text ?? ''}
      </p>

      <ThemeToggle />
    </div>
  );
}
