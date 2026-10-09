import assert from "node:assert/strict";
import { encodeBackup, decodeBackup } from "../lib/notebook-backup.ts";
import { newBookshelf, newPage, addBook } from "../lib/notebook.ts";
let shelf = newBookshelf();
shelf.books[0].title = "원고와 필기 백업";
shelf.books[0].pages[0].text = "첫 문장.\n새 문단 2026 abc!";
shelf.books[0].pages[0].strokes = [{ id: "ink", color: "#274e80", width: 3, points: [{ x: .2, y: .3, p: .7 }, { x: .8, y: .5, p: .5 }] }];
shelf.books[0].pages.push({ ...newPage("graph"), text: "모눈종이에 글" });
shelf = addBook(shelf).shelf; shelf = addBook(shelf).shelf;
assert.deepEqual(decodeBackup(encodeBackup(shelf)), shelf);
assert.deepEqual(decodeBackup(JSON.stringify(shelf)), shelf);
assert.equal(decodeBackup(JSON.stringify(shelf.books[0])).books[0].title, shelf.books[0].title);
assert.throws(() => decodeBackup("{"), /JSON/);
assert.throws(() => decodeBackup(JSON.stringify({ format: "hankan-bookshelf", version: 2, bookshelf: shelf })), /지원/);
assert.throws(() => decodeBackup(JSON.stringify({ books: [shelf.books[0], shelf.books[0], shelf.books[0], shelf.books[0]] })), /3권/);
assert.throws(() => decodeBackup(JSON.stringify({ books: [{ title: "bad", pages: [] }] })));
console.log("Backup checks passed: title, text, ink, paper types, three books, legacy import and malformed-file rejection.");

