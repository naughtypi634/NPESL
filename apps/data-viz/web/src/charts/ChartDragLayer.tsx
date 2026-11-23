import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

interface SeriesColor {
  id: string;
  label: string;
  color: string;
}

interface Handle {
  index: number;
  category: string;
  seriesId: string;
  seriesLabel: string;
  value: number;
  x: number;
  y: number;
  height: number;
}

interface DragState {
  index: number;
  seriesId: string;
  startY: number;
  startValue: number;
  pixelsPerUnit: number;
  pointerId: number;
  element: HTMLElement;
}

interface ChartDragLayerProps {
  hostRef: RefObject<HTMLDivElement | null>;
  series: SeriesColor[];
  valuesBySeries: Record<string, number[]>;
  categories: string[];
  unit: string;
  min: number;
  max: number;
  revision: string;
  onValueChange: (seriesId: string, index: number, value: number) => void;
}

function hexToRgb(hex: string): string | null {
  const value = hex.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgb(${r},${g},${b})`;
}

export function ChartDragLayer({
  hostRef,
  series,
  valuesBySeries,
  categories,
  unit,
  min,
  max,
  revision,
  onValueChange,
}: ChartDragLayerProps) {
  const [handles, setHandles] = useState<Handle[]>([]);
  const dragRef = useRef<DragState | null>(null);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const hostRect = host.getBoundingClientRect();
    const paths = Array.from(host.querySelectorAll<SVGPathElement>('.ztd-mark path'))
      .map((path) => {
        const rect = path.getBoundingClientRect();
        return { rect, fill: getComputedStyle(path).fill.replace(/\s/g, '') };
      })
      .filter((item) => item.rect.height > 1 && item.rect.width > 1);

    const next: Handle[] = [];
    for (const entry of series) {
      const rgb = hexToRgb(entry.color);
      if (!rgb) continue;
      const matched = paths
        .filter((item) => item.fill === rgb)
        .sort((a, b) => a.rect.left - b.rect.left)
        .slice(0, categories.length);
      matched.forEach((item, index) => {
        const value = valuesBySeries[entry.id]?.[index] ?? 0;
        next.push({
          index,
          category: categories[index],
          seriesId: entry.id,
          seriesLabel: entry.label,
          value,
          x: item.rect.left + item.rect.width / 2 - hostRect.left,
          y: item.rect.top + 8 - hostRect.top,
          height: item.rect.height,
        });
      });
    }
    setHandles(next);
  }, [hostRef, series, valuesBySeries, categories]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 160);
    const observer = new ResizeObserver(measure);
    if (hostRef.current) observer.observe(hostRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [measure, revision]);

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.element.hasPointerCapture(drag.pointerId)) {
      drag.element.releasePointerCapture(drag.pointerId);
    }
    dragRef.current = null;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="dv-drag-layer">
      {handles.map((handle) => (
        <button
          key={`${handle.seriesId}-${handle.category}`}
          type="button"
          className="dv-drag-handle"
          style={{ left: handle.x, top: handle.y }}
          role="slider"
          aria-orientation="vertical"
          aria-label={`${handle.category} ${handle.seriesLabel}`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={handle.value}
          aria-valuetext={`${handle.value}${unit}`}
          title="Drag up or down to change the value"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const element = event.currentTarget;
            element.setPointerCapture(event.pointerId);
            dragRef.current = {
              index: handle.index,
              seriesId: handle.seriesId,
              startY: event.clientY,
              startValue: handle.value,
              pixelsPerUnit: Math.max(0.4, handle.height / Math.max(1, handle.value)),
              pointerId: event.pointerId,
              element,
            };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag) return;
            event.preventDefault();
            const delta = drag.startY - event.clientY;
            const next = Math.min(
              max,
              Math.max(Math.max(1, min), Math.round(drag.startValue + delta / drag.pixelsPerUnit)),
            );
            if (next !== handle.value) onValueChange(drag.seriesId, drag.index, next);
          }}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 5 : 1;
            let next: number | null = null;
            if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = handle.value + step;
            if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = handle.value - step;
            if (event.key === 'Home') next = min;
            if (event.key === 'End') next = max;
            if (next == null) return;
            event.preventDefault();
            onValueChange(handle.seriesId, handle.index, Math.min(max, Math.max(min, next)));
          }}
        />
      ))}
    </div>
  );
}
