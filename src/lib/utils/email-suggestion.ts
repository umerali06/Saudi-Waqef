const COMMON_DOMAINS = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "outlook.sa", "live.com"];

/** Edit distance counting a swap of neighbouring letters as one mistake. */
const distance = (a: string, b: string) => {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
};

/** Suggests the intended address when a well-known mail domain is one typo away. */
export const suggestEmail = (email: string): string | null => {
  const match = email.trim().match(/^([^\s@]+)@([^\s@]+\.[^\s@]{2,})$/);
  if (!match) return null;
  const domain = match[2].toLowerCase();
  if (COMMON_DOMAINS.includes(domain)) return null;
  const intended = COMMON_DOMAINS.find((candidate) => distance(domain, candidate) === 1);
  return intended ? `${match[1]}@${intended}` : null;
};
