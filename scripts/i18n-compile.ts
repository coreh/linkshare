/**
 * Compile .po files into JSON catalogs for runtime use.
 * Reads locales/<locale>/linkshare.po, writes locales/compiled/<locale>.json.
 * English doesn't need compilation (runtime falls back to msgid).
 */
import { readdir } from "fs/promises";
import { join, resolve } from "path";
import gettextParser from "gettext-parser";

const ROOT = resolve(import.meta.dir, "..");
const LOCALES_DIR = join(ROOT, "locales");
const COMPILED_DIR = join(LOCALES_DIR, "compiled");

const entries = await readdir(LOCALES_DIR, { withFileTypes: true });
let compiled = 0;

for (const entry of entries) {
  if (!entry.isDirectory() || entry.name === "compiled" || entry.name === "en")
    continue;

  const locale = entry.name;
  const poPath = join(LOCALES_DIR, locale, "linkshare.po");
  const poFile = Bun.file(poPath);
  if (!(await poFile.exists())) continue;

  const parsed = gettextParser.po.parse(await poFile.text());
  const catalog: Record<string, string> = {};

  const translations = parsed.translations[""] || {};
  for (const [msgid, entry] of Object.entries(translations)) {
    if (!msgid) continue; // skip metadata entry
    const msgstr = entry.msgstr?.[0];
    if (msgstr) {
      catalog[msgid] = msgstr;
    }
  }

  const jsonPath = join(COMPILED_DIR, `${locale}.json`);
  await Bun.write(jsonPath, JSON.stringify(catalog, null, 2));
  console.log(`Compiled ${locale}: ${Object.keys(catalog).length} translations → ${jsonPath}`);
  compiled++;
}

if (compiled === 0) {
  console.log("No non-English .po files found to compile");
} else {
  console.log(`Compiled ${compiled} locale(s)`);
}
