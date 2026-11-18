import { useEffect, useMemo, useRef } from 'react';

import type { ChartOptions, View } from '../data/types';
import { chartOption, echarts, readPalette } from '../lib/chart';
import { useTheme } from '../lib/theme';

interface ChartProps {
  view: View;
  selected?: string | null;
  onSelect?: (mark: string) => void;
  compact?: boolean;
  height?: number;
  smooth?: boolean;
  labels?: boolean;
  sort?: ChartOptions['sort'];
  percent?: boolean;
  className?: string;
  label?: string;
}

export function Chart({
  view,
  selected = null,
  onSelect,
  compact = false,
  height = 380,
  smooth = true,
  labels = true,
  sort = 'none',
  percent = false,
  className,
  label,
}: ChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const theme = useTheme();
  const palette = useMemo(() => readPalette(), [theme]);
  const option = useMemo(
    () => chartOption(view, palette, { selected, compact, smooth, labels, sort, percent }),
    [view, palette, selected, compact, smooth, labels, sort, percent],
  );

  useEffect(() => {
    if (!host.current) return;
    const instance = echarts.init(host.current, undefined, { renderer: 'canvas' });
    chart.current = instance;
    const resize = () => instance.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    instance.on('click', (params) => {
      const mark = (params.data as { mark?: string } | undefined)?.mark;
      if (mark && selectRef.current) selectRef.current(mark);
    });
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
    // onSelect is read through the ref-free closure; a changing handler is fine
    // because the effect only rebuilds when the host element changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: false });
  }, [option]);

  return (
    <div
      ref={host}
      className={className}
      style={{ height, width: '100%' }}
      role="img"
      aria-label={label || view.subject || view.label_en || 'chart'}
    />
  );
}
