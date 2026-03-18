export interface DiffLine {
  type: "add" | "remove" | "context";
  text: string;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length, n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldLines[i - 1] === newLines[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "context", text: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "add", text: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: "remove", text: oldLines[i - 1] });
      i--;
    }
  }
  return result.reverse();
}

export function renderDiffHtml(lines: DiffLine[]): string {
  let addCount = 0, removeCount = 0;
  const rows = lines.map(l => {
    if (l.type === "add") addCount++;
    if (l.type === "remove") removeCount++;
    const cls = l.type === "add" ? "diff-add" : l.type === "remove" ? "diff-remove" : "diff-ctx";
    const prefix = l.type === "add" ? "+" : l.type === "remove" ? "-" : " ";
    return `<div class="${cls}"><span class="diff-prefix">${prefix}</span>${esc(l.text)}</div>`;
  }).join("\n");
  return `<div class="diff-summary">+${addCount} / -${removeCount} lines</div>\n${rows}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
