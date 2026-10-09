"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, HardDrive, CircleAlert, Download, FileDown, Upload, Eraser, Grid2X2, Keyboard, LoaderCircle, PenLine, Plus, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { CAPACITY, COLS, MAX_PAGES, MAX_BOOKS, PAPER_NAMES, ROWS, cellForOffset, countText, editPage, layoutText, pageLayoutOptions, changePaper, newPage, offsetForCell, addBook as appendBook, normalizeBookshelf, updateBook, type Bookshelf, type InkPoint, type LayoutOptions, type Notebook, type Page, type PaperType, type Stroke } from "@/lib/notebook";

import { loadLocalNotebook, saveLocalNotebook, RevisionConflict } from "@/lib/local-notebook";
import { drawStroke } from "@/lib/ink";
import { downloadFile } from "@/lib/download";
import { encodeBackup, decodeBackup, MAX_BACKUP_BYTES } from "@/lib/notebook-backup";

type Mode = "keyboard" | "ink";
type SaveStatus = "loading" | "saved" | "pending" | "saving" | "error";
const initialNotebook: Notebook = { title: "", pages: [{ id: "first-page", type: "manuscript", text: "", strokes: [], typesetting: 1, inkRows: 48 }] };
const initialBookshelf: Bookshelf = { books: [initialNotebook] };
const COLORS = [{ value: "#282a2c", name: "먹색" }, { value: "#274e80", name: "파랑" }, { value: "#b44636", name: "빨강" }];
const fmt = (n: number) => n.toLocaleString("ko-KR");

function ToolButton({ label, children, onClick, disabled = false, active = false }: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <Tooltip><TooltipTrigger asChild><button type="button" className={`icon-button ${active ? "is-active" : ""}`} aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={active || undefined}>{children}</button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function TextGrid({ page, options, enabled, onEdit, targetSelection }: { page: Page; options: LayoutOptions; enabled: boolean; onEdit: (text: string, cursor: number) => void; targetSelection: { pageId: string; offset: number; tick: number } | null }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const skipChange = useRef<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState([page.text.length, page.text.length]);
  const drag = useRef<{ pointer: number; anchor: number } | null>(null);
  const text = draft ?? page.text;
  const { chars, used } = useMemo(() => layoutText(text, options), [text, options]);
  const caret = cellForOffset(text, selection[1], options);
  const caretStyle = { left: `${caret % COLS * 100 / COLS}%`, top: `${Math.floor(caret / COLS) * 100 / ROWS}%` };

  const syncSelection = () => {
    if (input.current) setSelection([input.current.selectionStart, input.current.selectionEnd]);
  };
  useEffect(() => {
    if (targetSelection?.pageId === page.id && input.current && enabled) {
      input.current.focus({ preventScroll: true });
      input.current.setSelectionRange(targetSelection.offset, targetSelection.offset);
      setSelection([targetSelection.offset, targetSelection.offset]);
      const r = input.current.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 100 || r.top < 160) input.current.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }
  }, [targetSelection, page.id, enabled]);
  useEffect(() => {
    if (enabled && !composing.current) setSelection(s => [Math.min(s[0], text.length), Math.min(s[1], text.length)]);
  }, [text.length, enabled]);
  const atPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = surface.current!.getBoundingClientRect();
    const position = Math.max(0, Math.min(COLS - .01, (e.clientX - r.left) / r.width * COLS));
    const col = options.manuscript ? position : Math.floor(position);
    const row = Math.max(0, Math.min(ROWS - 1, Math.floor((e.clientY - r.top) / r.height * ROWS)));
    return offsetForCell(text, row * COLS + col, options);
  };
  const setRange = (a: number, b: number) => {
    input.current?.focus({ preventScroll: true });
    input.current?.setSelectionRange(Math.min(a, b), Math.max(a, b));
    setSelection([Math.min(a, b), Math.max(a, b)]);
  };
  return <div ref={surface} className={`writing-area paper-${page.type} ${enabled ? "typing" : ""}`} onPointerDown={e => {
    if (!enabled || e.button !== 0 || e.target === input.current) return;
    if (e.pointerType === "mouse") e.preventDefault();
    const offset = atPointer(e);
    const anchor = e.shiftKey ? selection[0] : offset;
    setRange(anchor, offset);
    if (e.pointerType === "mouse") { drag.current = { pointer: e.pointerId, anchor }; e.currentTarget.setPointerCapture(e.pointerId); }
  }} onPointerMove={e => {
    if (drag.current?.pointer === e.pointerId) setRange(drag.current.anchor, atPointer(e));
  }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <div className="characters" aria-hidden="true">
      {chars.filter(t => t.cell < CAPACITY && !t.hidden).map(t => <span key={t.offset} className={`letter ${t.placement ?? ""} ${t.shared ? "shared-body" : ""} ${t.offset < selection[1] && t.end > selection[0] && focused ? "selected-letter" : ""}`} style={{ left: `${(t.cell % COLS + (t.x ?? 0)) * 100 / COLS}%`, top: `${Math.floor(t.cell / COLS) * 100 / ROWS}%`, width: `${(t.width ?? 1) * 100 / COLS}%` }}>{t.display ?? t.char}</span>)}
      {enabled && focused && selection[0] === selection[1] && <span className="grid-caret" style={caretStyle} />}
    </div>
    {enabled && <textarea ref={input} className="grid-input" style={caretStyle} aria-label="이 장에 글 쓰기" aria-describedby="count-explanation" value={text} autoComplete="off" autoCapitalize="off" spellCheck={false}
      onFocus={() => { setFocused(true); syncSelection(); }} onBlur={() => setFocused(false)} onSelect={syncSelection}
      onCompositionStart={() => { composing.current = true; setDraft(page.text); }}
      onCompositionEnd={e => {
        composing.current = false;
        const value = e.currentTarget.value;
        const cursor = e.currentTarget.selectionStart;
        skipChange.current = value;
        setDraft(null);
        onEdit(value, cursor);
      }}
      onChange={e => {
        const value = e.currentTarget.value;
        const cursor = e.currentTarget.selectionStart;
        setSelection([cursor, e.currentTarget.selectionEnd]);
        if (composing.current || (e.nativeEvent as InputEvent).isComposing) { setDraft(value); return; }
        if (skipChange.current === value) { skipChange.current = null; return; }
        skipChange.current = null;
        onEdit(value, cursor);
      }}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing) return;
        if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          const next = offsetForCell(text, Math.max(0, Math.min(CAPACITY - 1, caret + (e.key === "ArrowDown" ? COLS : -COLS))), options);
          setRange(e.shiftKey ? selection[0] : next, next);
        }
      }} />}
    {!text && enabled && !focused && !page.strokes.length && <span className="empty-paper-hint" aria-hidden="true">종이를 눌러 첫 문장을 써 보세요.</span>}
    <span className="sr-only">{used}칸 사용</span>
  </div>;
}

function InkCanvas({ page, enabled, color, width, tool, penOnly, onCommit }: { page: Page; enabled: boolean; color: string; width: number; tool: "pen" | "eraser"; penOnly: boolean; onCommit: (strokes: Stroke[]) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ pointer: number; stroke: Stroke | null; remaining: Stroke[]; eraser: boolean } | null>(null);
  const frame = useRef<number | null>(null);
  const touchPan = useRef<{ pointer: number; x: number; y: number } | null>(null);
  const pageRef = useRef(page); pageRef.current = page;
  const render = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    const work = drawing.current;
    for (const s of work?.remaining ?? pageRef.current.strokes) drawStroke(ctx, s, el.width, el.height);
    if (work?.stroke) drawStroke(ctx, work.stroke, el.width, el.height);
  }, []);
  const queueRender = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; render(); });
  };
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const resize = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      el.width = Math.round(r.width * dpr); el.height = Math.round(r.height * dpr); render();
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    return () => { observer.disconnect(); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [render]);
  useEffect(() => { render(); }, [page.strokes, render]);
  const point = (e: PointerEvent | ReactPointerEvent<HTMLCanvasElement>): InkPoint => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 10000) / 10000, y: Math.round(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * 10000) / 10000, p: Math.round((e.pressure > 0 ? e.pressure : 0.5) * 1000) / 1000 };
  };
  const eraseAt = (p: InkPoint) => {
    const work = drawing.current!;
    const radius = 14 / (canvas.current!.getBoundingClientRect().width || 700);
    work.remaining = work.remaining.filter(s => !s.points.some(pt => Math.hypot(pt.x - p.x, (pt.y - p.y) * ROWS / COLS) < radius));
  };
  const finish = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (touchPan.current?.pointer === e.pointerId) touchPan.current = null;
    const work = drawing.current;
    if (!work || work.pointer !== e.pointerId) return;
    const next = work.stroke ? [...work.remaining, work.stroke] : work.remaining;
    drawing.current = null;
    onCommit(next);
    render();
  };
  return <canvas ref={canvas} className={`ink-canvas ${enabled ? "ink-enabled" : ""} ${tool === "eraser" ? "erasing" : ""}`} style={{ pointerEvents: enabled ? "auto" : "none", touchAction: "none" }} role="img" aria-label="펜슬 손글씨 입력 영역" data-pen-only={penOnly}
    onPointerDown={e => {
      if (!enabled || drawing.current || (e.pointerType === "mouse" && e.button !== 0)) return;
      if (e.pointerType === "touch" && penOnly) {
        touchPan.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      touchPan.current = null;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = point(e);
      const eraser = tool === "eraser" || e.button === 5 || (e.buttons & 32) !== 0;
      drawing.current = { pointer: e.pointerId, remaining: page.strokes, eraser, stroke: eraser ? null : { id: crypto.randomUUID(), color, width, points: [p] } };
      if (eraser) eraseAt(p);
      queueRender();
    }}
    onPointerMove={e => {
      const pan = touchPan.current;
      if (pan?.pointer === e.pointerId && !drawing.current) {
        const scroll = e.currentTarget.closest(".paper-viewport");
        if (scroll) scroll.scrollLeft += pan.x - e.clientX;
        window.scrollBy(0, pan.y - e.clientY);
        pan.x = e.clientX; pan.y = e.clientY;
        return;
      }
      const work = drawing.current; if (!work || work.pointer !== e.pointerId) return;
      e.preventDefault();
      const points = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
      for (const event of points.length ? points : [e.nativeEvent]) {
        const p = point(event);
        if (work.eraser) eraseAt(p); else {
          const last = work.stroke!.points.at(-1)!;
          if (Math.hypot((last.x - p.x) * 700, (last.y - p.y) * 1120) > 0.4 && work.stroke!.points.length < 30000) work.stroke!.points.push(p);
        }
      }
      queueRender();
    }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />;
}

export default function NotebookEditor() {
  const [bookshelf, setBookshelf] = useState<Bookshelf>(initialBookshelf);
  const [activeBook, setActiveBook] = useState(0);
  const bookIndex = useRef(0); bookIndex.current = activeBook;
  const shelfRef = useRef(bookshelf); shelfRef.current = bookshelf;
  const notebook = bookshelf.books[activeBook] ?? bookshelf.books[0];
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>("keyboard");
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState(COLORS[0].value);
  const [width, setWidth] = useState(2.5);
  const [penOnly, setPenOnly] = useState(true);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [selectionTarget, setSelectionTarget] = useState<{ pageId: string; offset: number; tick: number } | null>(null);
  const latest = useRef(notebook); latest.current = notebook;
  const revision = useRef(0);
  const saved = useRef("");
  const loaded = useRef(false);
  const blocked = useRef(false);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const past = useRef<Bookshelf[]>([]);
  const future = useRef<Bookshelf[]>([]);
  const lastEdit = useRef({ time: 0, kind: "" });
  const writePaper = useRef<HTMLElement>(null);
  const page = notebook.pages[active] ?? notebook.pages[0];
  const textAll = notebook.pages.map(p => p.text).join("\n");
  const totalCount = useMemo(() => countText(textAll), [textAll]);
  const totalNoSpaces = useMemo(() => countText(textAll, false), [textAll]);
  const layoutOptions = useMemo(() => pageLayoutOptions(notebook, Math.min(active, notebook.pages.length - 1)), [notebook, active]);
  const used = layoutText(page.text, layoutOptions).used;
  const [now, setNow] = useState("");
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  const pdfBusy = useRef(false);
  const backupInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setStatus("loading"); setError("");
    try {
      const data = await loadLocalNotebook();
      const converted = data?.notebook ? normalizeBookshelf(data.notebook) : initialBookshelf;
      if (!converted) throw new Error("저장된 노트를 확인할 수 없어요.");
      const n = converted;
      saved.current = JSON.stringify(n); revision.current = data?.revision ?? 0;
      shelfRef.current = n; latest.current = n.books[0]; loaded.current = true;
      setBookshelf(n); setActiveBook(0); setActive(0); setReady(true); setStatus("saved");
    } catch (e) { setStatus("error"); setError(e instanceof Error ? e.message : "노트를 불러오지 못했어요."); }
  }, []);

  const save = useCallback(async () => {
    if (!loaded.current || saving.current || blocked.current) return;
    const snapshot = JSON.stringify(shelfRef.current);
    if (snapshot === saved.current) { setStatus("saved"); return; }
    saving.current = true; setStatus("saving"); setError("");
    let success = false;
    try {
      let data;
      try { data = await saveLocalNotebook(JSON.parse(snapshot) as Bookshelf, revision.current); }
      catch (e) { if (e instanceof RevisionConflict) blocked.current = true; throw e; }
      revision.current = data.revision; saved.current = snapshot; success = true;
      setStatus(JSON.stringify(shelfRef.current) === snapshot ? "saved" : "pending");
    } catch (e) { setStatus("error"); setError(e instanceof Error ? e.message : "저장하지 못했어요. 잠시 후 다시 시도해 주세요."); }
    finally {
      saving.current = false;
      if (success && JSON.stringify(shelfRef.current) !== saved.current) timer.current = setTimeout(() => { void save(); }, 800);
    }
  }, []);

  useEffect(() => { void load(); setNow(new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())); }, [load]);
  useEffect(() => {
    if (!ready || !loaded.current || JSON.stringify(bookshelf) === saved.current) return;
    if (!blocked.current) setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(); }, 900);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [bookshelf, ready, save]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => { if (loaded.current && JSON.stringify(shelfRef.current) !== saved.current) { e.preventDefault(); e.returnValue = ""; } };
    const flush = () => { if (document.visibilityState === "hidden" && !blocked.current) void save(); };
    window.addEventListener("beforeunload", leave); document.addEventListener("visibilitychange", flush);
    return () => { window.removeEventListener("beforeunload", leave); document.removeEventListener("visibilitychange", flush); };
  }, [save]);

  const commitShelf = useCallback((next: Bookshelf, kind = "action") => {
    const old = shelfRef.current;
    if (JSON.stringify(old) === JSON.stringify(next)) return;
    if (kind !== "typing" || lastEdit.current.kind !== kind || Date.now() - lastEdit.current.time > 900) {
      past.current.push(old); if (past.current.length > 60) past.current.shift();
    }
    lastEdit.current = { kind, time: Date.now() }; future.current = [];
    shelfRef.current = next; latest.current = next.books[bookIndex.current] ?? next.books[0];
    setBookshelf(next); setHistoryVersion(v => v + 1);
  }, []);
  const commit = useCallback((next: Notebook, kind = "action") => {
    commitShelf(updateBook(shelfRef.current, bookIndex.current, next), kind);
  }, [commitShelf]);
  const history = useCallback((direction: "undo" | "redo") => {
    const source = direction === "undo" ? past : future;
    const destination = direction === "undo" ? future : past;
    const next = source.current.pop(); if (!next) return;
    destination.current.push(shelfRef.current);
    const index = Math.min(bookIndex.current, next.books.length - 1);
    bookIndex.current = index; shelfRef.current = next; latest.current = next.books[index];
    setBookshelf(next); setActiveBook(index); setActive(i => Math.min(i, next.books[index].pages.length - 1));
    setSelectionTarget(null); lastEdit.current = { time: 0, kind: "" }; setHistoryVersion(v => v + 1);
  }, []);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (e.isComposing || !(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
      if (e.target instanceof HTMLInputElement) return;
      if (e.key.toLowerCase() === "z") { e.preventDefault(); history(e.shiftKey ? "redo" : "undo"); }
      if (e.key.toLowerCase() === "y") { e.preventDefault(); history("redo"); }
    };
    window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard);
  }, [history, save]);

  const updatePage = (patch: Partial<Page>) => {
    if (patch.type) {
      const result = changePaper(latest.current, active, patch.type);
      if (!result.accepted) { toast.error("이 종이 형식으로 바꾸면 12장을 넘어요. 글을 줄인 뒤 다시 선택해 주세요."); return; }
      commit(result.notebook); setSelectionTarget(null); return;
    }
    commit({ ...latest.current, pages: latest.current.pages.map((p, i) => i === active ? { ...p, ...patch } : p) });
  };
  const go = (index: number) => {
    if (index < 0 || index >= latest.current.pages.length) return;
    setActive(index); setSelectionTarget(null); lastEdit.current.kind = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const add = () => {
    if (notebook.pages.length >= MAX_PAGES) { toast.info("종이는 최대 12장까지 쓸 수 있어요."); return; }
    commit({ ...latest.current, pages: [...latest.current.pages, newPage(page.type)] });
    setActive(latest.current.pages.length - 1); setSelectionTarget(null); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goBook = (index: number) => {
    if (index < 0 || index >= shelfRef.current.books.length) return;
    bookIndex.current = index; latest.current = shelfRef.current.books[index];
    setActiveBook(index); setActive(0); setSelectionTarget(null); lastEdit.current.kind = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const addVolume = () => {
    const result = appendBook(shelfRef.current);
    if (!result.accepted) { toast.info("최대 3권까지 만들 수 있어요."); return; }
    commitShelf(result.shelf);
    goBook(result.shelf.books.length - 1);
  };
  const onEdit = (value: string, cursor: number) => {
    const result = editPage(latest.current, active, value, cursor);
    if (!result.accepted) { toast.error("12장이 모두 찼어요. 공간을 비운 뒤 입력해 주세요. 기존 글은 그대로 유지돼요."); setSelectionTarget({ pageId: page.id, offset: Math.min(cursor, page.text.length), tick: Date.now() }); return; }
    const turned = result.cursorPage !== active;
    commit(result.notebook, "typing");
    setActive(result.cursorPage);
    setSelectionTarget({ pageId: result.notebook.pages[result.cursorPage].id, offset: result.cursorOffset, tick: Date.now() });
    if (turned) { toast.info(`${result.cursorPage + 1}장에 이어서 쓰고 있어요.`); window.scrollTo({ top: 0, behavior: "smooth" }); }
  };
  const exportPdf = async () => {
    if (!ready || pdfBusy.current) return;
    pdfBusy.current = true; setPdfProgress("준비 중");
    const snapshot = structuredClone(latest.current), volume = bookIndex.current + 1;
    try {
      const { downloadNotebookPdf } = await import("@/lib/notebook-pdf");
      await downloadNotebookPdf(snapshot, volume, (page, total) => setPdfProgress(page + " / " + total + "장"));
      toast.success("이 권의 모든 장을 PDF로 내려받았어요.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "PDF를 만들지 못했어요. 다시 시도해 주세요."); }
    finally { pdfBusy.current = false; setPdfProgress(null); }
  };
  const exportBackup = () => {
    try { downloadFile(new Blob([encodeBackup(shelfRef.current)], { type: "application/json" }), "한칸-책장-" + new Date().toISOString().slice(0, 10) + ".json"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "백업하지 못했어요."); }
  };
  const importBackup = async (file: File) => {
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("백업 파일이 너무 커요.");
      const next = decodeBackup(await file.text());
      if (!window.confirm("이 파일의 " + next.books.length + "권으로 책장을 바꿀까요? 현재 책장은 먼저 백업해 주세요. 불러온 뒤 되돌리기도 가능해요.")) return;
      commitShelf(next); goBook(0); setSelectionTarget(null);
      toast.success("책장을 불러왔어요.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "백업 파일을 불러오지 못했어요."); }
  };
  const statusText = { loading: "노트 불러오는 중", saved: "이 브라우저에 저장됨", pending: "저장 대기 중", saving: "저장 중", error: "저장 상태 확인 필요" }[status];
  void historyVersion;

  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool: (t: object, o: { signal: AbortSignal }) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: object) => { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} };
    register({ name: "read_bookshelf", description: "Read the three-book shelf, each book title, page types and typed character counts. Handwritten strokes are not recognized as text.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => ({ books: shelfRef.current.books.map((book, b) => ({ book: b + 1, title: book.title, pages: book.pages.map((p, i) => ({ page: i + 1, paperType: p.type, text: p.text, characters: countText(p.text), inkStrokes: p.strokes.length })) })) }) });
    register({ name: "set_page_paper", description: "Change one existing page's paper type in an existing book, preserving all text and ink.", inputSchema: { type: "object", properties: { book: { type: "integer", minimum: 1, maximum: 3 }, page: { type: "integer", minimum: 1, maximum: 12 }, paperType: { type: "string", enum: ["manuscript", "blank", "graph"] } }, required: ["book", "page", "paperType"], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: async (input: unknown) => {
      const p = input as { book: number; page: number; paperType: PaperType };
      if (!loaded.current || !p || !Number.isInteger(p.book) || p.book < 1 || p.book > shelfRef.current.books.length || !Number.isInteger(p.page) || p.page < 1 || p.page > shelfRef.current.books[p.book - 1].pages.length || !["manuscript", "blank", "graph"].includes(p.paperType)) throw new Error("Invalid book, page or paper type");
      const book = shelfRef.current.books[p.book - 1];
      const result = changePaper(book, p.page - 1, p.paperType);
      if (!result.accepted) throw new Error("This paper layout would exceed 12 pages.");
      commitShelf(updateBook(shelfRef.current, p.book - 1, result.notebook));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      return { book: p.book, page: p.page, paperType: shelfRef.current.books[p.book - 1].pages[p.page - 1].type };
    } });
    return () => lifecycle.abort();
  }, [commitShelf]);

  return <TooltipProvider delayDuration={300}><div className="app-shell">
    <header className="app-header">
      <a href="/" className="wordmark" aria-label="한칸 | 타이핑으로 작성하는 나만의 원고지"><span className="brand-icon"><Grid2X2 size={24} strokeWidth={1.4} /></span><span>한칸</span><span className="brand-caption">타이핑으로 작성하는 나만의 원고지</span></a>
      <div className={`save-state ${status === "error" ? "save-error" : ""}`} role="status">{status === "saving" || status === "loading" ? <LoaderCircle className="spin" size={15} /> : status === "error" ? <CircleAlert size={16} /> : <HardDrive size={16} />}<span>{statusText}</span></div>
    </header>
    <div className="workspace">
      <aside className="notebook-sidebar" aria-label="나의 책장">
        <div className="notebook-heading"><span className="eyebrow">MY BOOKSHELF</span><h1>한 권에 담은 생각.</h1></div>
        <section className="count-section" aria-label="현재 권의 글자 수"><span className="count-label">이 권에 쓴 글</span><div className="big-count"><strong>{fmt(totalCount)}</strong><span>자</span></div><div className="count-details"><span>공백 제외</span><b>{fmt(totalNoSpaces)}자</b></div><div className="count-rule" /><p id="count-explanation">입력한 글자와 공백을 세어요.<br />줄바꿈과 손글씨는 제외돼요.</p></section>
        <div className="pages-heading"><span>나의 책장</span><span>{bookshelf.books.length} / 3권</span></div>
        <nav className="page-list book-list" aria-label="권 선택">
          {bookshelf.books.map((book, i) => <button type="button" key={i} className={`page-button book-button ${activeBook === i ? "current-page" : ""}`} onClick={() => goBook(i)} aria-current={activeBook === i ? "page" : undefined}><span className={`book-cover cover-${i + 1}`} aria-hidden="true"><BookOpen size={18} strokeWidth={1.25} /></span><span className="page-button-label book-button-label"><strong title={book.title || "제목 없는 글"}>{book.title.trim() || "제목 없는 글"}</strong><span>{i + 1}권 · {book.pages.length}장 · {fmt(countText(book.pages.map(p => p.text).join("\n")))}자</span></span>{activeBook === i && <span className="page-active-mark" />}</button>)}
        </nav>
        <button type="button" className="add-page-button" onClick={addVolume} disabled={!ready || bookshelf.books.length >= MAX_BOOKS}><Plus size={17} />새 권 만들기</button>
        <p className="page-limit">최대 3권 · 한 권에 최대 12장</p>
        <div className="backup-actions"><button type="button" onClick={exportBackup} disabled={!ready}><Download size={15} />책장 백업</button><button type="button" onClick={() => backupInput.current?.click()} disabled={!ready}><Upload size={15} />불러오기</button></div>
        <input ref={backupInput} type="file" accept=".json,application/json" hidden aria-label="책장 백업 파일 선택" onChange={e => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (file) void importBackup(file); }} />
        <div className="sidebar-bottom"><HardDrive size={16} /><span>이 기기·브라우저에 자동 저장</span></div>
      </aside>
      <main className="editor-main">
        <div className="editor-toolbar">
          <div className="toolbar-left"><Tabs value={mode} onValueChange={value => { setMode(value as Mode); }} className="mode-tabs"><TabsList className="mode-list" aria-label="입력 방식"><TabsTrigger value="keyboard" disabled={!ready}><Keyboard size={17} />키보드</TabsTrigger><TabsTrigger value="ink" disabled={!ready}><PenLine size={17} />손글씨</TabsTrigger></TabsList></Tabs><span className="toolbar-divider" /><Select value={page.type} onValueChange={value => updatePage({ type: value as PaperType })} disabled={!ready}><SelectTrigger className="paper-select" aria-label="현재 장의 종이 형식"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manuscript">원고지</SelectItem><SelectItem value="blank">백지</SelectItem><SelectItem value="graph">모눈종이</SelectItem></SelectContent></Select></div>
          <div className="toolbar-right"><button type="button" className="pdf-button" onClick={() => { void exportPdf(); }} disabled={!ready || pdfProgress !== null} aria-label="현재 권 전체 PDF 다운로드">{pdfProgress !== null ? <LoaderCircle className="spin" size={17} /> : <FileDown size={17} />}<span>{pdfProgress !== null ? pdfProgress : "PDF 다운로드"}</span></button><ToolButton label="되돌리기" onClick={() => history("undo")} disabled={!past.current.length}><Undo2 size={19} /></ToolButton><ToolButton label="다시 하기" onClick={() => history("redo")} disabled={!future.current.length}><Redo2 size={19} /></ToolButton></div>
        </div>
        {mode === "ink" && <div className="ink-toolbar"><div className="ink-tools"><ToolButton label="펜" active={tool === "pen"} onClick={() => setTool("pen")}><PenLine size={18} /></ToolButton><ToolButton label="획 지우개" active={tool === "eraser"} onClick={() => setTool("eraser")}><Eraser size={18} /></ToolButton><span className="toolbar-divider" />{COLORS.map(c => <button type="button" key={c.value} className={`color-swatch ${color === c.value ? "chosen-color" : ""}`} style={{ "--ink": c.value } as CSSProperties} aria-label={`${c.name} 펜`} aria-pressed={color === c.value} onClick={() => { setColor(c.value); setTool("pen"); }}>{color === c.value && <Check size={13} />}</button>)}</div><div className="pen-width"><span>굵기</span><Slider aria-label="펜 굵기" min={1} max={6} step={0.5} value={[width]} onValueChange={v => setWidth(v[0])} /><span>{width}</span></div><label className="pen-only"><Switch checked={penOnly} onCheckedChange={setPenOnly} aria-label="손 터치 무시" /><span>손 터치 무시</span></label></div>}
        {error && <div className="error-banner" role="alert"><CircleAlert size={17} /><span>{error}</span>{!ready ? <button type="button" onClick={() => { void load(); }}>다시 불러오기</button> : !blocked.current ? <button type="button" onClick={() => { void save(); }}>다시 저장</button> : <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(textAll); toast.success("입력한 글을 복사했어요. 필기는 화면에 남아 있으니 새로고침 전에 확인해 주세요."); } catch { toast.error("글을 선택해서 직접 복사해 주세요."); } }}>입력 글 복사</button>}</div>}
        <div className="page-context"><div className="page-context-current"><span className="volume-current">{activeBook + 1}권</span><span className="page-context-separator">/</span><Select value={String(active)} onValueChange={value => go(Number(value))} disabled={!ready}><SelectTrigger className="page-jump" aria-label="현재 권에서 장 선택"><SelectValue /></SelectTrigger><SelectContent>{notebook.pages.map((p, i) => <SelectItem key={p.id} value={String(i)}>{i + 1}장</SelectItem>)}</SelectContent></Select><button type="button" className="add-sheet-button" onClick={add} disabled={!ready || notebook.pages.length >= MAX_PAGES}><Plus size={15} />장 추가</button></div><span>{mode === "ink" ? "펜슬로 쓰기 · 획 단위 지우기" : "1,200칸 · 25칸 × 48줄"}</span></div>
        <div className="paper-viewport"><article ref={writePaper} className={`paper-sheet sheet-${page.type}`} aria-label={`${active + 1}번째 ${PAPER_NAMES[page.type]}`}>
          <div className="paper-topline"><span className="paper-series">한칸 <span>WRITING PAPER</span></span><span>{String(activeBook + 1).padStart(2, "0")}권 · {String(active + 1).padStart(2, "0")}장</span></div>
          <div className="paper-title-row"><input className="paper-title" aria-label="글 제목" placeholder="이 권의 제목을 적어 주세요" value={notebook.title} maxLength={120} disabled={!ready} onChange={e => commit({ ...latest.current, title: e.target.value }, "title")} /><span className="paper-date">{now}</span></div>
          <div className="paper-body" key={page.id}>
            <TextGrid page={page} options={layoutOptions} enabled={mode === "keyboard" && ready} onEdit={onEdit} targetSelection={selectionTarget} />
            <InkCanvas page={page} enabled={mode === "ink" && ready} color={color} width={width} tool={tool} penOnly={penOnly} onCommit={strokes => updatePage({ strokes })} />
            {!ready && <div className="paper-loading"><div>{status === "loading" ? <><LoaderCircle size={21} className="spin" /><span>나의 원고지를 펼치는 중</span></> : <><CircleAlert size={22} /><span>노트를 불러온 뒤 글을 쓸 수 있어요.</span><button type="button" onClick={() => { void load(); }}><RotateCcw size={16} />다시 불러오기</button></>}</div></div>}
          </div>
          <footer className="paper-footer"><span>{PAPER_NAMES[page.type]} · 1,200칸</span><span>{fmt(used)} / 1,200칸 사용</span></footer>
        </article></div>
        <div className="page-navigation"><button type="button" onClick={() => go(active - 1)} disabled={active === 0}><ChevronLeft size={17} />이전 장</button><span>{active + 1}<span> / {notebook.pages.length}장</span></span><button type="button" onClick={() => active < notebook.pages.length - 1 ? go(active + 1) : add()} disabled={!ready || active === MAX_PAGES - 1}>{active < notebook.pages.length - 1 ? "다음 장" : "새 장"}<ChevronRight size={17} /></button></div>
        <div className="editor-footnote">{mode === "ink" ? <><PenLine size={15} /><span>손글씨는 필기로 저장돼요. 글자 수에는 포함되지 않아요.<br />손 터치 무시를 끄면 손가락으로도 쓸 수 있어요.</span></> : page.type === "manuscript" ? <><Keyboard size={15} /><span>{page.typesetting === 1 ? <>Enter로 문단을 나누면 첫 칸을 자동으로 비워요.<br />숫자·영문 소문자는 한 칸에 두 자씩, 문장부호는 원고지 위치에 맞춰 써요.</> : <>기존 글이 새 배치로 12장을 넘어 기존 배치를 유지했어요.<br />글을 줄이면 원고지 배치로 다시 정리할 수 있어요.</>}</span></> : <><Keyboard size={15} /><span>1,200칸이 차면 다음 장으로 이어져요.<br />줄바꿈은 다음 줄의 첫 칸으로 이동해요.</span></>}</div>
      </main>
    </div>
    <div className="mobile-count"><span>이 권 <strong>{fmt(totalCount)}</strong>자</span><span>이 장 <strong>{fmt(countText(page.text))}</strong>자</span><span className={status === "error" ? "text-error" : ""}>{status === "saved" ? "저장됨" : status === "error" ? "저장 확인" : "저장 중"}</span></div>
    <Toaster position="bottom-center" richColors />
  </div></TooltipProvider>;
}
