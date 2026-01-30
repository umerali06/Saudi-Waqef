type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

export function parseCsv(input: string): ParsedCsv {
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

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === "\"") {
      const nextChar = input[i + 1];
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
      if (char === "\r" && input[i + 1] === "\n") {
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
    headers: headers.map((header) => header.trim()),
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
  return lines.join("\n");
}
