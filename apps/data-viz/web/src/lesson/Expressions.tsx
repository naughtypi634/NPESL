import type { ExpressionView } from '../data/content-types';

const REGISTER: Record<string, string> = {
  spoken: '口语',
  neutral: '中性',
  written: '书面',
};

const INTENSITY: Record<string, string> = {
  slight: '轻',
  steady: '中',
  sharp: '强',
  neutral: '中性',
};

interface ExpressionsProps {
  expressions: ExpressionView[];
  selectedCategory: string | null;
  onSelect: (category: string | undefined) => void;
}

export function Expressions({ expressions, selectedCategory, onSelect }: ExpressionsProps) {
  return (
    <section className="dv-section" id="expressions" aria-labelledby="expressions-title">
      <h2 id="expressions-title" className="dv-section-title">English expressions</h2>
      <div className="dv-expressions">
        {expressions.map((expression) => {
          const active = !!expression.category && expression.category === selectedCategory;
          return (
            <article className={`dv-expression ${active ? 'is-active' : ''}`} key={expression.id}>
              <button
                type="button"
                className="dv-expression-head"
                onClick={() => onSelect(expression.category)}
              >
                <span className="dv-expression-word">{expression.word}</span>
                <span className="dv-expression-meaning">{expression.meaning_zh}</span>
                <span className="dv-expression-meta">
                  {[
                    REGISTER[expression.register] ?? expression.register,
                    expression.intensity === 'neutral'
                      ? null
                      : INTENSITY[expression.intensity] ?? expression.intensity,
                  ]
                    .filter(Boolean)
                    .join('，')}
                </span>
              </button>
              <p className="dv-example">{expression.example}</p>
              <p className="dv-caution">{expression.caution_zh}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
