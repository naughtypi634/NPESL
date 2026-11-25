import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Chart, ThemeProvider, registerMap } from 'ztd-charts';
import type { ChartEvent, ChartSpec, ChartTheme } from 'ztd-charts';
import { world } from 'ztd-charts/geo/world';
import { usStates } from 'ztd-charts/geo/us-states';

import type { ChartLesson, DatasetMeta } from '../types';
import { useTheme } from '../use-theme';

registerMap(world);
registerMap(usStates);

// Keep the chart palette aligned with the site's three themes.
const glass: Partial<ChartTheme> = {
  name: 'glass',
  bg: '#0e1418',
  panel: '#162025',
  ink: '#eef3f4',
  muted: '#a3b0b6',
  accent: '#5cc8b6',
  accentText: '#8bdccd',
  onAccent: '#08211c',
  line: 'rgba(238, 243, 244, 0.14)',
  line2: 'rgba(238, 243, 244, 0.08)',
};

type PointHandler = (event: ChartEvent<Record<string, unknown>>, point: { x: number; y: number }) => void;

function ThemedChart({
  spec,
  height,
  className,
  onClick,
  onHover,
}: {
  spec: ChartSpec;
  height?: number;
  className?: string;
  onClick?: (event: ChartEvent<Record<string, unknown>>) => void;
  onHover?: (event: ChartEvent<Record<string, unknown>> | null) => void;
}) {
  const theme = useTheme();
  const base = theme === 'light' ? 'light' : 'dark';
  return (
    <ThemeProvider base={base} theme={theme === 'glass' ? glass : undefined} locale="en-US">
      <Chart
        spec={spec}
        height={height}
        animate={false}
        className={className}
        onClick={onClick}
        onHover={onHover}
      />
    </ThemeProvider>
  );
}

export function ChartPreview({
  spec,
  height = 124,
}: {
  spec: ChartSpec;
  height?: number;
}) {
  return (
    <div className="chart-thumb">
      <ThemedChart spec={spec} height={height} className="chart-thumb-render" />
    </div>
  );
}

export function SpecFigure({
  spec,
  dataset,
  height,
  onPointClick,
  editor,
}: {
  spec: ChartSpec;
  dataset: DatasetMeta;
  height?: number;
  onPointClick?: PointHandler;
  editor?: ReactNode;
}) {
  const figureRef = useRef<HTMLElement>(null);
  const point = useRef({ x: 160, y: 150 });
  const hovered = useRef<ChartEvent<Record<string, unknown>> | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    hovered.current = null;
  }, [spec]);

  const rememberPoint = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = figureRef.current?.getBoundingClientRect();
    if (!rect) return;
    point.current = {
      x: Math.min(Math.max(event.clientX - rect.left, 130), Math.max(130, rect.width - 130)),
      y: Math.max(event.clientY - rect.top, 150),
    };
  };

  const openPoint = (event: ChartEvent<Record<string, unknown>>) => {
    if (handled.current) return;
    handled.current = true;
    queueMicrotask(() => { handled.current = false; });
    onPointClick?.(event, point.current);
  };

  const openHoveredPoint = () => {
    if (hovered.current) openPoint(hovered.current);
  };

  return (
    <figure className={`figure${editor ? ' is-point-editing' : ''}`} ref={figureRef}>
      <div
        className="figure-canvas"
        onPointerDownCapture={() => { handled.current = false; }}
        onClickCapture={rememberPoint}
        onClick={openHoveredPoint}
      >
        <ThemedChart
          spec={spec}
          height={height}
          onClick={onPointClick ? openPoint : undefined}
          onHover={(event) => { if (event) hovered.current = event; }}
        />
      </div>
      <figcaption className="figure-caption">
        <div className="figure-title">
          <span>{dataset.title_en}</span>
          <span className="figure-title-zh">{dataset.title_zh}</span>
        </div>
        <p className="figure-meta">
          {dataset.unit_en}
          <span className="dot">·</span>
          {dataset.note_zh}
        </p>
        <span className="sample-tag">Demo data · 模拟数据</span>
      </figcaption>
      {editor}
    </figure>
  );
}

export function ChartFigure({
  lesson,
  spec,
  height,
  onPointClick,
  editor,
}: {
  lesson: ChartLesson;
  spec?: ChartSpec;
  height?: number;
  onPointClick?: PointHandler;
  editor?: ReactNode;
}) {
  return (
    <SpecFigure
      spec={spec ?? lesson.spec}
      dataset={lesson.dataset}
      height={height}
      onPointClick={onPointClick}
      editor={editor}
    />
  );
}
