import { useEffect, useMemo, useState } from 'react';
import type { ChartSpec } from 'ztd-charts';
import type { DatasetMeta } from '../types';
import type { Analysis } from '../live';
import type { ChartRow } from '../data-tools';
import { editColumns, isNumericField, seriesField } from '../data-tools';

const PAGE_SIZE = 12;
const SERIES_COLORS = ['#3b82f6', '#e07a5f', '#6a9f78', '#b58ad6', '#d6a84b', '#4fa3b8', '#c46b8a'];

function seriesColor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 997;
  return SERIES_COLORS[hash % SERIES_COLORS.length];
}

function CellInput({
  value,
  numeric,
  label,
  onCommit,
}: {
  value: unknown;
  numeric: boolean;
  label: string;
  onCommit: (value: number | string) => void;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [bad, setBad] = useState(false);

  useEffect(() => {
    setDraft(value == null ? '' : String(value));
    setBad(false);
  }, [value]);

  const commit = () => {
    if (!numeric) {
      onCommit(draft);
      return;
    }
    if (draft.trim() === '') {
      setBad(false);
      onCommit(0);
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setBad(true);
      return;
    }
    setBad(false);
    onCommit(parsed);
  };

  return (
    <input
      className={`editor-cell-input${bad ? ' is-bad' : ''}`}
      type={numeric ? 'number' : 'text'}
      inputMode={numeric ? 'decimal' : undefined}
      step={numeric ? 'any' : undefined}
      value={draft}
      aria-label={label}
      aria-invalid={bad || undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function DataEditor({
  rows,
  originalRows,
  spec,
  dataset,
  analysis,
  edited,
  selectedMetric,
  onRowsChange,
  onReset,
  onClose,
  onUndo,
  canUndo,
}: {
  rows: ChartRow[];
  originalRows: ChartRow[];
  spec: ChartSpec;
  dataset: DatasetMeta;
  analysis: Analysis | null;
  edited: boolean;
  selectedMetric: string;
  onRowsChange: (rows: ChartRow[]) => void;
  onReset: () => void;
  onClose: () => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const [page, setPage] = useState(0);
  const columns = useMemo(() => editColumns(spec, originalRows), [spec, originalRows]);
  const series = seriesField(spec);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const startRow = rows.length ? page * PAGE_SIZE + 1 : 0;
  const endRow = Math.min(rows.length, (page + 1) * PAGE_SIZE);
  const changedCells = useMemo(() => {
    let count = 0;
    rows.forEach((row, index) => {
      for (const column of columns) {
        if (row[column.field] !== originalRows[index]?.[column.field]) count += 1;
      }
    });
    return count;
  }, [rows, originalRows, columns]);

  useEffect(() => {
    if (page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  const changeCell = (rowIndex: number, field: string, value: number | string) => {
    const next = rows.map((row, index) => (index === rowIndex ? { ...row, [field]: value } : row));
    onRowsChange(next);
  };

  return (
    <section className="data-editor" aria-labelledby="editor-title">
      <header className="editor-head">
        <div>
          <p className="eyebrow">LIVE DATA WORKSPACE</p>
          <h2 id="editor-title">Edit the data</h2>
          <p>
            {dataset.title_en} · 修改后，左侧图表、右侧英文与中文会一起更新。
          </p>
        </div>
        <div className="editor-head-actions">
          <span className={`editor-status${edited ? ' is-edited' : ''}`}>
            {edited ? `Edited · ${changedCells} ${changedCells === 1 ? 'cell' : 'cells'}` : 'Original data'}
          </span>
          <button type="button" className="editor-reset" onClick={onUndo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" className="editor-reset" onClick={onReset} disabled={!edited}>
            Reset
          </button>
          <button type="button" className="editor-done" onClick={onClose}>
            Done
          </button>
        </div>
      </header>

      {analysis ? (
        <div className="editor-live-read" aria-live="polite">
          <span>LIVE READING</span>
          <p>{analysis.observations[0]?.en}</p>
          <p className="editor-live-zh">{analysis.observations[0]?.zh}</p>
          <div className="editor-live-stats">
            {analysis.stats.slice(0, 4).map((stat) => (
              <span key={`${stat.labelEn}-${stat.value}`}>
                <small>{stat.labelEn}</small>
                {stat.value}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="editor-table-topline">
        <div>
          <strong>Data table</strong>
          <span>
            Rows {startRow}–{endRow} of {rows.length} · edit any cell, the chart redraws immediately
          </span>
        </div>
        <div className="editor-pagination">
          <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>
            Previous
          </button>
          <span>{page + 1} / {pageCount}</span>
          <button type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1}>
            Next
          </button>
        </div>
      </div>

      <div className="editor-table-scroll">
        <table className="editor-table">
          <thead>
            <tr>
              <th className="editor-row-number">#</th>
              {columns.map((column) => (
                <th
                  key={column.field}
                  className={`is-${column.span}${column.field === selectedMetric ? ' is-metric' : ''}`}
                >
                  <span>{column.label}</span>
                  <small>{column.labelZh} · {column.numeric ? 'number' : 'text'}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, offset) => {
              const rowIndex = page * PAGE_SIZE + offset;
              return (
                <tr key={rowIndex}>
                  <td className="editor-row-number">
                    {series && row[series] != null ? (
                      <>
                        <span className="series-dot" style={{ background: seriesColor(String(row[series])) }} />
                        <small className="row-series">{String(row[series])}</small>
                      </>
                    ) : null}
                    <span className="row-number">{rowIndex + 1}</span>
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.field}
                      className={`is-${column.span}${column.field === selectedMetric ? ' is-metric' : ''}`}
                    >
                      <CellInput
                        value={row[column.field]}
                        numeric={column.numeric || isNumericField(column.field, originalRows)}
                        label={`Row ${rowIndex + 1}, ${column.label}`}
                        onCommit={(value) => changeCell(rowIndex, column.field, value)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="editor-table-foot">
        <span>
          {series ? '同色圆点表示同一系列；' : ''}
          空数字按 0 处理，负数可以直接输入。窄屏可左右滑动表格；原始数据不会被修改。
        </span>
      </div>
    </section>
  );
}
