import type { QuestionView } from '../data/content-types';

interface ObserveProps {
  questions: QuestionView[];
  openId: string | null;
  onToggle: (question: QuestionView) => void;
}

export function Observe({ questions, openId, onToggle }: ObserveProps) {
  return (
    <section className="dv-section" id="observe" aria-labelledby="observe-title">
      <h2 id="observe-title" className="dv-section-title">What can you see?</h2>
      <div className="dv-questions">
        {questions.map((question) => {
          const open = openId === question.id;
          return (
            <div className={`dv-question ${open ? 'is-open' : ''}`} key={question.id}>
              <button
                type="button"
                className="dv-question-button"
                aria-expanded={open}
                aria-controls={`answer-${question.id}`}
                onClick={() => onToggle(question)}
              >
                <span>{question.prompt_en}</span>
                <span className="dv-question-mark" aria-hidden="true">
                  {open ? '−' : '+'}
                </span>
              </button>
              {open && (
                <p className="dv-answer" id={`answer-${question.id}`}>
                  {question.answer_en}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
