import { Chart, ThemeProvider, registerMap } from 'ztd-charts';
import type { ChartSpec, ChartTheme } from 'ztd-charts';
import { world } from 'ztd-charts/geo/world';
import { usStates } from 'ztd-charts/geo/us-states';

import type { ChartLesson, DatasetMeta } from '../types';
import { useTheme } from '../use-theme';

registerMap(world);
registerMap(usStates);

// 墨绿玻璃主题下，图表强调色跟着站点的薄荷青绿走。
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

export function SpecFigure({ spec, dataset }: { spec: ChartSpec; dataset: DatasetMeta }) {
  const theme = useTheme();
  const base = theme === 'light' ? 'light' : 'dark';
  return (
    <figure className="figure">
      <div className="figure-canvas">
        <ThemeProvider base={base} theme={theme === 'glass' ? glass : undefined} locale="en-US">
          <Chart spec={spec} />
        </ThemeProvider>
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

export function ChartFigure({ lesson }: { lesson: ChartLesson }) {
  return <SpecFigure spec={lesson.spec} dataset={lesson.dataset} />;
}
