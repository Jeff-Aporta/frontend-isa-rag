/**
 * Re-exports + helpers runtime compartidos (front + worker).
 */
export * from "./types.ts";

export function newId(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}

export function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

export function isSupportedFilename(filename: string): boolean {
  const ext = extOf(filename);
  return (
    ext === ".pdf" ||
    ext === ".txt" ||
    ext === ".md" ||
    ext === ".markdown" ||
    ext === ".csv" ||
    ext === ".html" ||
    ext === ".htm" ||
    ext === ".json" ||
    ext === ".docx"
  );
}
