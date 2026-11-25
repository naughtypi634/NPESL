import type { Analysis } from '../live';
import { fieldZh } from '../data-tools';

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
        这组数字暂时算不出新说法，下面的原始范文还能看。
      </p>
    );
  }

  return (
    <div className="live-english">
      <div className="live-english-toolbar">
        <div>
          <span className="live-status-dot" />
          <span className="live-status-label">下面的话跟着数字变</span>
        </div>
        {metricOptions.length > 1 ? (
          <label className="live-metric-select">
            <span>讲哪一项</span>
            <select value={selectedMetric} onChange={(event) => onMetricChange(event.target.value)}>
              {metricOptions.map((field) => (
                <option key={field} value={field}>{fieldZh(field)}</option>
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
    { key: 'academic', title: '学术写作', en: 'Academic writing', narrative: analysis.academic },
    { key: 'business', title: '商务汇报', en: 'Business presentation', narrative: analysis.business },
    { key: 'everyday', title: '日常英语', en: 'Everyday English', narrative: analysis.everyday },
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
              <span>{version.en}</span>
            </header>
            <p className="version-en">{version.narrative.en}</p>
            <p className="version-zh">{version.narrative.zh}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
