import assert from "node:assert/strict";
import { addBook, MAX_BOOKS, newBookshelf, newPage, normalizeBookshelf, updateBook, editPage, validateBookshelf } from "../lib/notebook.ts";
import { notebookOwnerId } from "../lib/notebook-identity.ts";

const legacy = { title: "연대논술 26 기출", pages: [
  { ...newPage("blank"), text: "기존에 작성한 글", strokes: [{ id: "legacy-ink", color: "#282a2c", width: 2, points: [{ x: .15, y: .24, p: .6 }] }] },
  { ...newPage("manuscript"), text: "두 번째 장" }
] };
let shelf = normalizeBookshelf(legacy);
assert.equal(shelf.books.length, 1);
assert.equal(shelf.books[0], legacy);
assert.equal(shelf.books[0].title, "연대논술 26 기출");
assert.deepEqual(shelf.books[0].pages[0].strokes, legacy.pages[0].strokes);

shelf = addBook(shelf).shelf;
shelf = addBook(shelf).shelf;
assert.equal(shelf.books.length, MAX_BOOKS);
assert.equal(addBook(shelf).accepted, false);
assert.equal(addBook(shelf).shelf, shelf);
assert.equal(shelf.books[1].title, "");
const untouchedFirst = shelf.books[0];
const untouchedThird = shelf.books[2];
const edit = editPage({ ...shelf.books[1], title: "새 권의 제목" }, 0, "나".repeat(14399), 14399);
assert.ok(edit.accepted);
shelf = updateBook(shelf, 1, edit.notebook);
assert.equal(shelf.books[1].pages.length, 12);
assert.equal(shelf.books[1].title, "새 권의 제목");
assert.equal(shelf.books[0], untouchedFirst);
assert.equal(shelf.books[2], untouchedThird);
assert.ok(validateBookshelf(shelf));
assert.equal(editPage(shelf.books[1], 11, shelf.books[1].pages[11].text + "가", 1201).accepted, false);
assert.equal(validateBookshelf({ books: [...shelf.books, shelf.books[2]] }), false);
assert.equal(normalizeBookshelf({ books: [] }), null);
assert.equal(normalizeBookshelf({ title: "bad", pages: [] }), null);

let full = newBookshelf();
full = addBook(full).shelf;
full = addBook(full).shelf;
full.books = full.books.map((book, index) => editPage({ ...book, title: `${index + 1}권` }, 0, "가".repeat(14399), 14399).notebook);
assert.ok(validateBookshelf(full));
assert.equal(full.books.reduce((sum, b) => sum + b.pages.length, 0), 36);
assert.equal(full.books.reduce((sum, b) => sum + b.pages.reduce((s, p) => s + p.text.length, 0), 0), 43197);

const keyA = "a".repeat(64), keyB = "b".repeat(64);
const ownerA = await notebookOwnerId(null, keyA);
assert.ok(ownerA.startsWith("browser-"));
assert.equal(ownerA, await notebookOwnerId(null, keyA));
assert.notEqual(ownerA, await notebookOwnerId(null, keyB));
assert.equal(await notebookOwnerId(null, "fake"), null);
assert.equal(await notebookOwnerId(null, null), null);
assert.equal(await notebookOwnerId("existing-owner", keyA), "existing-owner");
console.log("Bookshelf checks passed: existing title/text/ink migration, three-book limit, 12 pages per book, 36 total pages, independent edits, browser capability identity and account preservation.");
