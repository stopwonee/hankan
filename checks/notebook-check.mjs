import assert from "node:assert/strict";
import { CAPACITY, MAX_PAGES, countText, layoutText, splitPage, editPage, newNotebook, newPage, validateNotebook, cellForOffset, offsetForCell } from "../lib/notebook.ts";

assert.equal(CAPACITY, 1200);
assert.equal(MAX_PAGES, 12);
assert.equal(countText("한글 A 😀\n"), 6);
assert.equal(countText("한글 A 😀\n", false), 4);
assert.equal(countText("👩‍💻🇰🇷"), 2);
assert.equal(layoutText("가나\n다").used, 26);
assert.equal(layoutText("가".repeat(25) + "\n나").used, 51);
assert.equal(splitPage("가".repeat(1200)).rest, "");
assert.equal(splitPage("가".repeat(1201)).rest, "가");
assert.equal(splitPage("👩‍💻".repeat(1201)).rest, "👩‍💻");
assert.equal(cellForOffset("가나\n다", 3), 25);
assert.equal(offsetForCell("가나\n다", 25), 3);

let n = newNotebook();
let r = editPage(n, 0, "가".repeat(1201), 1201);
assert.ok(r.accepted);
assert.equal(r.notebook.pages.length, 2);
assert.equal(r.cursorPage, 1);
assert.equal(r.cursorOffset, 2);
assert.equal(r.notebook.pages[0].text.length, 1199);
assert.equal(r.notebook.pages[1].text, "가가");
assert.equal(n.pages[0].text, "");

n = { title: "이전 글", pages: [newPage("graph"), { ...newPage("blank"), text: "이전 글", strokes: [{ id: "ink", color: "#282a2c", width: 2, points: [{ x: 0.1, y: 0.2, p: 0.5 }] }] }] };
r = editPage(n, 0, "가".repeat(1201), 1201);
assert.equal(r.notebook.pages[1].text, "가이전 글");
assert.equal(r.notebook.pages[1].type, "blank");
assert.deepEqual(r.notebook.pages[1].strokes, n.pages[1].strokes);

r = editPage(newNotebook(), 0, "가".repeat(14399), 14399);
assert.ok(r.accepted);
assert.equal(r.notebook.pages.length, 12);
assert.equal(r.cursorPage, 11);
assert.equal(r.cursorOffset, 1200);
assert.ok(validateNotebook(r.notebook));
assert.equal(r.notebook.pages.map(p => p.text).join("").length, 14399);
const full = r.notebook;
const rejected = editPage(full, 11, full.pages[11].text + "나", 1201);
assert.equal(rejected.accepted, false);
assert.equal(rejected.notebook, full);
assert.equal(full.pages[11].text.length, 1200);

r = editPage(newNotebook(), 0, "가\n".repeat(49), 98);
assert.ok(r.accepted);
assert.equal(r.notebook.pages.length, 2);
assert.equal(r.notebook.pages[0].text, "가\n".repeat(48));
assert.equal(r.notebook.pages[1].text, "가\n");
assert.ok(validateNotebook(r.notebook));
assert.equal(validateNotebook({ ...r.notebook, pages: Array.from({ length: 13 }, () => newPage()) }), false);
assert.equal(validateNotebook({ ...r.notebook, pages: [{ ...newPage(), text: "가".repeat(1201) }] }), false);
assert.equal(validateNotebook({ ...r.notebook, pages: [{ ...newPage(), strokes: [{ id: "bad", color: "#282a2c", width: 2, points: [{ x: NaN, y: .5, p: .5 }] }] }] }), false);
console.log("Notebook checks passed: 1,200 cells, 12 pages, graphemes, paragraphs, overflow, cursor, ink preservation, validation.");
