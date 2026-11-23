export type PostingLine = {
  accountId: string;
  debit: number;
  credit: number;
};

export function isBalanced(lines: PostingLine[]) {
  const difference = lines.reduce((sum, line) => sum + line.debit - line.credit, 0);
  return Math.abs(difference) < 0.01;
}

export function reverseLines(lines: PostingLine[]): PostingLine[] {
  return lines.map((line) => ({
    accountId: line.accountId,
    debit: line.credit,
    credit: line.debit,
  }));
}
