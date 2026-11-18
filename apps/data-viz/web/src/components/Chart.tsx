import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { EngineFeature } from '../engine';
import type { View, ViewData } from '../data/types';
import type { AxisLock } from '../lib/chart';
import { chartOption, echarts, readPalette } from '../lib/chart';
import {
  axisLockFor,
  hitTestTarget,
  hoverSegment,
  valueFromPointer,
} from '../lib/chart-interaction';
import type { EditTarget } from '../lib/edit';
import {
  clampTargetValue,
  markForTarget,
  writePieShare,
  writeTarget,
} from '../lib/edit';
import { useTheme } from '../lib/theme';
import { ChartTip } from './ChartTip';

interface ChartProps {
  view: View;
  data: ViewData;
  features: EngineFeature[];
  selectedMarks?: string[];
  onSelect?: (mark: string) => void;
  onEdit?: (next: ViewData) => void;
  editable?: boolean;
  compact?: boolean;
  height?: number;
  className?: string;
  label?: string;
  tooltipHtml?: (mark: string) => string | null;
}

interface DragState {
  target: EditTarget;
  pointerId: number;
  start: { x: number; y: number };
  moved: boolean;
}

function localPoint(host: HTMLDivElement, event: PointerEvent | MouseEvent): { x: number; y: number } {
  const rect = host.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export function Chart({
  view,
  data,
  features,
  selectedMarks = [],
  onSelect,
  onEdit,
  editable = false,
  compact = false,
  height = 380,
  className,
  label,
  tooltipHtml,
}: ChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.EChartsType | null>(null);
  const theme = useTheme();
  const palette = useMemo(() => readPalette(), [theme]);
  const [axisLock, setAxisLock] = useState<AxisLock | undefined>(undefined);
  const [segmentHover, setSegmentHover] = useState<{ mark: string; x: number; y: number } | null>(
    null,
  );
  const segmentHoverRef = useRef(segmentHover);
  segmentHoverRef.current = segmentHover;

  const viewWithData = useMemo<View>(() => ({ ...view, data }), [view, data]);
  const propsRef = useRef({ view: viewWithData, data, features, editable, onSelect, onEdit, tooltipHtml, compact });
  propsRef.current = { view: viewWithData, data, features, editable, onSelect, onEdit, tooltipHtml, compact };

  const dragRef = useRef<DragState | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<ViewData | null>(null);
  const suppressClickUntil = useRef(0);

  const flushEdit = useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const next = pendingRef.current;
    pendingRef.current = null;
    if (next) propsRef.current.onEdit?.(next);
  }, []);

  const queueEdit = useCallback(
    (next: ViewData) => {
      pendingRef.current = next;
      if (frameRef.current != null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const value = pendingRef.current;
        pendingRef.current = null;
        if (value) propsRef.current.onEdit?.(value);
      });
    },
    [],
  );

  const tooltip = useCallback((params: { data?: { mark?: string } }) => {
    const mark = params.data?.mark;
    if (!mark) return '';
    return propsRef.current.tooltipHtml?.(mark) ?? '';
  }, []);

  const option = useMemo(
    () =>
      chartOption(viewWithData, palette, {
        selectedMarks,
        compact,
        axisLock,
        tooltip,
      }),
    [viewWithData, palette, selectedMarks, compact, axisLock, tooltip],
  );

  useEffect(() => {
    if (!host.current) return;
    const hostElement = host.current;
    const instance = echarts.init(hostElement, undefined, { renderer: 'canvas' });
    chart.current = instance;
    (window as unknown as { __dvChart?: echarts.EChartsType }).__dvChart = instance;
    const resize = () => instance.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(hostElement);

    const onPointerDown = (event: PointerEvent) => {
      if (!propsRef.current.editable) return;
      const pointer = localPoint(hostElement, event);
      const target = hitTestTarget(propsRef.current.view, instance, pointer);
      if (!target) return;
      event.preventDefault();
      hostElement.setPointerCapture(event.pointerId);
      dragRef.current = {
        target,
        pointerId: event.pointerId,
        start: pointer,
        moved: false,
      };
      setAxisLock(axisLockFor(propsRef.current.view));
      propsRef.current.onSelect?.(markForTarget(propsRef.current.view, target));
    };

    const onPointerMove = (event: PointerEvent) => {
      const pointer = localPoint(hostElement, event);
      const drag = dragRef.current;
      if (drag) {
        if (!drag.moved && Math.hypot(pointer.x - drag.start.x, pointer.y - drag.start.y) < 3) {
          return;
        }
        drag.moved = true;
        const raw = valueFromPointer(propsRef.current.view, instance, drag.target, pointer);
        if (raw == null) return;
        const clamped = clampTargetValue(propsRef.current.view, drag.target, raw);
        const next =
          drag.target.kind === 'pie'
            ? writePieShare(
                propsRef.current.data,
                drag.target.partId,
                typeof clamped === 'number' ? clamped : 0,
              )
            : writeTarget(propsRef.current.data, drag.target, clamped);
        queueEdit(next);
        suppressClickUntil.current = Date.now() + 300;
        event.preventDefault();
        return;
      }
      if (event.pointerType === 'touch') return;
      if (propsRef.current.editable || propsRef.current.compact) {
        setSegmentHover(null);
        return;
      }
      const mark = hoverSegment(propsRef.current.view, instance, pointer);
      setSegmentHover(mark ? { mark, x: pointer.x, y: pointer.y } : null);
    };

    const finishDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      flushEdit();
      if (hostElement.hasPointerCapture(event.pointerId)) {
        hostElement.releasePointerCapture(event.pointerId);
      }
      dragRef.current = null;
      setAxisLock(undefined);
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        finishDrag(event);
        return;
      }
      if (event.pointerType !== 'touch' || propsRef.current.editable || propsRef.current.compact) {
        return;
      }
      const pointer = localPoint(hostElement, event);
      if (hitTestTarget(propsRef.current.view, instance, pointer)) return;
      const mark = hoverSegment(propsRef.current.view, instance, pointer);
      if (mark) propsRef.current.onSelect?.(mark);
    };

    const onPointerCancel = (event: PointerEvent) => {
      finishDrag(event);
    };

    const onPointerLeave = () => {
      if (!dragRef.current) setSegmentHover(null);
    };

    const onClick = (event: MouseEvent) => {
      if (Date.now() < suppressClickUntil.current) return;
      if (propsRef.current.editable) return;
      const pointer = localPoint(hostElement, event);
      if (hitTestTarget(propsRef.current.view, instance, pointer)) return;
      const hover = segmentHoverRef.current;
      if (hover) {
        propsRef.current.onSelect?.(hover.mark);
        setSegmentHover(null);
      }
    };

    const onNativeClick = (params: { data?: { mark?: string } }) => {
      if (Date.now() < suppressClickUntil.current) return;
      const mark = params.data?.mark;
      if (mark) propsRef.current.onSelect?.(mark);
    };

    instance.on('click', (params) => {
      onNativeClick(params as unknown as { data?: { mark?: string } });
    });
    hostElement.addEventListener('pointerdown', onPointerDown, { passive: false });
    hostElement.addEventListener('pointermove', onPointerMove, { passive: false });
    hostElement.addEventListener('pointerup', onPointerUp);
    hostElement.addEventListener('pointercancel', onPointerCancel);
    hostElement.addEventListener('pointerleave', onPointerLeave);
    hostElement.addEventListener('click', onClick);

    return () => {
      observer.disconnect();
      hostElement.removeEventListener('pointerdown', onPointerDown);
      hostElement.removeEventListener('pointermove', onPointerMove);
      hostElement.removeEventListener('pointerup', onPointerUp);
      hostElement.removeEventListener('pointercancel', onPointerCancel);
      hostElement.removeEventListener('pointerleave', onPointerLeave);
      hostElement.removeEventListener('click', onClick);
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      const target = window as unknown as { __dvChart?: echarts.EChartsType };
      if (target.__dvChart === instance) target.__dvChart = undefined;
      instance.dispose();
      chart.current = null;
    };
  }, [flushEdit, queueEdit]);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: false });
  }, [option]);

  useEffect(() => {
    const target = window as unknown as { __dvChartView?: string };
    target.__dvChartView = viewWithData.id;
    return () => {
      if (target.__dvChartView === viewWithData.id) target.__dvChartView = undefined;
    };
  }, [viewWithData.id]);

  const hoverHtml =
    segmentHover && tooltipHtml ? tooltipHtml(segmentHover.mark) : null;

  return (
    <div className={className} style={{ position: 'relative', width: '100%' }}>
      <div
        ref={host}
        style={{
          height,
          width: '100%',
          touchAction: editable ? 'none' : 'pan-y',
          cursor: editable ? 'grab' : 'default',
        }}
        role="img"
        aria-label={label || view.subject || view.label_en || 'chart'}
      />
      {segmentHover && hoverHtml && (
        <ChartTip x={segmentHover.x} y={segmentHover.y} html={hoverHtml} />
      )}
    </div>
  );
}
