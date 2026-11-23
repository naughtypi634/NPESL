import { useEffect, useMemo, useState } from 'react';

import type {
  CatalogGroup,
  CatalogLesson,
  ContentBundle,
  LessonFile,
  QuestionView,
} from '../data/content-types';
import { ChartStage } from '../charts/ChartStage';
import { buildCategoryValueFacts, withSeriesValues } from '../engine/facts';
import { buildExpressions } from '../engine/phrases';
import { buildQuestions } from '../engine/questions';
import { buildSentenceLevels } from '../engine/sentences';
import { useViewportSize } from '../lib/use-viewport';
import { Expressions } from '../lesson/Expressions';
import { Observe } from '../lesson/Observe';
import { Playground } from '../lesson/Playground';
import { SentenceBuilder } from '../lesson/SentenceBuilder';

interface LessonProps {
  bundle: ContentBundle;
  lesson: LessonFile;
  catalogLesson: CatalogLesson;
  group: CatalogGroup;
  edits: Record<string, number[]> | undefined;
  onEdit: (seriesId: string, values: number[]) => void;
  onReset: () => void;
  selectedCategory: string | null;
  onSelectCategory: (category: string | undefined) => void;
  onBack: () => void;
}

export function Lesson({
  bundle,
  lesson,
  catalogLesson,
  group,
  edits,
  onEdit,
  onReset,
  selectedCategory,
  onSelectCategory,
  onBack,
}: LessonProps) {
  const dataset = bundle.datasets[lesson.dataset];
  const phraseFile = bundle.phrases[lesson.phrase_family];
  const focusId = lesson.chart.focus_series;
  const seriesValues = useMemo(() => {
    const base = Object.fromEntries(
      dataset.series.map((series) => [series.id, series.values]),
    );
    if (!edits) return base;
    for (const series of dataset.series) {
      const values = edits[series.id];
      if (values && values.length === dataset.categories.length) base[series.id] = values;
    }
    return base;
  }, [dataset.series, dataset.categories.length, edits]);
  const edited = !!edits;
  const [activeSeries, setActiveSeries] = useState(focusId);

  const facts = useMemo(
    () =>
      buildCategoryValueFacts(
        withSeriesValues(dataset, seriesValues),
        focusId,
        lesson.chart.compare_series,
      ),
    [dataset, seriesValues, focusId, lesson.chart.compare_series],
  );
  const expressions = useMemo(() => buildExpressions(phraseFile, facts), [phraseFile, facts]);
  const levels = useMemo(() => buildSentenceLevels(facts), [facts]);
  const questions = useMemo(() => buildQuestions(facts), [facts]);

  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('step-playground');
  const { width, height } = useViewportSize();
  const pinned = width >= 1024 && height >= 600;
  const chartHeight = width < 720 ? 320 : 440;

  useEffect(() => {
    const ids = ['step-playground', 'step-observe', 'step-expressions', 'step-build'];
    const update = () => {
      const viewTop = window.scrollY;
      const viewBottom = viewTop + window.innerHeight;
      let current = ids[0];
      let best = 0;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        const top = rect.top + viewTop;
        const bottom = rect.bottom + viewTop;
        const overlap = Math.min(bottom, viewBottom) - Math.max(top, viewTop);
        if (overlap > best) {
          best = overlap;
          current = id;
        }
      }
      setActiveSection(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [pinned]);

  const toggleQuestion = (question: QuestionView) => {
    if (openQuestionId === question.id) {
      setOpenQuestionId(null);
      onSelectCategory(undefined);
      return;
    }
    setOpenQuestionId(question.id);
    onSelectCategory(question.category);
  };

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY - (pinned ? 64 : 88);
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  return (
    <main className="dv-lesson">
      <div className={`dv-lesson-layout ${pinned ? 'is-pinned' : ''}`}>
        <header className="dv-lesson-head">
          <div className="dv-lesson-top">
            <button type="button" className="dv-back" onClick={onBack}>
              All charts
            </button>
            <span className="dv-breadcrumb">
              {group.title_en} / {catalogLesson.title_en}
            </span>
          </div>
          <h1>{catalogLesson.question_en}</h1>
          <p className="dv-subtitle">{catalogLesson.question_zh}</p>
          <p className="dv-intro">{lesson.intro_en}</p>
          <p className="dv-intro-zh">{lesson.intro_zh}</p>
        </header>

        <div className="dv-lesson-stage">
          <ChartStage
            dataset={facts.dataset}
            facts={facts}
            seriesValues={seriesValues}
            height={chartHeight}
            pinned={pinned}
            selectedCategory={selectedCategory}
            onSelectCategory={(category) => onSelectCategory(category)}
            onSeriesValuesChange={onEdit}
            onActiveSeriesChange={setActiveSeries}
          />
        </div>

        <div className="dv-lesson-reading">
          <nav className="dv-section-nav" aria-label="Lesson sections">
            <button
              type="button"
              className={activeSection === 'step-playground' ? 'is-active' : undefined}
              aria-current={activeSection === 'step-playground' ? 'true' : undefined}
              aria-label="Change the data"
              onClick={() => scrollTo('step-playground')}
            >
              Data
            </button>
            <button
              type="button"
              className={activeSection === 'step-observe' ? 'is-active' : undefined}
              aria-current={activeSection === 'step-observe' ? 'true' : undefined}
              aria-label="What can you see?"
              onClick={() => scrollTo('step-observe')}
            >
              See
            </button>
            <button
              type="button"
              className={activeSection === 'step-expressions' ? 'is-active' : undefined}
              aria-current={activeSection === 'step-expressions' ? 'true' : undefined}
              aria-label="English expressions"
              onClick={() => scrollTo('step-expressions')}
            >
              Say
            </button>
            <button
              type="button"
              className={activeSection === 'step-build' ? 'is-active' : undefined}
              aria-current={activeSection === 'step-build' ? 'true' : undefined}
              aria-label="Sentence building"
              onClick={() => scrollTo('step-build')}
            >
              Build
            </button>
          </nav>

          <div className="dv-step" id="step-playground">
            <Playground
              dataset={dataset}
              series={dataset.series.map((series) => ({
                id: series.id,
                label: series.label_en,
              }))}
              activeSeries={activeSeries}
              valuesBySeries={seriesValues}
              edited={edited}
              min={lesson.playground.min}
              max={lesson.playground.max}
              step={lesson.playground.step}
              presets={lesson.playground.presets}
              onSeriesChange={setActiveSeries}
              onChange={onEdit}
              onReset={onReset}
            />
          </div>

          <div className="dv-step" id="step-observe">
            <Observe questions={questions} openId={openQuestionId} onToggle={toggleQuestion} />
          </div>

          <div className="dv-step" id="step-expressions">
            <Expressions
              expressions={expressions}
              selectedCategory={selectedCategory}
              onSelect={(category) => onSelectCategory(category)}
            />
          </div>

          <div className="dv-step" id="step-build">
            <SentenceBuilder levels={levels} />
          </div>
        </div>
      </div>
    </main>
  );
}
