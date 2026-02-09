/**
 * Extract translatable strings from theme templates and source files.
 * Scans for {{t "..."}} / {{{t "..."}}} in Handlebars templates
 * and __t("...") calls in TypeScript source.
 * Writes locales/linkshare.pot and optionally merges into existing .po files.
 */
import { readdir } from "fs/promises";
import { join, relative, resolve } from "path";
import gettextParser from "gettext-parser";

const ROOT = resolve(import.meta.dir, "..");
const THEMES_DIR = join(ROOT, "themes");
const SRC_DIR = join(ROOT, "src");
const LOCALES_DIR = join(ROOT, "locales");
const POT_PATH = join(LOCALES_DIR, "linkshare.pot");

interface ExtractedString {
  msgid: string;
  msgctxt?: string;
  references: string[];
}

/** Map key is "msgctxt\x04msgid" (with context) or just "msgid" (without) */
const strings = new Map<string, ExtractedString>();

const MSG_PLACEHOLDER_PATTERN = /\{msg\w*\}/;
let warnings = 0;

function addString(
  msgid: string,
  file: string,
  line?: number,
  msgctxt?: string,
) {
  // Warn about {msg*} placeholders in msgid — these are reserved
  if (MSG_PLACEHOLDER_PATTERN.test(msgid)) {
    const ref = line ? `${file}:${line}` : file;
    console.warn(
      `WARNING: ${ref} — msgid "${msgid}" contains a {msg*} placeholder. All msg* names are reserved for gettext fields.`,
    );
    warnings++;
  }

  const key = msgctxt ? `${msgctxt}\x04${msgid}` : msgid;
  const existing = strings.get(key);
  const ref = line ? `${file}:${line}` : file;
  if (existing) {
    existing.references.push(ref);
  } else {
    strings.set(key, { msgid, msgctxt, references: [ref] });
  }
}

// Extract from Handlebars templates: {{t "..."}} and {{{t "..."}}}
// Captures the full helper invocation to parse msgctxt hash arg
const HBS_PATTERN = /\{\{\{?\s*t\s+"([^"]+)"([^}]*)\}\}\}?/g;
const MSGCTXT_PATTERN = /msgctxt="([^"]+)"/;

async function extractFromTemplates() {
  const themes = await readdir(THEMES_DIR, { withFileTypes: true });
  for (const theme of themes) {
    if (!theme.isDirectory() || theme.name.startsWith(".")) continue;
    await scanDir(join(THEMES_DIR, theme.name));
  }
}

async function scanDir(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDir(fullPath);
    } else if (entry.name.endsWith(".html")) {
      const content = await Bun.file(fullPath).text();
      const relPath = relative(ROOT, fullPath);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        let match;
        HBS_PATTERN.lastIndex = 0;
        while ((match = HBS_PATTERN.exec(lines[i])) !== null) {
          const msgid = match[1];
          const rest = match[2] || "";
          const ctxMatch = MSGCTXT_PATTERN.exec(rest);
          addString(msgid, relPath, i + 1, ctxMatch?.[1]);
        }
      }
    }
  }
}

// Extract from TypeScript source: __t("...") or __t("...", "context")
const TS_PATTERN = /__t\(\s*"([^"]+)"(?:\s*,\s*"([^"]+)")?\s*\)/g;

async function extractFromSource() {
  const entries = await readdir(SRC_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.name.endsWith(".ts")) continue;
    const fullPath = join(SRC_DIR, entry.name);
    const content = await Bun.file(fullPath).text();
    const relPath = relative(ROOT, fullPath);
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      let match;
      TS_PATTERN.lastIndex = 0;
      while ((match = TS_PATTERN.exec(lines[i])) !== null) {
        addString(match[1], relPath, i + 1, match[2]);
      }
    }
  }
}

function buildPot(): Buffer {
  const translations: Record<
    string,
    Record<
      string,
      {
        msgid: string;
        msgctxt?: string;
        msgstr: string[];
        comments?: { reference: string };
      }
    >
  > = {
    "": {
      "": {
        msgid: "",
        msgstr: [
          "Content-Type: text/plain; charset=UTF-8\n" +
            "Content-Transfer-Encoding: 8bit\n" +
            "MIME-Version: 1.0\n",
        ],
      },
    },
  };

  for (const [, entry] of strings) {
    const ctx = entry.msgctxt || "";
    if (!translations[ctx]) translations[ctx] = {};
    translations[ctx][entry.msgid] = {
      msgid: entry.msgid,
      ...(entry.msgctxt ? { msgctxt: entry.msgctxt } : {}),
      msgstr: [""],
      comments: {
        reference: entry.references.join("\n"),
      },
    };
  }

  return gettextParser.po.compile({
    charset: "utf-8",
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "content-transfer-encoding": "8bit",
      "mime-version": "1.0",
    },
    translations,
  });
}

async function mergePo(poPath: string, pot: Map<string, ExtractedString>) {
  const file = Bun.file(poPath);
  if (!(await file.exists())) return;

  const existing = gettextParser.po.parse(await file.text());

  // Add new strings not yet in the .po
  for (const [, entry] of pot) {
    const ctx = entry.msgctxt || "";
    if (!existing.translations[ctx]) existing.translations[ctx] = {};
    const bucket = existing.translations[ctx];

    if (!bucket[entry.msgid]) {
      bucket[entry.msgid] = {
        msgid: entry.msgid,
        ...(entry.msgctxt ? { msgctxt: entry.msgctxt } : {}),
        msgstr: [""],
        comments: {
          reference: entry.references.join("\n"),
        },
      };
    } else {
      // Update references
      bucket[entry.msgid].comments = {
        ...bucket[entry.msgid].comments,
        reference: entry.references.join("\n"),
      };
    }
  }

  await Bun.write(poPath, gettextParser.po.compile(existing));
}

// Main
await extractFromTemplates();
await extractFromSource();

console.log(`Extracted ${strings.size} translatable strings`);
if (warnings > 0) {
  console.warn(`${warnings} warning(s) — see above`);
}

// Write .pot
await Bun.write(POT_PATH, buildPot());
console.log(`Written ${POT_PATH}`);

// Merge into existing .po files
const localeEntries = await readdir(LOCALES_DIR, { withFileTypes: true });
for (const entry of localeEntries) {
  if (!entry.isDirectory() || entry.name === "compiled") continue;
  const poPath = join(LOCALES_DIR, entry.name, "linkshare.po");
  const poFile = Bun.file(poPath);
  if (await poFile.exists()) {
    await mergePo(poPath, strings);
    console.log(`Merged into ${poPath}`);
  }
}
