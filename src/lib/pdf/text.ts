import bidiFactory from "bidi-js";

const bidi = bidiFactory();

export type Direction = "rtl" | "ltr";

const ARABIC = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;

export const hasArabic = (value: string) => ARABIC.test(value);

export type VisualRun = { text: string; rtl: boolean };

/**
 * Splits one line into runs in the order they appear on paper, left to right.
 * The PDF engine shapes Arabic inside a run but knows nothing about mixing it
 * with Latin text and numbers.
 */
export const toVisualRuns = (line: string, base: Direction): VisualRun[] => {
  if (!line) return [];
  const { levels } = bidi.getEmbeddingLevels(line, base);
  const runs: Array<{ text: string; level: number }> = [];
  for (let i = 0; i < line.length; i += 1) {
    const level = levels[i];
    const rtl = level % 2 === 1;
    const char = rtl ? (bidi.getMirroredCharacter(line[i]) ?? line[i]) : line[i];
    const last = runs[runs.length - 1];
    if (last && last.level === level) last.text += char;
    else runs.push({ text: char, level });
  }
  // Unicode rule L2: from the highest level down, reverse every stretch at or above it.
  const highest = Math.max(...runs.map((run) => run.level));
  for (let level = highest; level > 0; level -= 1) {
    for (let start = 0; start < runs.length; start += 1) {
      if (runs[start].level < level) continue;
      let end = start;
      while (end + 1 < runs.length && runs[end + 1].level >= level) end += 1;
      runs.splice(start, end - start + 1, ...runs.slice(start, end + 1).reverse());
      start = end;
    }
  }
  return runs.map((run) => ({
    // A right-to-left run without Arabic letters (spaces, punctuation) is not
    // reversed by the shaper, so it is put in visual order here.
    text: run.level % 2 === 1 && !hasArabic(run.text) ? [...run.text].reverse().join("") : run.text,
    rtl: run.level % 2 === 1,
  }));
};

/** Greedy word wrap in logical order; words wider than the line are broken. */
export const wrapText = (value: string, width: number, measure: (text: string) => number): string[] => {
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r/g, "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      let rest = word;
      while (measure(rest) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut)) > width) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
};
