import type { Analysis } from '../live';

export function LiveEnglishInsights({
  analysis,
  metricOptions,
  selectedMetric,
  onMetricChange,
  showObservations = true,
}: {
  analysis: Analysis | null;
  metricOptions: string[];
  selectedMetric: string;
  onMetricChange: (metric: string) => void;
  showObservations?: boolean;
}) {
  if (!analysis) {
    return (
      <p className="live-empty">
        这组数据暂时无法生成实时分析；图表和原始示例仍然可用。
      </p>
    );
  }

  return (
    <div className="live-english">
      <div className="live-english-toolbar">
        <div>
          <span className="live-status-dot" />
          <span className="live-status-label">LIVE FROM CURRENT DATA</span>
        </div>
        {metricOptions.length > 1 ? (
          <label className="live-metric-select">
            <span>Describe</span>
            <select value={selectedMetric} onChange={(event) => onMetricChange(event.target.value)}>
              {metricOptions.map((field) => (
                <option key={field} value={field}>{field.replace(/[_-]+/g, ' ')}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="live-stats">
        {analysis.stats.slice(0, 4).map((stat) => (
          <article className="live-stat" key={`${stat.labelEn}-${stat.value}`}>
            <span>{stat.labelEn}</span>
            <strong>{stat.value}</strong>
            <small>{stat.noteEn || stat.labelZh}</small>
          </article>
        ))}
      </div>

      {showObservations ? (
        <div className="live-observation-list">
          {analysis.observations.map((item) => (
            <article className="live-observation" key={item.en}>
              <p className="live-copy-en">{item.en}</p>
              <p className="live-copy-zh">{item.zh}</p>
            </article>
          ))}
        </div>
      ) : null}

      {analysis.notes.length ? (
        <ul className="live-notes">
          {analysis.notes.map((note) => (
            <li key={note.en}>
              <span>{note.en}</span>
              <span>{note.zh}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function LiveEnglishVersions({ analysis }: { analysis: Analysis | null }) {
  if (!analysis) return null;
  const versions = [
    { key: 'academic', title: 'Academic writing', zh: '学术写作', narrative: analysis.academic },
    { key: 'business', title: 'Business presentation', zh: '商务汇报', narrative: analysis.business },
    { key: 'everyday', title: 'Everyday English', zh: '日常英语', narrative: analysis.everyday },
  ];
  return (
    <div className="live-version-wrap">
      <p className="live-version-note">
        下面三段文字根据当前数据实时生成；改动表格后，英文与中文会一起更新。
      </p>
      <div className="versions">
        {versions.map((version) => (
          <article className="version live-version" key={version.key}>
            <header>
              <h3>{version.title}</h3>
              <span>{version.zh}</span>
            </header>
            <p className="version-en">{version.narrative.en}</p>
            <p className="version-zh">{version.narrative.zh}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
