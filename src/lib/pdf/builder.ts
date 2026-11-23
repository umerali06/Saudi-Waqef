import path from "path";
import PDFDocument from "pdfkit";
import { hasArabic, toVisualRuns, wrapText, type Direction } from "@/lib/pdf/text";

const FONT_DIR = path.join(process.cwd(), "src", "lib", "pdf", "fonts");
const REGULAR = path.join(FONT_DIR, "IBMPlexSansArabic-Regular.ttf");
const SEMIBOLD = path.join(FONT_DIR, "IBMPlexSansArabic-SemiBold.ttf");

export const INK = "#12202f";
export const MUTED = "#5a6878";
export const RULE = "#d5dbe2";
export const WASH = "#f3f5f8";

export type Align = "start" | "center" | "end" | "left" | "right";

export type TextStyle = {
  size?: number;
  bold?: boolean;
  color?: string;
  align?: Align;
  direction?: Direction;
  lineGap?: number;
};

export type Column = {
  header: string;
  width: number;
  align?: Align;
  bold?: boolean;
};

type FooterContext = { page: number; pages: number };

/**
 * A4 document builder with correct Arabic. Columns and alignment follow the
 * document direction: "start" is the right edge in Arabic.
 */
export class PdfBuilder {
  readonly doc: PDFKit.PDFDocument;
  readonly margin: number;
  readonly direction: Direction;
  y: number;
  /** Widths at 1000pt per weight: shaping Arabic is slow and the same words recur constantly. */
  private readonly widths = new Map<string, number>();
  private readonly faces = new Map<string, unknown>();
  private readonly wrapped = new Map<string, string[]>();
  private readonly chunks: Buffer[] = [];
  private readonly done: Promise<Buffer>;
  private readonly footer?: (context: FooterContext) => string;
  private readonly bottom: number;

  constructor(options: {
    direction: Direction;
    title: string;
    author?: string;
    landscape?: boolean;
    margin?: number;
    /** Emits PDF/A-3, the archival format that may carry the e-invoice XML. */
    archival?: boolean;
    footer?: (context: FooterContext) => string;
  }) {
    this.margin = options.margin ?? 40;
    this.direction = options.direction;
    this.footer = options.footer;
    this.doc = new PDFDocument({
      size: "A4",
      layout: options.landscape ? "landscape" : "portrait",
      margins: { top: this.margin, bottom: 0, left: this.margin, right: this.margin },
      bufferPages: true,
      font: REGULAR,
      ...(options.archival ? { pdfVersion: "1.7" as const, subset: "PDF/A-3b" as const } : {}),
      info: { Title: options.title, Author: options.author ?? "", Creator: "Saudi Waqef" },
    });
    this.doc.registerFont("regular", REGULAR);
    this.doc.registerFont("semibold", SEMIBOLD);
    this.done = new Promise((resolve, reject) => {
      this.doc.on("data", (chunk: Buffer) => this.chunks.push(chunk));
      this.doc.on("end", () => resolve(Buffer.concat(this.chunks)));
      this.doc.on("error", reject);
    });
    this.y = this.margin;
    this.bottom = this.doc.page.height - this.margin - 18;
  }

  get width() {
    return this.doc.page.width - this.margin * 2;
  }

  get remaining() {
    return this.bottom - this.y;
  }

  newPage() {
    this.doc.addPage();
    this.y = this.margin;
  }

  ensure(height: number) {
    if (this.y + height > this.bottom) {
      this.newPage();
      return true;
    }
    return false;
  }

  private font(style: TextStyle) {
    const name = style.bold ? "semibold" : "regular";
    // doc.font() re-reads and re-parses the font file on every call, so a face
    // is opened once and then put back directly.
    const doc = this.doc as PDFKit.PDFDocument & { _font: unknown };
    const face = this.faces.get(name);
    if (face) doc._font = face;
    else {
      doc.font(name);
      this.faces.set(name, doc._font);
    }
    doc.fontSize(style.size ?? 9);
  }

  measure(text: string, style: TextStyle = {}) {
    const direction = style.direction ?? this.direction;
    let width = 0;
    // Letters never join across a space, so a line is as wide as its words.
    text.split(" ").forEach((word, index) => {
      if (index > 0) width += this.wordWidth(" ", style.bold, direction);
      if (word) width += this.wordWidth(word, style.bold, direction);
    });
    return (width * (style.size ?? 9)) / 1000;
  }

  private wordWidth(word: string, bold: boolean | undefined, direction: Direction) {
    const key = `${bold ? "b" : "r"}${direction}${word}`;
    const known = this.widths.get(key);
    if (known !== undefined) return known;
    const width = toVisualRuns(word, direction).reduce((sum, run) => sum + this.tokenWidth(run.text, bold), 0);
    this.widths.set(key, width);
    return width;
  }

  private tokenWidth(token: string, bold?: boolean) {
    const key = `${bold ? "B" : "R"}${token}`;
    const known = this.widths.get(key);
    if (known !== undefined) return known;
    this.font({ bold, size: 1000 });
    const width = this.doc.widthOfString(token);
    this.widths.set(key, width);
    return width;
  }

  private lineHeight(style: TextStyle) {
    return (style.size ?? 9) * 1.45 + (style.lineGap ?? 0);
  }

  lines(text: string, width: number, style: TextStyle = {}) {
    const key = `${style.size ?? 9}|${style.bold ? 1 : 0}|${style.direction ?? this.direction}|${width.toFixed(2)}|${text}`;
    let lines = this.wrapped.get(key);
    if (!lines) {
      lines = wrapText(text, width, (value) => this.measure(value, style));
      this.wrapped.set(key, lines);
    }
    return lines;
  }

  heightOf(text: string, width: number, style: TextStyle = {}) {
    return this.lines(text, width, style).length * this.lineHeight(style);
  }

  /** Physical x of a box that starts `offset` from the reading edge. */
  boxX(offset: number, width: number) {
    return this.direction === "rtl"
      ? this.doc.page.width - this.margin - offset - width
      : this.margin + offset;
  }

  /** Draws wrapped text inside a physical box and returns the height used. */
  text(text: string, x: number, y: number, width: number, style: TextStyle = {}) {
    const direction = style.direction ?? this.direction;
    const align = style.align ?? "start";
    const physical =
      align === "start" ? (this.direction === "rtl" ? "right" : "left")
      : align === "end" ? (this.direction === "rtl" ? "left" : "right")
      : align;
    const height = this.lineHeight(style);
    const lines = this.lines(text, width, style);
    lines.forEach((line, index) => {
      const lineWidth = this.measure(line, style);
      let cursor =
        physical === "right" ? x + width - lineWidth : physical === "center" ? x + (width - lineWidth) / 2 : x;
      this.font(style);
      this.doc.fillColor(style.color ?? INK);
      const size = style.size ?? 9;
      for (const run of toVisualRuns(line, direction)) {
        // Word by word, because the engine caches the shaping of single words
        // only. The words of an Arabic run go on paper last one first.
        const tokens = run.text.split(/( )/).filter(Boolean);
        if (run.rtl && hasArabic(run.text)) tokens.reverse();
        for (const token of tokens) {
          const advance = (this.tokenWidth(token, style.bold) * size) / 1000;
          this.font(style);
          if (token !== " ") this.doc.text(token, cursor, y + index * height, { lineBreak: false });
          cursor += advance;
        }
      }
    });
    return lines.length * height;
  }

  /** Full-width paragraph at the current position. */
  paragraph(text: string, style: TextStyle = {}) {
    const height = this.heightOf(text, this.width, style);
    this.ensure(height);
    this.text(text, this.margin, this.y, this.width, style);
    this.y += height;
  }

  rule(color = RULE, thickness = 0.7) {
    this.doc
      .moveTo(this.margin, this.y)
      .lineTo(this.margin + this.width, this.y)
      .lineWidth(thickness)
      .strokeColor(color)
      .stroke();
  }

  fill(x: number, y: number, width: number, height: number, color: string) {
    this.doc.rect(x, y, width, height).fillColor(color).fill();
  }

  /** Table that repeats its header on every page. Widths are shares of the full width. */
  table(
    columns: Column[],
    rows: Array<{ cells: string[]; bold?: boolean; muted?: boolean; topRule?: boolean }>,
    options: { size?: number; headerFill?: string; headerColor?: string; padding?: number; zebra?: boolean } = {}
  ) {
    const size = options.size ?? 8.5;
    const padding = options.padding ?? 5;
    const total = columns.reduce((sum, column) => sum + column.width, 0);
    const widths = columns.map((column) => (column.width / total) * this.width);
    const offsets = widths.map((_, index) => widths.slice(0, index).reduce((sum, value) => sum + value, 0));

    const draw = (cells: string[], style: (column: Column) => TextStyle, fill?: string) => {
      const heights = cells.map((cell, index) =>
        this.heightOf(cell, widths[index] - padding * 2, style(columns[index]))
      );
      const height = Math.max(...heights) + padding * 2;
      if (fill) this.fill(this.margin, this.y, this.width, height, fill);
      cells.forEach((cell, index) => {
        this.text(cell, this.boxX(offsets[index], widths[index]) + padding, this.y + padding, widths[index] - padding * 2, style(columns[index]));
      });
      this.y += height;
      return height;
    };
    const header = () => {
      draw(
        columns.map((column) => column.header),
        (column) => ({ size: size - 0.5, bold: true, color: options.headerColor ?? MUTED, align: column.align }),
        options.headerFill ?? WASH
      );
      this.rule();
    };

    this.ensure(60);
    header();
    rows.forEach((row, rowIndex) => {
      const style = (column: Column): TextStyle => ({
        size,
        bold: row.bold || column.bold,
        color: row.muted ? MUTED : INK,
        align: column.align,
      });
      const height =
        Math.max(
          ...row.cells.map((cell, index) => this.heightOf(cell, widths[index] - padding * 2, style(columns[index])))
        ) +
        padding * 2;
      if (this.ensure(height)) header();
      if (row.topRule) this.rule(INK, 0.9);
      draw(row.cells, style, options.zebra && rowIndex % 2 === 1 ? "#fafbfc" : undefined);
      this.rule();
    });
  }

  async finish() {
    const range = this.doc.bufferedPageRange();
    if (this.footer) {
      for (let i = 0; i < range.count; i += 1) {
        this.doc.switchToPage(range.start + i);
        const y = this.doc.page.height - this.margin - 4;
        this.text(this.footer({ page: i + 1, pages: range.count }), this.margin, y, this.width, {
          size: 7.5,
          color: MUTED,
          align: "center",
        });
      }
    }
    this.doc.end();
    return this.done;
  }
}
