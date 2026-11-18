export function ChartTip({
  x,
  y,
  html,
}: {
  x: number;
  y: number;
  html: string;
}) {
  return (
    <div
      className="dv-chart-tip"
      style={{ left: x + 12, top: y + 12 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
