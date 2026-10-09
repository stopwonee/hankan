export const COLS = 25;
export const ROWS = 48;
export const CAPACITY = COLS * ROWS;
export const MAX_PAGES = 12;
export const MAX_BOOKS = 3;
export type PaperType = "manuscript" | "blank" | "graph";
export type InkPoint = { x: number; y: number; p: number };
export type Stroke = { id: string; color: string; width: number; points: InkPoint[] };
export type Page = { id: string; type: PaperType; text: string; strokes: Stroke[]; typesetting?: 1; continued?: boolean; inkRows?: 40 | 48 };
export type Notebook = { title: string; pages: Page[] };
export type Bookshelf = { books: Notebook[] };
export const PAPER_NAMES: Record<PaperType, string> = { manuscript: "원고지", blank: "백지", graph: "모눈종이" };
const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
export function newPage(type: PaperType = "manuscript"): Page {
  return { id: crypto.randomUUID(), type, text: "", strokes: [], typesetting: 1, inkRows: 48 };
}
export function newNotebook(): Notebook { return { title: "", pages: [newPage()] }; }
export function newBookshelf(): Bookshelf { return { books: [newNotebook()] }; }
export function addBook(shelf: Bookshelf) {
  if (shelf.books.length >= MAX_BOOKS) return { accepted: false as const, shelf };
  return { accepted: true as const, shelf: { books: [...shelf.books, newNotebook()] } };
}
export function updateBook(shelf: Bookshelf, index: number, notebook: Notebook): Bookshelf {
  return { books: shelf.books.map((book, i) => i === index ? notebook : book) };
}
export function normalizeText(text: string) { return text.replace(/\r\n?/g, "\n").replace(/\t/g, " "); }
export function countText(text: string, withSpaces = true) {
  return Array.from(segmenter.segment(text.replace(withSpaces ? /[\r\n]/g : /\s/g, ""))).length;
}
export type CellChar = {
  char: string; cell: number; offset: number; end: number; usedAfter: number;
  display?: string; placement?: string; x?: number; width?: number; hidden?: boolean; shared?: boolean;
};
export type LayoutState = { paragraphStart: boolean; quotes: string[]; quotedParagraph: boolean; pendingGap: boolean; suppressSpace: boolean };
export type LayoutOptions = { manuscript?: boolean; state?: LayoutState };
const initialLayoutState = (): LayoutState => ({ paragraphStart: true, quotes: [], quotedParagraph: false, pendingGap: false, suppressSpace: false });
const quotePairs: Record<string, string> = { "“": "”", "‘": "’", "「": "」", "『": "』", '"': '"', "'": "'" };
const openingBrackets = new Set(["(", "[", "{", "<", "〈", "《", "【", "〔"]);
const closingBrackets = new Set([")", "]", "}", ">", "〉", "》", "】", "〕"]);
const lowerOrDigit = (char: string) => /^[a-z]$/.test(char) ? "lower" : /^[0-9]$/.test(char) ? "digit" : null;
const isSpace = (char: string) => char === " " || char === "\u3000";

/** Layout only: source spaces, punctuation and UTF-16 offsets remain unchanged. */
export function layoutText(text: string, options: LayoutOptions = {}) {
  let cell = 0;
  const chars: CellChar[] = [];
  const state = { ...(options.state ?? initialLayoutState()), quotes: [...(options.state?.quotes ?? [])] };
  const tokens = Array.from(segmenter.segment(text));
  let indentDone = !state.paragraphStart;
  let paragraphHasText = !state.paragraphStart;
  let previousVisible: CellChar | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], char = token.segment;
    const entry: CellChar = { char, cell, offset: token.index, end: token.index + char.length, usedAfter: cell };
    if (!options.manuscript) {
      cell += char === "\n" ? COLS - cell % COLS : 1;
      chars.push({ ...entry, usedAfter: cell, hidden: char === "\n" });
      continue;
    }
    const previous = chars.at(-1);
    const push = () => {
      entry.usedAfter = cell; chars.push(entry);
      if (!entry.hidden && !isSpace(char)) previousVisible = entry;
    };
    if (char === "\n") {
      entry.hidden = true;
      if (cell % COLS || !paragraphHasText) cell += COLS - cell % COLS;
      state.paragraphStart = true; state.pendingGap = false; state.suppressSpace = false;
      indentDone = false; paragraphHasText = false;
      push(); continue;
    }
    // A two-character number/lowercase group is one cell, even at a row boundary.
    if (previous?.placement === "half-left" && lowerOrDigit(previous.char) === lowerOrDigit(char) && lowerOrDigit(char)) {
      entry.cell = previous.cell; entry.x = .5; entry.width = .5; entry.placement = "half-right";
      push(); continue;
    }
    // Three ASCII dots form one ellipsis cell; a six-dot ellipsis forms two.
    if (char === "." && previous?.char === "." && previous.placement === "ellipsis" && (previous.x ?? 0) < 2 / 3) {
      entry.cell = previous.cell; entry.x = (previous.x ?? 0) + 1 / 3; entry.width = 1 / 3; entry.placement = "ellipsis";
      push(); continue;
    }
    const apostrophe = char === "'" && /^[A-Za-z]$/.test(tokens[i - 1]?.segment ?? "") && /^[A-Za-z]$/.test(tokens[i + 1]?.segment ?? "");
    const closesQuote = !apostrophe && (["”", "’", "」", "』"].includes(char) || ((char === '"' || char === "'") && state.quotes.at(-1) === char));
    const opensQuote = !apostrophe && !closesQuote && char in quotePairs;
    const closes = closesQuote || closingBrackets.has(char);
    const terminal = [".", ",", "。", "，", "!", "?"].includes(char);
    const ellipsis = char === "…" || (char === "." && tokens[i + 1]?.segment === "." && tokens[i + 2]?.segment === ".");
    const wide = char === "―" || char === "—";
    if (isSpace(char) && state.suppressSpace) {
      entry.hidden = true; state.suppressSpace = false; push(); continue;
    }
    if (isSpace(char) && cell % COLS === 0 && !state.paragraphStart) {
      entry.hidden = true; state.pendingGap = false; push(); continue;
    }
    // A typed initial space supplies the indent; do not indent it twice.
    if (state.paragraphStart && !indentDone) {
      indentDone = true;
      if (isSpace(char)) {
        entry.cell = cell; cell++; entry.hidden = true; push(); continue;
      }
      cell++;
    }
    const combinedPeriod = closesQuote && [".", "。"].includes(previous?.char ?? "");
    const atRowEnd = cell > 0 && cell % COLS === 0 && previousVisible?.cell === cell - 1;
    const sharedCount = atRowEnd ? chars.filter(c => c.cell === cell - 1 && !c.hidden).length : 0;
    if (combinedPeriod || (atRowEnd && (closes || (terminal && !ellipsis)) && sharedCount < (closes ? 3 : 2))) {
      entry.cell = previousVisible!.cell;
      entry.placement = closes ? (atRowEnd ? "close-shared" : "quote-close") : [".", ",", "。", "，"].includes(char) ? "punct-shared" : "mark-shared";
      if (atRowEnd) {
        for (const c of chars) if (c.cell === entry.cell && !c.placement && !c.hidden) c.shared = true;
      }
    } else {
      if (state.pendingGap && !closes && !terminal && !isSpace(char)) {
        if (cell % COLS) cell++;
        state.pendingGap = false;
      }
      if (state.quotedParagraph && cell % COLS === 0) cell++;
      if ((opensQuote || openingBrackets.has(char) || wide) && cell % COLS === COLS - 1) {
        cell++;
        if (state.quotedParagraph) cell++;
      }
      entry.cell = cell;
      const pair = lowerOrDigit(char) && lowerOrDigit(char) === lowerOrDigit(tokens[i + 1]?.segment ?? "");
      if (pair) { entry.placement = "half-left"; entry.width = .5; }
      else if (ellipsis) { entry.placement = "ellipsis"; if (char === ".") entry.width = 1 / 3; }
      else if (wide) { entry.placement = "long-dash"; entry.width = 2; }
      else if ([".", ",", "。", "，"].includes(char)) entry.placement = "punct-low";
      else if (opensQuote) entry.placement = "quote-open";
      else if (closesQuote) entry.placement = "quote-close";
      if (isSpace(char)) {
        entry.hidden = true;
        if (cell % COLS === 0 && !state.paragraphStart) { push(); state.pendingGap = false; continue; }
        state.pendingGap = false;
      }
      cell += wide ? 2 : 1;
    }
    if (opensQuote) {
      if (state.paragraphStart) state.quotedParagraph = true;
      state.quotes.push(quotePairs[char]);
      if (char === '"') entry.display = "“";
      if (char === "'") entry.display = "‘";
    } else if (closesQuote) {
      if (state.quotes.at(-1) === char) state.quotes.pop();
      if (!state.quotes.length) state.quotedParagraph = false;
      if (char === '"') entry.display = "”";
      if (char === "'") entry.display = "’";
    }
    if (char === "!" || char === "?") state.pendingGap = true;
    state.suppressSpace = !ellipsis && [".", ",", "。", "，"].includes(char) || closesQuote && state.suppressSpace;
    if (!isSpace(char)) { state.paragraphStart = false; paragraphHasText = true; }
    push();
  }
  const caret = options.manuscript && state.paragraphStart ? cell + (indentDone ? 0 : 1) : cell;
  return { chars, used: cell, caret, state };
}
/** Previous text carries paragraph/quote state only for an automatic page continuation. */
export function pageLayoutOptions(notebook: Notebook, pageIndex: number): LayoutOptions {
  let state: LayoutState | undefined;
  for (let i = 0; i < pageIndex; i++) {
    const page = notebook.pages[i];
    state = layoutText(page.text, { manuscript: true, state: i > 0 && page.continued ? state : undefined }).state;
  }
  const page = notebook.pages[pageIndex];
  return { manuscript: page.type === "manuscript" && page.typesetting === 1, state: pageIndex > 0 && page.continued ? state : undefined };
}
export function splitPage(text: string, options: LayoutOptions = {}) {
  const layout = layoutText(text, options);
  let boundary = 0;
  let used = 0;
  for (const token of layout.chars) {
    if (token.usedAfter > CAPACITY) break;
    used = token.usedAfter;
    boundary = token.end;
  }
  return { text: text.slice(0, boundary), rest: text.slice(boundary), used };
}
/** Reflows overflow, keeps later pages and ink, and rejects oversize edits atomically. */
export function editPage(notebook: Notebook, pageIndex: number, rawText: string, cursor: number) {
  const pages = notebook.pages.map(p => ({ ...p }));
  pages[pageIndex].typesetting = 1;
  let remaining = normalizeText(rawText);
  let current = pageIndex;
  let cursorPage = pageIndex;
  let cursorOffset = normalizeText(rawText.slice(0, cursor)).length;
  let trackingCursor = true;
  while (true) {
    const piece = splitPage(remaining, pageLayoutOptions({ ...notebook, pages }, current));
    pages[current].text = piece.text;
    if (trackingCursor && cursorOffset > piece.text.length) {
      cursorOffset -= piece.text.length;
      cursorPage = current + 1;
    } else { trackingCursor = false; }
    if (!piece.rest) break;
    current++;
    if (current >= MAX_PAGES) return { accepted: false as const, notebook, cursorPage: pageIndex, cursorOffset: 0 };
    if (!pages[current]) pages.push(newPage(pages[current - 1].type));
    pages[current].typesetting = 1;
    pages[current].continued = true;
    remaining = piece.rest + pages[current].text;
  }
  return { accepted: true as const, notebook: { ...notebook, pages }, cursorPage, cursorOffset };
}
export function cellForOffset(text: string, offset: number, options: LayoutOptions = {}) {
  const layout = layoutText(text, options);
  const item = layout.chars.find(t => t.end > offset);
  return Math.min(item ? item.cell + (item.x ?? 0) : layout.caret, CAPACITY - 1);
}
export function offsetForCell(text: string, cell: number, options: LayoutOptions = {}) {
  const layout = layoutText(text, options);
  if (!options.manuscript) return layout.chars.find(t => t.cell >= cell)?.offset ?? text.length;
  const stops = layout.chars.filter(t => t.char !== "\n").map(t => ({ cell: t.cell + (t.x ?? 0), offset: t.offset }));
  stops.push({ cell: layout.caret, offset: text.length });
  return stops.reduce((best, stop) => Math.abs(stop.cell - cell) < Math.abs(best.cell - cell) ? stop : best).offset;
}
/** Switching paper applies its layout and reflows safely without changing ink. */
export function changePaper(notebook: Notebook, pageIndex: number, type: PaperType) {
  const next = { ...notebook, pages: notebook.pages.map((p, i) => i === pageIndex ? { ...p, type } : p) };
  const result = editPage(next, pageIndex, next.pages[pageIndex].text, next.pages[pageIndex].text.length);
  return result.accepted ? result : { ...result, notebook };
}
export function validateNotebook(input: unknown): input is Notebook {
  if (!input || typeof input !== "object") return false;
  const n = input as Notebook;
  if (typeof n.title !== "string" || n.title.length > 120 || !Array.isArray(n.pages) || n.pages.length < 1 || n.pages.length > MAX_PAGES) return false;
  let totalPoints = 0;
  const ids = new Set<string>();
  for (const [index, p] of n.pages.entries()) {
    if (!p || typeof p.id !== "string" || p.id.length > 80 || ids.has(p.id) || !["manuscript", "blank", "graph"].includes(p.type) || typeof p.text !== "string" || p.text.length > 12000 || (p.typesetting !== undefined && p.typesetting !== 1) || (p.continued !== undefined && typeof p.continued !== "boolean") || (p.inkRows !== undefined && p.inkRows !== 40 && p.inkRows !== 48) || layoutText(p.text, pageLayoutOptions(n, index)).used > CAPACITY || !Array.isArray(p.strokes) || p.strokes.length > 12000) return false;
    ids.add(p.id);
    for (const s of p.strokes) {
      if (!s || typeof s.id !== "string" || s.id.length > 80 || !/^#[0-9a-fA-F]{6}$/.test(s.color) || !Number.isFinite(s.width) || s.width < 0.5 || s.width > 12 || !Array.isArray(s.points) || !s.points.length || s.points.length > 30000) return false;
      totalPoints += s.points.length;
      if (totalPoints > 500000) return false;
      if (!s.points.every(pt => pt && [pt.x, pt.y, pt.p].every(Number.isFinite) && pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1 && pt.p >= 0 && pt.p <= 1)) return false;
    }
  }
  return true;
}
export function validateBookshelf(input: unknown): input is Bookshelf {
  if (!input || typeof input !== "object") return false;
  const shelf = input as Bookshelf;
  if (!Array.isArray(shelf.books) || shelf.books.length < 1 || shelf.books.length > MAX_BOOKS || !shelf.books.every(validateNotebook)) return false;
  return shelf.books.reduce((total, book) => total + book.pages.reduce((sum, page) => sum + page.strokes.reduce((n, stroke) => n + stroke.points.length, 0), 0), 0) <= 500000;
}
/** Upgrade old pages atomically. Full old books remain readable in their original layout. */
export function upgradeTypesetting(notebook: Notebook): Notebook {
  if (notebook.pages.every(p => p.typesetting === 1)) return notebook;
  let next: Notebook = { ...notebook, pages: notebook.pages.map((p, i) => ({
    ...p, typesetting: 1,
    continued: p.continued ?? (i > 0 && layoutText(notebook.pages[i - 1].text).used >= CAPACITY),
  })) };
  for (let i = 0; i < next.pages.length; i++) {
    const result = editPage(next, i, next.pages[i].text, 0);
    if (!result.accepted) return notebook;
    next = result.notebook;
  }
  return next;
}
/** Preserve all source text and ink when wrapping/upgrading earlier saves. */
/** Keep the physical position of ink from the old 40-row paper. */
function upgradeInkRows(notebook: Notebook): Notebook {
  if (notebook.pages.every(p => p.inkRows === 48)) return notebook;
  return { ...notebook, pages: notebook.pages.map(p => p.inkRows === 48 ? p : { ...p, inkRows: 48, strokes: p.strokes.map(s => ({ ...s, points: s.points.map(point => ({ ...point, y: point.y * (p.inkRows ?? 40) / 48 })) })) }) };
}
export function normalizeBookshelf(input: unknown): Bookshelf | null {
  if (validateBookshelf(input)) return { ...input, books: input.books.map(book => upgradeInkRows(upgradeTypesetting(book))) };
  if (validateNotebook(input)) return { books: [upgradeInkRows(upgradeTypesetting(input))] };
  return null;
}
