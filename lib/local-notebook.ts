import { normalizeBookshelf, type Bookshelf } from "./notebook.ts";
type StoredNotebook = { notebook: Bookshelf; revision: number; updatedAt: string };
const DB_NAME = "hankan", STORE = "notebooks", KEY = "bookshelf";
export class RevisionConflict extends Error {
  constructor() { super("다른 탭에서 책장이 변경됐어요. 현재 책장을 백업한 뒤 새로 불러와 주세요."); this.name = "RevisionConflict"; }
}
function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("이 브라우저에서 자동 저장을 사용할 수 없어요. 일반 브라우저 창에서 다시 열어 주세요."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => reject(new Error("브라우저 저장소를 열지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요."));
    request.onblocked = () => reject(new Error("다른 한칸 탭을 닫은 뒤 다시 불러와 주세요."));
  });
}
export async function loadLocalNotebook(): Promise<StoredNotebook | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        const data = request.result as StoredNotebook | undefined;
        if (!data) { resolve(null); return; }
        const notebook = normalizeBookshelf(data.notebook);
        if (!notebook || !Number.isInteger(data.revision) || data.revision < 1 || typeof data.updatedAt !== "string") {
          reject(new Error("저장된 책장을 확인할 수 없어요. 백업 파일이 있다면 불러와 주세요.")); return;
        }
        resolve({ ...data, notebook });
      };
      request.onerror = () => reject(new Error("책장을 불러오지 못했어요."));
      transaction.onabort = () => reject(new Error("책장을 불러오지 못했어요."));
    });
  } finally { db.close(); }
}
export async function saveLocalNotebook(notebook: Bookshelf, expectedRevision: number): Promise<StoredNotebook> {
  if (!normalizeBookshelf(notebook)) throw new Error("책장 형식을 확인해 주세요.");
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE), request = store.get(KEY);
      const next = { notebook, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
      let failure: Error | null = null;
      request.onsuccess = () => {
        const current = request.result as StoredNotebook | undefined;
        if ((current?.revision ?? 0) !== expectedRevision) { failure = new RevisionConflict(); transaction.abort(); return; }
        store.put(next, KEY);
      };
      transaction.oncomplete = () => resolve(next);
      transaction.onabort = () => reject(failure ?? new Error("자동 저장하지 못했어요. 책장 백업으로 글과 필기를 먼저 보관해 주세요."));
      transaction.onerror = () => { failure ??= new Error("브라우저 저장 공간이 부족하거나 저장이 차단됐어요. 책장을 백업해 주세요."); };
    });
  } finally { db.close(); }
}

