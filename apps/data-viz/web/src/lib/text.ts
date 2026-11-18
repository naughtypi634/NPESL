/** Space between Latin and Chinese, the way Chinese typography expects it. */
export function cjkSpace(text: string): string {
  const closing = /[。，、；：？！…—·」』）】》〉]/;
  const opening = /[「『（【《〈]/;
  return text
    .replace(/([A-Za-z0-9%\)])([㐀-鿿　-〿＀-￯])/g, (match, left, right) =>
      closing.test(right) ? match : `${left} ${right}`,
    )
    .replace(/([㐀-鿿　-〿＀-￯])([A-Za-z0-9\(])/g, (match, left, right) =>
      opening.test(left) ? match : `${left} ${right}`,
    )
    .replace(/ {2,}/g, ' ');
}

/** Capitalize the first letter of an English sentence. */
export function cap(text: string): string {
  const trimmed = (text || '').trim();
  return trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1) : trimmed;
}
