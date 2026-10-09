import { CAPACITY, COLS, ROWS, PAPER_NAMES, layoutText, pageLayoutOptions, type Notebook } from "./notebook.ts";
import { drawStroke } from "./ink.ts";
import { downloadFile, safeFilename } from "./download.ts";

export const PDF_WIDTH = 1654;
export const PDF_HEIGHT = 2339;
const FONT = '"Pretendard Variable", Pretendard, sans-serif';

/** One stored sheet is always one A4 PDF page, including its handwriting. */
export function renderNotebookPage(ctx: CanvasRenderingContext2D, notebook: Notebook, index: number, volume = 1, date = new Date()) {
  const page = notebook.pages[index];
  const bodyTop = 340, cell = (PDF_HEIGHT - bodyTop - 140) / ROWS;
  const bodyWidth = cell * COLS, bodyHeight = cell * ROWS, left = (PDF_WIDTH - bodyWidth) / 2;
  const text = (value: string, x: number, y: number, size: number, weight = 400, color = "#363431", align: CanvasTextAlign = "left") => {
    ctx.font = weight + " " + size + "px " + FONT; ctx.fillStyle = color;
    ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(value, x, y);
  };
  ctx.fillStyle = "#fffefd"; ctx.fillRect(0, 0, PDF_WIDTH, PDF_HEIGHT);
  text("한칸", left, 112, 36, 700, "#a45041");
  text(String(volume).padStart(2, "0") + "권 · " + String(index + 1).padStart(2, "0") + "장", left + bodyWidth, 112, 22, 400, "#a17c70", "right");
  const title = notebook.title.trim() || "제목 없는 글";
  let titleSize = 34, lines: string[] = [];
  const titleChars = Array.from(new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(title), t => t.segment);
  do {
    lines = []; let line = ""; ctx.font = "600 " + titleSize + "px " + FONT;
    for (const char of titleChars) {
      if (line && ctx.measureText(line + char).width > bodyWidth) { lines.push(line); line = char; } else line += char;
    }
    if (line) lines.push(line);
    if (lines.length <= 3 || titleSize <= 14) break;
    titleSize -= 2;
  } while (true);
  lines.forEach((value, row) => text(value, left, 180 + row * 42, titleSize, 600));
  text(new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date), left + bodyWidth, 302, 20, 400, "#9c8b83", "right");
  ctx.save(); ctx.translate(left, bodyTop);
  if (page.type !== "blank") {
    ctx.strokeStyle = page.type === "manuscript" ? "#ddb2a6" : "#c4d3db"; ctx.lineWidth = 1.15;
    const spacing = page.type === "manuscript" ? cell : cell / 2;
    ctx.beginPath();
    for (let x = 0; x <= bodyWidth + .1; x += spacing) { ctx.moveTo(x, 0); ctx.lineTo(x, bodyHeight); }
    for (let y = 0; y <= bodyHeight + .1; y += spacing) { ctx.moveTo(0, y); ctx.lineTo(bodyWidth, y); }
    ctx.stroke();
  }
  ctx.beginPath(); ctx.rect(0, 0, bodyWidth, bodyHeight); ctx.clip();
  const layout = layoutText(page.text, pageLayoutOptions(notebook, index));
  for (const item of layout.chars) {
    if (item.hidden || item.cell >= CAPACITY) continue;
    const x = (item.cell % COLS + (item.x ?? 0)) * cell, y = Math.floor(item.cell / COLS) * cell;
    const w = (item.width ?? 1) * cell;
    let size = cell * .57, tx = x + w / 2, ty = y + cell / 2, align: CanvasTextAlign = "center";
    if (item.shared) { size *= .85; tx = x + size * .1; align = "left"; }
    switch (item.placement) {
      case "punct-low": tx = x + size * .18; ty = y + cell - size * .56; align = "left"; break;
      case "punct-shared": tx = x + w - size * .1; ty = y + cell - size * .56; align = "right"; break;
      case "quote-open": tx = x + w - size * .15; ty = y + size * .65; align = "right"; break;
      case "quote-close": tx = x + size * .15; ty = y + size * .65; align = "left"; break;
      case "close-shared": tx = x + w - size * .08; ty = y + size * .59; align = "right"; break;
      case "mark-shared": size *= .85; tx = x + w - size * .02; align = "right"; break;
      case "ellipsis": ty -= size * .25; break;
      case "long-dash": ctx.fillStyle = "#363431"; ctx.fillRect(x + size * .2, y + cell / 2, w - size * .4, 1.5); continue;
    }
    text(item.display ?? item.char, tx, ty, size, 400, "#363431", align);
  }
  for (const stroke of page.strokes) drawStroke(ctx, stroke, bodyWidth, bodyHeight * (page.inkRows ?? 40) / ROWS);
  ctx.restore();
  text(PAPER_NAMES[page.type] + " · 1,200칸", left, PDF_HEIGHT - 98, 20, 400, "#a18b80");
  text(layout.used.toLocaleString("ko-KR") + " / 1,200칸 사용", left + bodyWidth, PDF_HEIGHT - 98, 20, 400, "#a18b80", "right");
}

async function canvasPage(notebook: Notebook, index: number, volume: number): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = PDF_WIDTH; canvas.height = PDF_HEIGHT;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PDF에 사용할 종이를 준비하지 못했어요.");
    renderNotebookPage(ctx, notebook, index, volume);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("종이를 PDF로 변환하지 못했어요.")), "image/jpeg", .94));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { canvas.width = 1; canvas.height = 1; }
}

export async function createNotebookPdf(notebook: Notebook, volume = 1, onProgress?: (page: number, total: number) => void, renderPage = canvasPage): Promise<Uint8Array> {
  const { PDFDocument } = await import("../vendor/pdf-lib.esm.min.js");
  const pdf = await PDFDocument.create();
  pdf.setTitle(notebook.title.trim() || "제목 없는 글"); pdf.setCreator("한칸"); pdf.setLanguage("ko-KR");
  for (let index = 0; index < notebook.pages.length; index++) {
    const bytes = await renderPage(notebook, index, volume);
    const image = await pdf.embedJpg(bytes);
    pdf.addPage([595.28, 841.89]).drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
    onProgress?.(index + 1, notebook.pages.length);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return pdf.save();
}

export async function downloadNotebookPdf(notebook: Notebook, volume: number, onProgress?: (page: number, total: number) => void) {
  await Promise.all([document.fonts.load('400 32px "Pretendard Variable"', "한칸 원고지"), document.fonts.load('600 34px "Pretendard Variable"', notebook.title || "한칸")]);
  await document.fonts.ready;
  const bytes = await createNotebookPdf(notebook, volume, onProgress);
  downloadFile(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), safeFilename(notebook.title) + ".pdf");
}

