import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { ChartSpec } from 'ztd-charts';
import type { DatasetMeta } from '../types';
import type { Analysis } from '../live';
import type { ChartRow } from '../data-tools';
import { editColumns, isNumericField, seriesField } from '../data-tools';

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
  onFocusCell,
  onBlurCell,
  onInvalid,
}: {
  value: unknown;
  numeric: boolean;
  label: string;
  onCommit: (value: number | string) => void;
  onFocusCell: () => void;
  onBlurCell: () => void;
  onInvalid: (message: string) => void;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value == null ? '' : String(value));
    setBad(false);
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setDraft(next);
    if (!numeric) {
      onCommit(next);
      return;
    }
    if (next.trim() === '') {
      setBad(true);
      onInvalid('这里要填数字，先按原来的数字算。');
      return;
    }
    const parsed = Number(next);
    if (!Number.isFinite(parsed)) {
      setBad(true);
      onInvalid(`这里要填数字，刚才填的不能用，还是用原来的 ${value}。`);
      return;
    }
    setBad(false);
    onInvalid('');
    onCommit(parsed);
  };

  const handleBlur = () => {
    focused.current = false;
    if (bad || draft.trim() === '' || !Number.isFinite(Number(draft))) {
      setDraft(value == null ? '' : String(value));
      setBad(false);
    }
    onBlurCell();
  };

  return (
    <input
      className={`editor-cell-input${bad ? ' is-bad' : ''}`}
      type="text"
      inputMode={numeric ? 'decimal' : undefined}
      value={draft}
      aria-label={label}
      aria-invalid={bad || undefined}
      onChange={handleChange}
      onFocus={() => {
        focused.current = true;
        onFocusCell();
      }}
      onBlur={handleBlur}
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
  onBeginEdit,
  onEndEdit,
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
  onBeginEdit: () => void;
  onEndEdit: () => void;
}) {
  const [errorMessage, setErrorMessage] = useState('');
  const columns = useMemo(() => editColumns(spec, originalRows), [spec, originalRows]);
  const series = seriesField(spec);

  const changeCell = (rowIndex: number, field: string, value: number | string) => {
    const next = rows.map((row, index) => (index === rowIndex ? { ...row, [field]: value } : row));
    onRowsChange(next);
  };

  return (
    <section className="data-editor" aria-labelledby="editor-title">
      <header className="editor-head">
        <div>
          <p className="eyebrow">改数字</p>
          <h2 id="editor-title">改数字看看</h2>
          <p>{dataset.title_en} · 改一格，下面的英文和中文会跟着变。</p>
        </div>
        <div className="editor-head-actions">
          <span className={`editor-status${edited ? ' is-edited' : ''}`}>
            {edited ? '已改动' : '原始数据'}
          </span>
          <button type="button" className="editor-reset" onClick={onUndo} disabled={!canUndo}>
            撤销刚才那一步
          </button>
          <button type="button" className="editor-reset" onClick={onReset} disabled={!edited}>
            全部恢复原来的数字
          </button>
          <button type="button" className="editor-done" onClick={onClose}>
            看完，回到讲解
          </button>
        </div>
      </header>

      <p className="editor-error" role="status" aria-live="polite">
        {errorMessage}
      </p>

      {analysis ? (
        <div className="editor-live-read" aria-live="polite">
          <span>现在图里的数据</span>
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
          <strong>数据表</strong>
          <span>直接点格子改数字，下面的英文会跟着变。</span>
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
                  <small>{column.labelZh} · {column.numeric ? '数字' : '文字'}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
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
                      label={`第 ${rowIndex + 1} 行，${column.label}`}
                      onCommit={(value) => changeCell(rowIndex, column.field, value)}
                      onFocusCell={onBeginEdit}
                      onBlurCell={onEndEdit}
                      onInvalid={setErrorMessage}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="editor-table-foot">
        <span>
          {series ? '同色圆点是同一组；' : ''}
          这里改的数字只在这个页面里生效，不会改掉原来的内容。
        </span>
      </div>
    </section>
  );
}
