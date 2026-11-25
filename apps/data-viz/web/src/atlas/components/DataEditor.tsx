import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ChartEvent } from 'ztd-charts';
import type { ChartSpec } from 'ztd-charts';
import type { ChartRow } from '../data-tools';
import { getPreferredMetric } from '../data-tools';

export interface PointEdit {
  rowIndex: number;
  field: string;
  label: string;
  value: number;
  x: number;
  y: number;
}

/** Map a clicked chart mark to the table cell it came from. */
export function editTargetFor(
  event: ChartEvent<Record<string, unknown>>,
  rows: ChartRow[],
  spec: ChartSpec,
): { rowIndex: number; field: string } | null {
  const datum = event.datum as ChartRow | null;
  const rowIndex = datum ? rows.indexOf(datum) : event.index;
  if (rowIndex < 0 || rowIndex >= rows.length) return null;
  const row = rows[rowIndex];
  const numeric = Object.keys(row).filter((field) =>
    typeof row[field] === 'number' && Number.isFinite(row[field] as number),
  );
  if (!numeric.length) return null;
  const visible = event.value != null ? numeric.find((field) => row[field] === event.value) : undefined;
  if (visible) return { rowIndex, field: visible };
  const preferred = getPreferredMetric(spec, rows);
  return { rowIndex, field: numeric.includes(preferred) ? preferred : numeric[0] };
}

export function PointEditor({
  edit,
  onChange,
  onClose,
}: {
  edit: PointEdit;
  onChange: (value: number) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(String(edit.value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused.current) setDraft(String(edit.value));
    setBad(false);
  }, [edit.value]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = (next: string) => {
    setDraft(next);
    if (!next.trim()) {
      setBad(true);
      return;
    }
    const parsed = Number(next);
    if (!Number.isFinite(parsed)) {
      setBad(true);
      return;
    }
    setBad(false);
    onChange(parsed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className={`point-editor${bad ? ' is-bad' : ''}`}
      style={{ left: edit.x, top: edit.y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <span className="point-editor-label">{edit.label}</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={draft}
        aria-label={`${edit.label} 的新数字`}
        aria-invalid={bad || undefined}
        onFocus={() => { focused.current = true; }}
        onChange={(event) => commit(event.target.value)}
        onBlur={onClose}
        onKeyDown={handleKeyDown}
      />
      <span className="point-editor-hint">{bad ? '这里要填数字' : '直接输入数字，图和英文会跟着变'}</span>
    </div>
  );
}
