import type { EngineFeature } from '../engine';
import type { Gallery, GoalId, LearnerLevel, Library, View } from '../data/types';
import { featureSummary } from '../lib/feature-summary';
import {
  chineseForLevel,
  generatedParagraph,
  generatedRegister,
  overviewFor,
  paragraphFor,
  sentenceForLevel,
  usablePattern,
} from '../lib/level';
import { kindLabel } from '../lib/features';
import { goalLabel } from '../lib/goals';
import { cjkSpace } from '../lib/text';
import { Badge, Button } from './ui';

const REGISTER_LABELS: Record<string, string> = {
  spoken: '口语',
  neutral: '中性',
  written: '书面',
};

interface Props {
  view: View;
  library: Library | null;
  features: EngineFeature[];
  feature: EngineFeature | undefined;
  author: EngineFeature | undefined;
  edited: boolean;
  goal?: GoalId;
  gallery: Gallery;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

function LevelBlock({
  level,
  feature,
  library,
}: {
  level: LearnerLevel;
  feature: EngineFeature;
  library: Library | null;
}) {
  const entry = library?.features?.[feature.kind];
  const pattern = usablePattern(entry, feature, level);
  if (!pattern) return null;
  const sentence = sentenceForLevel(feature, library, level);
  const chinese = cjkSpace(chineseForLevel(feature, library, level));
  if (!sentence) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
        {level === 'basic' ? 'Basic' : 'Advanced'}
      </div>
      <div className="text-[14px] leading-relaxed text-[var(--fg)]">{sentence}</div>
      {chinese && <div className="text-[12px] leading-relaxed text-[var(--muted)]">{chinese}</div>}
    </div>
  );
}

export function InsightPanel({
  view,
  library,
  features,
  feature,
  author,
  edited,
  goal,
  gallery,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: Props) {
  if (!feature) {
    return (
      <div className="card rounded-[var(--radius-card)] p-4 text-sm text-[var(--muted)]">
        点图上的一个点、一段线、一根柱子或一个格子，看看这处变化怎么说。
      </div>
    );
  }

  const entry = library?.features?.[feature.kind];
  const label = kindLabel(feature.kind, library);
  const summary = featureSummary(feature, view);
  const showAuthor = !!author && !edited;
  const authorExample = showAuthor ? author.examples?.[0] : undefined;
  const generated = sentenceForLevel(feature, library, 'basic');
  const generatedZh = chineseForLevel(feature, library, 'basic');
  const basicSentence = generated;
  const sentence = authorExample?.en || generated;
  const chinese = cjkSpace(authorExample?.zh || generatedZh);
  const source = showAuthor && authorExample ? '原句' : '自动生成';
  const overview = cjkSpace(overviewFor(view, features, library, edited));
  const basicParagraph = edited
    ? generatedParagraph(view, features, library, 'basic')
    : paragraphFor(view, 'basic');
  const advancedParagraph = edited
    ? generatedParagraph(view, features, library, 'advanced')
    : paragraphFor(view, 'advanced');
  const ielts = edited
    ? generatedRegister(view, features, library, 'ielts')
    : view.descriptions?.ielts ?? '';
  const business = edited
    ? generatedRegister(view, features, library, 'business')
    : view.descriptions?.business ?? '';
  const goalText = goal ? goalLabel(gallery, goal) : '';

  return (
    <div className="card flex flex-col gap-5 rounded-[var(--radius-card)] p-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--muted)]">这处变化怎么说</h2>
          {goalText && <Badge>{goalText}</Badge>}
          <Badge>{source}</Badge>
        </div>
        <div className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--fg)]">{label}</div>
        {summary && <div className="text-[13px] leading-relaxed text-[var(--muted)]">{summary}</div>}
      </div>

      {(sentence || chinese) && (
        <div className="flex flex-col gap-1.5 rounded-[var(--radius-control)] bg-[var(--pane-solid)] p-3">
          {sentence && (
            <div className="text-[15px] leading-relaxed text-[var(--fg)]">{sentence}</div>
          )}
          {chinese && <div className="text-[13px] leading-relaxed text-[var(--muted)]">{chinese}</div>}
        </div>
      )}

      {edited && author && (
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          原句是按原始数据写的，改数据后已隐藏；上面这句按当前数据显示。
        </p>
      )}

      {showAuthor && author?.note_zh && (
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">{cjkSpace(author.note_zh)}</p>
      )}
      {showAuthor && author?.interpret_zh && (
        <div className="flex flex-col gap-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            怎么读
          </div>
          <p className="text-[12px] leading-relaxed text-[var(--muted)]">
            {cjkSpace(author.interpret_zh)}
          </p>
        </div>
      )}

      {!!entry?.words?.length && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            常用词
          </div>
          <div className="flex flex-col gap-1.5">
            {entry.words.map((word) => (
              <div key={word.en} className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] font-medium text-[var(--fg)]">{word.en}</span>
                <span className="text-[12px] text-[var(--muted)]">{word.zh}</span>
                <span className="text-[10px] text-[var(--muted)]">
                  {REGISTER_LABELS[word.register] ?? word.register}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!entry?.traps?.length && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
            容易说错的点
          </div>
          {entry.traps.map((trap) => (
            <div key={`${trap.wrong_en}-${trap.right_en}`} className="flex flex-col gap-1">
              <div className="text-[12px] leading-relaxed text-[var(--muted)] line-through">
                {trap.wrong_en}
              </div>
              <div className="text-[13px] leading-relaxed text-[var(--fg)]">{trap.right_en}</div>
              <div className="text-[12px] leading-relaxed text-[var(--muted)]">
                {cjkSpace(trap.why_zh)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {basicSentence && basicSentence !== sentence && (
          <LevelBlock level="basic" feature={feature} library={library} />
        )}
        <LevelBlock level="advanced" feature={feature} library={library} />
      </div>

      <details className="group flex flex-col gap-2">
        <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          整张图怎么说
        </summary>
        <div className="mt-2 flex flex-col gap-3">
          {overview && <p className="text-[12px] leading-relaxed text-[var(--muted)]">{overview}</p>}
          {basicParagraph && (
            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-semibold text-[var(--muted)]">Basic</div>
              <p className="text-[13px] leading-relaxed text-[var(--fg)]">{basicParagraph}</p>
            </div>
          )}
          {advancedParagraph && (
            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-semibold text-[var(--muted)]">Advanced</div>
              <p className="text-[13px] leading-relaxed text-[var(--fg)]">{advancedParagraph}</p>
            </div>
          )}
          {ielts && (
            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-semibold text-[var(--muted)]">IELTS</div>
              <p className="text-[13px] leading-relaxed text-[var(--fg)]">{ielts}</p>
            </div>
          )}
          {business && (
            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-semibold text-[var(--muted)]">Business</div>
              <p className="text-[13px] leading-relaxed text-[var(--fg)]">{business}</p>
            </div>
          )}
        </div>
      </details>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--rule)] pt-3">
        <Button onClick={onPrev} disabled={!hasPrev}>
          上一处
        </Button>
        <Button onClick={onNext} disabled={!hasNext}>
          下一处
        </Button>
      </div>
    </div>
  );
}
