// Small line diff for the Prompt Lab's "compare with the model answer" view. Pure.

/** Line diff (LCS) of `a` (yours) → `b` (model): '=' same, '-' only yours, '+' only the model's. */
export function lineDiff(a: string, b: string): { op: '=' | '-' | '+'; text: string }[] {
  const x = a.split('\n');
  const y = b.split('\n');
  // keep it cheap on very long prompts
  if (x.length * y.length > 250_000) return [...x.map((text) => ({ op: '-' as const, text })), ...y.map((text) => ({ op: '+' as const, text }))];
  const same = (i: number, j: number) => x[i].trim() === y[j].trim();
  const L: number[][] = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) L[i][j] = same(i, j) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { op: '=' | '-' | '+'; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (same(i, j)) {
      out.push({ op: '=', text: y[j] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: '-', text: x[i++] });
    else out.push({ op: '+', text: y[j++] });
  }
  while (i < x.length) out.push({ op: '-', text: x[i++] });
  while (j < y.length) out.push({ op: '+', text: y[j++] });
  return out;
}
