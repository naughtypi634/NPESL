import { useMemo } from 'react';
import type { Annotation, ChartTheme } from 'ztd-charts';
import { BarChart, darkTheme, lightTheme } from 'ztd-charts';

import type { Dataset } from '../data/content-types';
import type { CategoryValueFacts } from '../engine/facts';
import { formatValue } from '../engine/format';
import { useElementSize } from '../lib/use-viewport';
import { useTheme } from '../lib/theme';
import { ChartDragLayer } from './ChartDragLayer';

const FONT = 'Geist, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

const lightBrand: ChartTheme = {
  ...lightTheme,
  fontFamily: FONT,
  monoFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  accent: '#0b6b5e',
  accentText: '#0b6b5e',
  onAccent: '#ffffff',
  accent2: '#b7791f',
  accent3: '#b23a48',
  neutral: '#7c8794',
  neutralStrong: '#5d6570',
  neutralSoft: '#eef1f4',
};



const darkBrand: ChartTheme = {
  ...darkTheme,
  fontFamily: FONT,
  monoFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  accent: '#5cc8b6',
  accentText: '#5cc8b6',
  onAccent: '#08211c',
  accent2: '#e3b74e',
  accent3: '#ec7b82',
  neutral: '#6b7780',
  neutralStrong: '#8a969c',
  neutralSoft: '#2b3238',
};

const glassBrand: ChartTheme = {
  ...darkBrand,
  bg: '#0e1418',
  panel: '#162025',
  ink: '#eef3f4',
  muted: '#a3b0b6',
  dim: '#5f737a',
  line: '#2a3a40',
  line2: '#223137',
  neutral: '#3a4a50',
  neutralStrong: '#5f737a',
  neutralSoft: '#223137',
};

function themeFor(siteTheme: string): ChartTheme {
  if (siteTheme === 'light') return lightBrand;
  if (siteTheme === 'glass') return glassBrand;
  return darkBrand;
}

interface ChartStageProps {
  dataset: Dataset;
  facts: CategoryValueFacts;
  seriesValues: Record<string, number[]>;
  height: number;
  pinned: boolean;
  selectedCategory: string | null;
  onSelectCategory: (category: string) => void;
  onSeriesValuesChange: (seriesId: string, values: number[]) => void;
  onActiveSeriesChange: (seriesId: string) => void;
}

export function ChartStage({
  dataset,
  facts,
  seriesValues,
  height,
  pinned,
  selectedCategory,
  onSelectCategory,
  onSeriesValuesChange,
  onActiveSeriesChange,
}: ChartStageProps) {
  const siteTheme = useTheme();
  const chartTheme = useMemo(() => themeFor(siteTheme), [siteTheme]);
  const [chartHost, chartHostSize] = useElementSize<HTMLDivElement>();
  const chartHeight = pinned ? chartHostSize.height : height;
  const dragSeries = useMemo(
    () =>
      dataset.series.map((series) => ({
        id: series.id,
        label: series.label_en,
        color: series.id === facts.focus.id ? chartTheme.accent : chartTheme.neutral,
      })),
    [dataset.series, facts.focus.id, chartTheme],
  );

  const annotations = useMemo<Annotation[]>(() => {
    if (!selectedCategory) return [];
    return [{ type: 'event', x: selectedCategory, label: 'Focus' }];
  }, [selectedCategory]);

  return (
    <div className="card dv-stage" id="chart-stage">
      <div className="dv-stage-head">
        <p className="dv-takeaway" aria-live="polite" aria-atomic="true">
          {facts.takeaway}
        </p>
        <div className="dv-legend" aria-label="Series">
          <span className="dv-legend-item">
            <span className="dv-swatch dv-swatch-neutral" />
            {facts.compare.label_en}
          </span>
          <span className="dv-legend-item">
            <span className="dv-swatch dv-swatch-accent" />
            {facts.focus.label_en}
          </span>
        </div>
      </div>

      <div className="dv-chart-hold" ref={chartHost}>
        {pinned && chartHeight < 160 ? (
          <div className="dv-chart-skeleton" aria-hidden="true" />
        ) : (
        <BarChart
          data={facts.rows}
          x="team"
          y="value"
          series="period"
          layout="grouped"
          height={Math.max(160, chartHeight)}
          yDomain={[0, 100]}
          highlight={dataset.series.find((series) => series.id === facts.focus.id)?.label_en}
          unit={dataset.unit.short}
          showLabels
          animate={false}
          theme={chartTheme}
          annotations={annotations}
          onClick={(event) => onSelectCategory(event.label)}
          ariaLabel={`Grouped bar chart: ${dataset.title_en}`}
          description={`Remote work by team in ${facts.focus.label_en}. Highest: ${facts.top.category}, ${formatValue(facts.top.value, dataset.unit)}. Lowest: ${facts.bottom.category}, ${formatValue(facts.bottom.value, dataset.unit)}.`}
          className="dv-chart"
        />
        )}
        <ChartDragLayer
          hostRef={chartHost}
          series={dragSeries}
          valuesBySeries={seriesValues}
          categories={dataset.categories}
          unit={dataset.unit.short}
          min={0}
          max={100}
          revision={`${Object.entries(seriesValues)
            .map(([id, values]) => `${id}:${values.join(',')}`)
            .join('|')}-${siteTheme}-${selectedCategory ?? ''}-${chartHeight}`}
          onValueChange={(seriesId, index, value) => {
            const current = seriesValues[seriesId] ?? [];
            const next = current.slice();
            next[index] = value;
            onActiveSeriesChange(seriesId);
            onSeriesValuesChange(seriesId, next);
          }}
        />
      </div>

      <div className="dv-stage-foot">
        <span>
          {dataset.x_label_en}: {dataset.unit.en}
        </span>
        <span className="dv-demo">Demo data · 模拟数据</span>
      </div>
    </div>
  );
}
