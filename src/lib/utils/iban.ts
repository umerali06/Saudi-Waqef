export const normalizeIban = (value?: string | null) => (value ?? "").replace(/\s+/g, "").toUpperCase();

/** Saudi IBAN: SA + 22 digits with a valid mod-97 checksum. */
export const isValidSaudiIban = (value: string) => {
  if (!/^SA\d{22}$/.test(value)) return false;
  const rearranged = `${value.slice(4)}2810${value.slice(2, 4)}`;
  let remainder = 0;
  for (const char of rearranged) remainder = (remainder * 10 + Number(char)) % 97;
  return remainder === 1;
};
