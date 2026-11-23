import type { SentenceLevel } from '../data/content-types';

interface SentenceBuilderProps {
  levels: SentenceLevel[];
}

export function SentenceBuilder({ levels }: SentenceBuilderProps) {
  return (
    <section className="dv-section" id="build" aria-labelledby="build-title">
      <h2 id="build-title" className="dv-section-title">Sentence building</h2>
      <div className="dv-levels">
        {levels.map((level) => (
          <article className="dv-level" key={level.level}>
            <div className="dv-level-head">
              <span className="dv-level-label">{level.label}</span>
              <span className="dv-level-note">{level.note_zh}</span>
            </div>
            <p className="dv-level-text">
              {level.segments.map((segment, index) => (
                <span
                  key={`${level.level}-${index}`}
                  className={segment.added ? 'dv-added' : undefined}
                >
                  {segment.text}
                </span>
              ))}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
