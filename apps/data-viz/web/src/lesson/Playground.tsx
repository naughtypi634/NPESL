import type { Dataset, Preset } from '../data/content-types';

interface PlaygroundSeries {
  id: string;
  label: string;
}

interface PlaygroundProps {
  dataset: Dataset;
  series: PlaygroundSeries[];
  activeSeries: string;
  valuesBySeries: Record<string, number[]>;
  edited: boolean;
  min: number;
  max: number;
  step: number;
  presets: Preset[];
  onSeriesChange: (seriesId: string) => void;
  onChange: (seriesId: string, values: number[]) => void;
  onReset: () => void;
}

export function Playground({
  dataset,
  series,
  activeSeries,
  valuesBySeries,
  edited,
  min,
  max,
  step,
  presets,
  onSeriesChange,
  onChange,
  onReset,
}: PlaygroundProps) {
  const values = valuesBySeries[activeSeries] ?? dataset.categories.map(() => 0);
  const activeLabel = series.find((item) => item.id === activeSeries)?.label ?? activeSeries;

  const setValue = (index: number, value: number) => {
    if (!Number.isFinite(value)) return;
    const next = values.slice();
    next[index] = Math.min(max, Math.max(min, Math.round(value)));
    onChange(activeSeries, next);
  };

  const applyPreset = (preset: Preset) => {
    const next = values.slice();
    if (preset.op === 'floor' && preset.floor != null) {
      for (let index = 0; index < next.length; index += 1) {
        next[index] = Math.max(next[index], preset.floor);
      }
    }
    if (preset.op === 'add' && preset.category && preset.delta != null) {
      const index = dataset.categories.indexOf(preset.category);
      if (index >= 0) next[index] = Math.min(max, next[index] + preset.delta);
    }
    onChange(activeSeries, next);
  };

  return (
    <section className="dv-playground" aria-labelledby="playground-title">
      <div className="dv-playground-head">
        <h2 id="playground-title">Change the data</h2>
        <div className="dv-playground-actions">
          <label className="dv-series-select">
            <span className="dv-sr-only">Series</span>
            <select
              value={activeSeries}
              aria-label="Series to edit"
              onChange={(event) => onSeriesChange(event.target.value)}
            >
              {series.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="dv-button" onClick={onReset} disabled={!edited}>
            Reset
          </button>
        </div>
      </div>

      <div className="dv-presets">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="dv-preset"
            onClick={() => applyPreset(preset)}
          >
            {preset.label_zh}
          </button>
        ))}
      </div>

      <div className="dv-sliders">
        {dataset.categories.map((category, index) => (
          <div className="dv-slider" key={category}>
            <label className="dv-slider-label" htmlFor={`value-${activeSeries}-${index}`}>
              {category}
            </label>
            <input
              id={`value-${activeSeries}-${index}`}
              type="range"
              min={min}
              max={max}
              step={step}
              value={values[index]}
              aria-label={`${category} ${activeLabel} ${dataset.unit.en}`}
              onChange={(event) => setValue(index, Number(event.target.value))}
            />
            <span className="dv-number-wrap">
              <input
                type="number"
                className="dv-number"
                min={min}
                max={max}
                step={step}
                value={values[index]}
                aria-label={`${category} ${activeLabel} numeric value`}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  if (event.target.value === '') return;
                  setValue(index, Number(event.target.value));
                }}
              />
              <span className="dv-number-unit" aria-hidden="true">
                {dataset.unit.short}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
