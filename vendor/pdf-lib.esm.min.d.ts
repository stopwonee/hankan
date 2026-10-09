export interface PDFImage { width: number; height: number }
export interface PDFPage { drawImage(image: PDFImage, options: { x: number; y: number; width: number; height: number }): void }
export class PDFDocument {
  static create(): Promise<PDFDocument>;
  static load(bytes: Uint8Array | ArrayBuffer): Promise<PDFDocument>;
  setTitle(title: string): void;
  setCreator(creator: string): void;
  setLanguage(language: string): void;
  addPage(size: [number, number]): PDFPage;
  embedJpg(bytes: Uint8Array | ArrayBuffer): Promise<PDFImage>;
  getPageCount(): number;
  save(): Promise<Uint8Array>;
}

