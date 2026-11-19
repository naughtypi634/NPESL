import { Chart, ThemeProvider, registerMap } from 'ztd-charts';
import type { ChartSpec, ChartTheme } from 'ztd-charts';
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

function ThemedChart({ spec, height, className }: { spec: ChartSpec; height?: number; className?: string }) {
  const theme = useTheme();
  const base = theme === 'light' ? 'light' : 'dark';
  return (
    <ThemeProvider base={base} theme={theme === 'glass' ? glass : undefined} locale="en-US">
      <Chart spec={spec} height={height} animate={false} className={className} />
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
}: {
  spec: ChartSpec;
  dataset: DatasetMeta;
  height?: number;
}) {
  return (
    <figure className="figure">
      <div className="figure-canvas">
        <ThemedChart spec={spec} height={height} />
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
    </figure>
  );
}

export function ChartFigure({
  lesson,
  spec,
  height,
}: {
  lesson: ChartLesson;
  spec?: ChartSpec;
  height?: number;
}) {
  return <SpecFigure spec={spec ?? lesson.spec} dataset={lesson.dataset} height={height} />;
}
