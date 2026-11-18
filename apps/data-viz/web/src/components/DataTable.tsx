import type { View, ViewData } from '../data/types';
import { Input } from './ui';

interface Props {
  view: View;
  data: ViewData;
  onChange?: (data: ViewData) => void;
}

function clone(data: ViewData): ViewData {
  return JSON.parse(JSON.stringify(data)) as ViewData;
}

function cellClass(editable: boolean): string {
  return editable
    ? 'border-b border-[var(--rule)] px-1.5 py-1 align-middle'
    : 'border-b border-[var(--rule)] px-2 py-1.5 align-middle';
}

function NumberCell({
  value,
  onChange,
  editable,
}: {
  value: number;
  onChange: (value: number) => void;
  editable: boolean;
}) {
  if (!editable) return <span className="tabular-nums">{value}</span>;
  return (
    <Input
      type="number"
      step="0.1"
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
      className="h-8 min-w-16 text-right tabular-nums"
    />
  );
}

function TextCell({
  value,
  onChange,
  editable,
}: {
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
}) {
  if (!editable) return <span>{value}</span>;
  return <Input value={value} onChange={(event) => onChange(event.target.value)} className="h-8 min-w-24" />;
}

export function DataTable({ view, data, onChange }: Props) {
  const editable = !!onChange;
  const update = (mutate: (next: ViewData) => void) => {
    if (!onChange) return;
    const next = clone(data);
    mutate(next);
    onChange(next);
  };

  if (view.type === 'line' || view.type === 'bar' || view.type === 'stacked') {
    const xs = data.x?.values ?? [];
    const series = data.series ?? [];
    return (
      <div className="dv-scroll overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="border-b border-[var(--rule)] px-2 py-1.5 text-left font-medium text-[var(--muted)]">
                {data.x?.label_en ?? ''}
              </th>
              {series.map((s, si) => (
                <th key={s.id} className="border-b border-[var(--rule)] px-1.5 py-1.5 text-left font-medium">
                  <TextCell
                    value={s.name_en}
                    editable={editable}
                    onChange={(value) =>
                      update((next) => {
                        next.series![si].name_en = value;
                      })
                    }
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {xs.map((x, i) => (
              <tr key={i}>
                <th className="border-b border-[var(--rule)] px-1.5 py-1 text-left font-normal">
                  <TextCell
                    value={String(x)}
                    editable={editable}
                    onChange={(value) =>
                      update((next) => {
                        next.x!.values![i] = value;
                      })
                    }
                  />
                </th>
                {series.map((s, si) => (
                  <td key={s.id} className={cellClass(editable)}>
                    <NumberCell
                      value={Number(s.values[i]) || 0}
                      editable={editable}
                      onChange={(value) =>
                        update((next) => {
                          next.series![si].values[i] = value;
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view.type === 'pie') {
    const parts = data.parts ?? [];
    const total = parts.reduce((sum, part) => sum + (Number(part.value) || 0), 0);
    return (
      <div className="dv-scroll overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="border-b border-[var(--rule)] px-2 py-1.5 text-left font-medium text-[var(--muted)]">类别</th>
              <th className="border-b border-[var(--rule)] px-2 py-1.5 text-right font-medium text-[var(--muted)]">数值</th>
              <th className="border-b border-[var(--rule)] px-2 py-1.5 text-right font-medium text-[var(--muted)]">占比</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((part, index) => (
              <tr key={part.id}>
                <td className={cellClass(editable)}>
                  <TextCell
                    value={part.name_en}
                    editable={editable}
                    onChange={(value) =>
                      update((next) => {
                        next.parts![index].name_en = value;
                      })
                    }
                  />
                </td>
                <td className={cellClass(editable)}>
                  <NumberCell
                    value={Number(part.value) || 0}
                    editable={editable}
                    onChange={(value) =>
                      update((next) => {
                        next.parts![index].value = value;
                      })
                    }
                  />
                </td>
                <td className="border-b border-[var(--rule)] px-2 py-1.5 text-right tabular-nums text-[var(--muted)]">
                  {total ? `${((Number(part.value) / total) * 100).toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view.type === 'scatter') {
    const points = data.points ?? [];
    const groups = data.groups ?? [];
    return (
      <div className="dv-scroll overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="border-b border-[var(--rule)] px-2 py-1.5 text-left font-medium text-[var(--muted)]">点</th>
              <th className="border-b border-[var(--rule)] px-2 py-1.5 text-right font-medium text-[var(--muted)]">{data.x?.label_en ?? 'x'}</th>
              <th className="border-b border-[var(--rule)] px-2 py-1.5 text-right font-medium text-[var(--muted)]">{data.y?.label_en ?? 'y'}</th>
              <th className="border-b border-[var(--rule)] px-2 py-1.5 text-left font-medium text-[var(--muted)]">组</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => (
              <tr key={point.id}>
                <td className={cellClass(editable)}>
                  <TextCell
                    value={point.name_en}
                    editable={editable}
                    onChange={(value) =>
                      update((next) => {
                        next.points![index].name_en = value;
                      })
                    }
                  />
                </td>
                <td className={cellClass(editable)}>
                  <NumberCell
                    value={Number(point.x) || 0}
                    editable={editable}
                    onChange={(value) =>
                      update((next) => {
                        next.points![index].x = value;
                      })
                    }
                  />
                </td>
                <td className={cellClass(editable)}>
                  <NumberCell
                    value={Number(point.y) || 0}
                    editable={editable}
                    onChange={(value) =>
                      update((next) => {
                        next.points![index].y = value;
                      })
                    }
                  />
                </td>
                <td className={cellClass(editable)}>
                  {editable ? (
                    <select
                      className="dv-field h-8 w-full px-2 text-[12px]"
                      value={point.group ?? ''}
                      onChange={(event) =>
                        update((next) => {
                          next.points![index].group = event.target.value;
                        })
                      }
                    >
                      <option value="">—</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name_en}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span>{groups.find((group) => group.id === point.group)?.name_en ?? '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view.type === 'heatmap') {
    const rows = data.rows ?? [];
    const cols = data.cols ?? [];
    const cells = data.cells ?? [];
    return (
      <div className="dv-scroll overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="border-b border-[var(--rule)] px-2 py-1.5"></th>
              {cols.map((col) => (
                <th key={col.id} className="border-b border-[var(--rule)] px-2 py-1.5 text-right font-medium text-[var(--muted)]">
                  {col.name_en}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row.id}>
                <th className="border-b border-[var(--rule)] px-2 py-1 text-left font-normal">{row.name_en}</th>
                {cols.map((col, c) => (
                  <td key={col.id} className={cellClass(editable)}>
                    <NumberCell
                      value={Number(cells[r]?.[c]) || 0}
                      editable={editable}
                      onChange={(value) =>
                        update((next) => {
                          next.cells![r][c] = value;
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view.type === 'sankey') {
    const nodes = data.nodes ?? [];
    const links = data.links ?? [];
    const name = (id: string) => nodes.find((node) => node.id === id)?.name_en ?? id;
    return (
      <div className="dv-scroll overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="border-b border-[var(--rule)] px-2 py-1.5 text-left font-medium text-[var(--muted)]">来源</th>
              <th className="border-b border-[var(--rule)] px-2 py-1.5 text-left font-medium text-[var(--muted)]">去向</th>
              <th className="border-b border-[var(--rule)] px-2 py-1.5 text-right font-medium text-[var(--muted)]">数值</th>
            </tr>
          </thead>
          <tbody>
            {links.map((link, index) => (
              <tr key={`${link.source}-${link.target}`}>
                <td className="border-b border-[var(--rule)] px-2 py-1.5">{name(link.source)}</td>
                <td className="border-b border-[var(--rule)] px-2 py-1.5">{name(link.target)}</td>
                <td className={cellClass(editable)}>
                  <NumberCell
                    value={Number(link.value) || 0}
                    editable={editable}
                    onChange={(value) =>
                      update((next) => {
                        next.links![index].value = value;
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view.type === 'slope') {
    const periods = data.periods ?? [];
    const entities = data.entities ?? [];
    return (
      <div className="dv-scroll overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="border-b border-[var(--rule)] px-2 py-1.5 text-left font-medium text-[var(--muted)]">对象</th>
              {periods.map((period, index) => (
                <th key={index} className="border-b border-[var(--rule)] px-2 py-1.5 text-right font-medium text-[var(--muted)]">
                  {period.label_en ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entities.map((entity, ei) => (
              <tr key={entity.id}>
                <td className={cellClass(editable)}>
                  <TextCell
                    value={entity.name_en}
                    editable={editable}
                    onChange={(value) =>
                      update((next) => {
                        next.entities![ei].name_en = value;
                      })
                    }
                  />
                </td>
                {periods.map((_, pi) => (
                  <td key={pi} className={cellClass(editable)}>
                    <NumberCell
                      value={Number(entity.values[pi]) || 0}
                      editable={editable}
                      onChange={(value) =>
                        update((next) => {
                          next.entities![ei].values[pi] = value;
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view.type === 'waterfall') {
    const steps = data.steps ?? [];
    return (
      <div className="space-y-3">
        <label className="flex items-center justify-between gap-3 text-[12px] text-[var(--muted)]">
          起始值
          <NumberCell
            value={Number(data.start_value) || 0}
            editable={editable}
            onChange={(value) =>
              update((next) => {
                next.start_value = value;
              })
            }
          />
        </label>
        <div className="dv-scroll overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="border-b border-[var(--rule)] px-2 py-1.5 text-left font-medium text-[var(--muted)]">步骤</th>
                <th className="border-b border-[var(--rule)] px-2 py-1.5 text-right font-medium text-[var(--muted)]">变化</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step, index) => (
                <tr key={step.id}>
                  <td className={cellClass(editable)}>
                    <TextCell
                      value={step.name_en}
                      editable={editable}
                      onChange={(value) =>
                        update((next) => {
                          next.steps![index].name_en = value;
                        })
                      }
                    />
                  </td>
                  <td className={cellClass(editable)}>
                    <NumberCell
                      value={Number(step.value) || 0}
                      editable={editable}
                      onChange={(value) =>
                        update((next) => {
                          next.steps![index].value = value;
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return <p className="text-sm text-[var(--muted)]">这个图表类型还没有数据表。</p>;
}
