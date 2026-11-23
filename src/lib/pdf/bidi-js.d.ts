declare module "bidi-js" {
  type Levels = {
    levels: Uint8Array;
    paragraphs: Array<{ start: number; end: number; level: number }>;
  };
  export default function bidiFactory(): {
    getEmbeddingLevels(text: string, baseDirection?: "ltr" | "rtl" | "auto"): Levels;
    getMirroredCharacter(char: string): string | null;
  };
}
