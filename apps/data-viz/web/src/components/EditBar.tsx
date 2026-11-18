import { useEffect, useState } from 'react';

import type { View, ViewData } from '../data/types';
import {
  clampNumber,
  formatInput,
  inputStep,
  readTarget,
  scatterRanges,
  targetForMark,
  targetLabel,
  valueRange,
  writeTarget,
  type EditTarget,
} from '../lib/edit';
import { Button, Input } from './ui';

interface Props {
  view: View;
  data: ViewData;
  selectedMark: string | null;
  edited: boolean;
  onChange: (next: ViewData) => void;
  onReset: () => void;
}

function NumberField({
  label,
  value,
  unitLabel,
  step,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  unitLabel?: string;
  step: number;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-[12px] text-[var(--muted)]">
      <span className="shrink-0">{label}</span>
      <Input
        className="h-8 w-[120px]"
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            event.currentTarget.blur();
          }
        }}
        aria-label={label}
      />
      {unitLabel && <span className="shrink-0 text-[11px] text-[var(--muted)]">{unitLabel}</span>}
    </label>
  );
}

export function EditBar({ view, data, selectedMark, edited, onChange, onReset }: Props) {
  const target: EditTarget | null = targetForMark(view, selectedMark);
  const current = target ? readTarget(data, target) : null;
  const unit = view.unit;
  const [numberText, setNumberText] = useState('');
  const [xText, setXText] = useState('');
  const [yText, setYText] = useState('');
  const [startText, setStartText] = useState('');

  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement) return;
    if (target && typeof current === 'number') {
      setNumberText(formatInput(current, unit));
    } else {
      setNumberText('');
    }
    if (current && typeof current === 'object') {
      setXText(formatInput(current.x, unit));
      setYText(formatInput(current.y, unit));
    }
    setStartText(formatInput(Number(data.start_value) || 0, unit));
    // Re-sync when the selection or the underlying data changes, but never
    // while the user is typing in one of the fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMark, data, view.id]);

  const commitNumber = (text: string) => {
    if (!target) return;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return;
    const range = valueRange(view, target);
    const clamped = clampNumber(parsed, range);
    onChange(writeTarget(data, target, clamped));
  };

  const commitScatter = (nextX: string, nextY: string) => {
    if (!target || target.kind !== 'scatter') return;
    const ranges = scatterRanges(view);
    const x = Number(nextX);
    const y = Number(nextY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    onChange(
      writeTarget(data, target, {
        x: clampNumber(x, ranges?.x ?? null),
        y: clampNumber(y, ranges?.y ?? null),
      }),
    );
  };

  const startTarget: EditTarget = { kind: 'waterfall-start' };
  const isScatter = target?.kind === 'scatter';
  const pieShare =
    target?.kind === 'pie' && typeof current === 'number'
      ? (() => {
          const total = (data.parts ?? []).reduce((sum, part) => sum + (Number(part.value) || 0), 0);
          return total > 0 ? `${((current / total) * 100).toFixed(1)}%` : '';
        })()
      : '';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-[var(--rule)] bg-[var(--pane-solid)] px-3 py-2">
      <span className="text-[12px] font-medium text-[var(--fg)]">编辑数据</span>
      {!target && (
        <span className="text-[12px] text-[var(--muted)]">
          {selectedMark ? '这处观察覆盖多个数据，点一个具体图元再改。' : '先点一个数据点、柱子或格子。'}
        </span>
      )}
      {target && typeof current === 'number' && (
        <div className="flex flex-wrap items-center gap-2">
          <NumberField
            label={targetLabel(view, target)}
            value={numberText}
            unitLabel={unit?.short}
            step={inputStep(unit)}
            onChange={(value) => {
              setNumberText(value);
              commitNumber(value);
            }}
            onCommit={() => commitNumber(numberText)}
          />
          {pieShare && <span className="text-[11px] text-[var(--muted)]">{pieShare}</span>}
        </div>
      )}
      {target && isScatter && (
        <>
          <NumberField
            label={`${targetLabel(view, target)} X`}
            value={xText}
            step={inputStep(unit)}
            onChange={(value) => {
              setXText(value);
              commitScatter(value, yText);
            }}
            onCommit={() => commitScatter(xText, yText)}
          />
          <NumberField
            label={`${targetLabel(view, target)} Y`}
            value={yText}
            step={inputStep(unit)}
            onChange={(value) => {
              setYText(value);
              commitScatter(xText, value);
            }}
            onCommit={() => commitScatter(xText, yText)}
          />
        </>
      )}
      {view.type === 'waterfall' && (
        <NumberField
          label="起始值"
          value={startText}
          unitLabel={unit?.short}
          step={inputStep(unit)}
          onChange={(value) => {
            setStartText(value);
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
              onChange(writeTarget(data, startTarget, parsed));
            }
          }}
          onCommit={() => {
            const parsed = Number(startText);
            if (Number.isFinite(parsed)) onChange(writeTarget(data, startTarget, parsed));
          }}
        />
      )}
      {edited && (
        <Button className="ml-auto" onClick={onReset}>
          还原
        </Button>
      )}
    </div>
  );
}
