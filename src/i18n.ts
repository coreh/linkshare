import { readdir } from "fs/promises";
import { join, basename } from "path";

export const DEFAULT_LOCALE = "en";

export type Catalog = Map<string, string>;
export type Catalogs = Map<string, Catalog>;
export type Translator = (msgid: string) => string;

export async function loadCatalogs(localesDir: string): Promise<Catalogs> {
  const catalogs: Catalogs = new Map();
  const compiledDir = join(localesDir, "compiled");

  try {
    const entries = await readdir(compiledDir);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const locale = basename(entry, ".json");
      const file = Bun.file(join(compiledDir, entry));
      if (!(await file.exists())) continue;
      const data = (await file.json()) as Record<string, string>;
      const catalog: Catalog = new Map(Object.entries(data));
      catalogs.set(locale, catalog);
    }
  } catch {
    // compiled directory doesn't exist yet — no translations available
  }

  return catalogs;
}

export function t(catalogs: Catalogs, locale: string, msgid: string): string {
  if (locale === DEFAULT_LOCALE) return msgid;
  const catalog = catalogs.get(locale);
  if (!catalog) return msgid;
  return catalog.get(msgid) || msgid;
}

export function createTranslator(
  catalogs: Catalogs,
  locale: string,
): Translator {
  return (msgid: string) => t(catalogs, locale, msgid);
}
