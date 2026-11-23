import { lessonBySlug } from '../data/lessons';
import { ChapterPage } from './ChapterPage';
import { IndexPage } from './IndexPage';
import { ThemeToggle } from './ThemeToggle';

/**
 * 31 个入口共用这一个挂载点：`#root` 上的 data-page / data-slug 由
 * scripts/build-entries.mjs 写进去，决定渲染目录页还是某一章。
 */
export function Page({ root }: { root: HTMLElement }) {
  if (root.dataset.page !== 'chapter') {
    return (
      <>
        <IndexPage />
        <ThemeToggle />
      </>
    );
  }

  const lesson = lessonBySlug(root.dataset.slug ?? '');
  if (!lesson) {
    return (
      <>
        <p className="empty">找不到这一章。</p>
        <ThemeToggle />
      </>
    );
  }
  return <ChapterPage lesson={lesson} />;
}
