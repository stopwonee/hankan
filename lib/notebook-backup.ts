import { normalizeBookshelf, type Bookshelf } from "./notebook.ts";
export const MAX_BACKUP_BYTES = 24_000_000;
export function encodeBackup(bookshelf: Bookshelf) {
  if (!normalizeBookshelf(bookshelf)) throw new Error("책장 형식을 확인해 주세요.");
  return JSON.stringify({ format: "hankan-bookshelf", version: 1, exportedAt: new Date().toISOString(), bookshelf });
}
export function decodeBackup(raw: string): Bookshelf {
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error("백업 파일이 너무 커요.");
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error("올바른 JSON 백업 파일이 아니에요."); }
  if (data && typeof data === "object" && "format" in data) {
    const backup = data as { format?: unknown; version?: unknown; bookshelf?: unknown };
    if (backup.format !== "hankan-bookshelf" || backup.version !== 1) throw new Error("지원하지 않는 백업 형식이에요.");
    data = backup.bookshelf;
  }
  const shelf = normalizeBookshelf(data);
  if (!shelf) throw new Error("최대 3권, 권당 12장인 한칸 백업 파일을 선택해 주세요.");
  return shelf;
}

