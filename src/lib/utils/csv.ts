type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

const UTF8_BOM = "\uFEFF";

export function parseCsv(input: string): ParsedCsv {
  const normalizedInput =
    input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let current: string[] = [];
  let value = "";
  let inQuotes = false;

  const pushValue = () => {
    current.push(value);
    value = "";
  };

  const pushRow = () => {
    rows.push(current);
    current = [];
  };

  for (let i = 0; i < normalizedInput.length; i += 1) {
    const char = normalizedInput[i];
    if (char === "\"") {
      const nextChar = normalizedInput[i + 1];
      if (inQuotes && nextChar === "\"") {
        value += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      pushValue();
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && normalizedInput[i + 1] === "\n") {
        i += 1;
      }
      pushValue();
      pushRow();
      continue;
    }
    value += char;
  }

  pushValue();
  if (current.length > 1 || current[0] !== "") {
    pushRow();
  }

  const headers = rows.shift() ?? [];
  return {
    headers: headers.map((header) => header.replace(/^\uFEFF/, "").trim()),
    rows: rows.filter((row) => row.some((cell) => cell.trim() !== "")),
  };
}

export function toCsv(headers: string[], rows: string[][]) {
  const escapeValue = (value: string) => {
    const needsQuotes = value.includes(",") || value.includes("\"") || value.includes("\n");
    const escaped = value.replace(/\"/g, "\"\"");
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const lines = [
    headers.map(escapeValue).join(","),
    ...rows.map((row) => row.map((cell) => escapeValue(cell)).join(",")),
  ];
  return `${UTF8_BOM}${lines.join("\n")}`;
}
