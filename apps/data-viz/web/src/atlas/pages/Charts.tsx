import type { AtlasIndex, ChartSummary } from '../types';
import { useTheme } from '../use-theme';
import { A, Arrow, FamilyGlyph, PageHead } from '../components/chrome';

function ChartCard({ chart, familyName }: { chart: ChartSummary; familyName: string }) {
  const theme = useTheme();
  const preview = chart.preview;
  const src = preview ? (theme === 'light' ? preview.light : preview.dark) : null;

  return (
    <A href={`#/charts/${chart.id}`} className="chart-card">
      <div className="chart-card-preview">
        {src ? (
          <img
            src={`${import.meta.env.BASE_URL}${src}`}
            alt=""
            width={360}
            height={200}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="chart-preview-placeholder">Preview unavailable</div>
        )}
      </div>
      <div className="chart-card-copy">
        <span className="chart-card-family">{familyName}</span>
        <span className="chart-card-en">{chart.name_en}</span>
        <span className="chart-card-zh">{chart.name_zh}</span>
        <span className="chart-card-what">{chart.what_zh}</span>
      </div>
      <Arrow />
    </A>
  );
}

export function Charts({ index }: { index: AtlasIndex }) {
  const families = [...index.families].sort((a, b) => a.order - b.order);
  const charts = [...index.charts];
  return (
    <div className="page">
      <PageHead
        eyebrow="Browse by chart"
        title="看图表"
        lede="点开一种图，先看懂图，再看英文说法。"
      />

      {charts.length ? (
        <button
          type="button"
          onClick={() => {
            window.location.hash = `#/charts/${charts[0].id}`;
          }}
          style={{
            display: 'block',
            width: '100%',
            maxWidth: 320,
            padding: '16px 24px',
            border: '1px solid var(--pane-edge)',
            borderRadius: 12,
            background: 'var(--pane)',
            color: 'var(--fg)',
            fontSize: 20,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          看一张图
        </button>
      ) : null}

      {families.map((family) => {
        const own = charts.filter((chart) => chart.family === family.id);
        if (!own.length) return null;
        return (
          <section className="family" id={`family-${family.id}`} key={family.id}>
            <header className="family-head">
              <span className="family-glyph">
                <FamilyGlyph family={family.id} />
              </span>
              <div>
                <h2>
                  {family.name_en}
                  <span className="family-zh">{family.name_zh}</span>
                </h2>
                <p>{family.intro_zh}</p>
              </div>
            </header>
            <div className="chart-grid">
              {own.map((chart) => (
                <ChartCard key={chart.id} chart={chart} familyName={family.name_en} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
