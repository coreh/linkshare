import Handlebars from "handlebars";
import { parse } from "smol-toml";
import { readdir } from "fs/promises";
import { join } from "path";
import type { Section, ItemConfig, ResolvedStyle, CdnConfig } from "./types";
import { createTranslator, DEFAULT_LOCALE } from "./i18n";
import type { Catalogs, Translator } from "./i18n";

const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"]);

/** Returns "rtl" or "ltr" based on the locale's script direction. */
function dirForLocale(locale: string): "rtl" | "ltr" {
  // Check the base language tag (e.g. "ar" from "ar-EG")
  const lang = locale.split("-")[0];
  return RTL_LOCALES.has(lang) ? "rtl" : "ltr";
}

/* ==================== Types ==================== */

export interface ThemeDefaults {
  font: string;
  color: string;
  dark: boolean | "auto";
  background_color: string;
  background_color_dark?: string;
  background_color_light?: string;
}

interface ThemeAssets {
  css?: string[];
  js?: string[];
  head_js?: string[];
}

interface ThemeConfig {
  name: string;
  defaults: ThemeDefaults;
  vars?: {
    dark?: Record<string, string>;
    light?: Record<string, string>;
  };
  options?: {
    body_class?: string;
    container_class?: string;
  };
  assets?: ThemeAssets;
}

interface CompiledTheme {
  config: ThemeConfig;
  page: Handlebars.TemplateDelegate;
  login: Handlebars.TemplateDelegate;
  items: Record<string, Handlebars.TemplateDelegate>;
  section: Handlebars.TemplateDelegate;
  css: string;
}

/* ==================== HTML Helpers ==================== */

function e(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resolveUrl(asset: string, sectionPath: string): string {
  if (asset.startsWith("http://") || asset.startsWith("https://")) return asset;
  const base = sectionPath === "/" ? "" : sectionPath;
  return `${base}/${asset}`;
}

/* ==================== Color System ==================== */

const PALETTES: Record<string, string[]> = {
  slate: [
    "#f8fafc",
    "#f1f5f9",
    "#e2e8f0",
    "#cbd5e1",
    "#94a3b8",
    "#64748b",
    "#475569",
    "#334155",
    "#1e293b",
    "#0f172a",
    "#020617",
  ],
  gray: [
    "#f9fafb",
    "#f3f4f6",
    "#e5e7eb",
    "#d1d5db",
    "#9ca3af",
    "#6b7280",
    "#4b5563",
    "#374151",
    "#1f2937",
    "#111827",
    "#030712",
  ],
  zinc: [
    "#fafafa",
    "#f4f4f5",
    "#e4e4e7",
    "#d4d4d8",
    "#a1a1aa",
    "#71717a",
    "#52525b",
    "#3f3f46",
    "#27272a",
    "#18181b",
    "#09090b",
  ],
  neutral: [
    "#fafafa",
    "#f5f5f5",
    "#e5e5e5",
    "#d4d4d4",
    "#a3a3a3",
    "#737373",
    "#525252",
    "#404040",
    "#262626",
    "#171717",
    "#0a0a0a",
  ],
  stone: [
    "#fafaf9",
    "#f5f5f4",
    "#e7e5e3",
    "#d6d3d1",
    "#a8a29e",
    "#78716c",
    "#57534e",
    "#44403c",
    "#292524",
    "#1c1917",
    "#0c0a09",
  ],
  red: [
    "#fef2f2",
    "#fee2e2",
    "#fecaca",
    "#fca5a5",
    "#f87171",
    "#ef4444",
    "#dc2626",
    "#b91c1c",
    "#991b1b",
    "#7f1d1d",
    "#450a0a",
  ],
  orange: [
    "#fff7ed",
    "#ffedd5",
    "#fed7aa",
    "#fdba74",
    "#fb923c",
    "#f97316",
    "#ea580c",
    "#c2410c",
    "#9a3412",
    "#7c2d12",
    "#431407",
  ],
  amber: [
    "#fffbeb",
    "#fef3c7",
    "#fde68a",
    "#fcd34d",
    "#fbbf24",
    "#f59e0b",
    "#d97706",
    "#b45309",
    "#92400e",
    "#78350f",
    "#451a03",
  ],
  yellow: [
    "#fefce8",
    "#fef9c3",
    "#fef08a",
    "#fde047",
    "#facc15",
    "#eab308",
    "#ca8a04",
    "#a16207",
    "#854d0e",
    "#713f12",
    "#422006",
  ],
  lime: [
    "#f7fee7",
    "#ecfccb",
    "#d9f99d",
    "#bef264",
    "#a3e635",
    "#84cc16",
    "#65a30d",
    "#4d7c0f",
    "#3f6212",
    "#365314",
    "#1a2e05",
  ],
  green: [
    "#f0fdf4",
    "#dcfce7",
    "#bbf7d0",
    "#86efac",
    "#4ade80",
    "#22c55e",
    "#16a34a",
    "#15803d",
    "#166534",
    "#14532d",
    "#052e16",
  ],
  emerald: [
    "#ecfdf5",
    "#d1fae5",
    "#a7f3d0",
    "#6ee7b7",
    "#34d399",
    "#10b981",
    "#059669",
    "#047857",
    "#065f46",
    "#064e3b",
    "#022c22",
  ],
  teal: [
    "#f0fdfa",
    "#ccfbf1",
    "#99f6e4",
    "#5eead4",
    "#2dd4bf",
    "#14b8a6",
    "#0d9488",
    "#0f766e",
    "#115e59",
    "#134e4a",
    "#042f2e",
  ],
  cyan: [
    "#ecfeff",
    "#cffafe",
    "#a5f3fc",
    "#67e8f9",
    "#22d3ee",
    "#06b6d4",
    "#0891b2",
    "#0e7490",
    "#155e75",
    "#164e63",
    "#083344",
  ],
  sky: [
    "#f0f9ff",
    "#e0f2fe",
    "#bae6fd",
    "#7dd3fc",
    "#38bdf8",
    "#0ea5e9",
    "#0284c7",
    "#0369a1",
    "#075985",
    "#0c4a6e",
    "#082f49",
  ],
  blue: [
    "#eff6ff",
    "#dbeafe",
    "#bfdbfe",
    "#93c5fd",
    "#60a5fa",
    "#3b82f6",
    "#2563eb",
    "#1d4ed8",
    "#1e40af",
    "#1e3a8a",
    "#172554",
  ],
  indigo: [
    "#eef2ff",
    "#e0e7ff",
    "#c7d2fe",
    "#a5b4fc",
    "#818cf8",
    "#6366f1",
    "#4f46e5",
    "#4338ca",
    "#3730a3",
    "#312e81",
    "#1e1b4e",
  ],
  violet: [
    "#f5f3ff",
    "#ede9fe",
    "#ddd6fe",
    "#c4b5fd",
    "#a78bfa",
    "#8b5cf6",
    "#7c3aed",
    "#6d28d9",
    "#5b21b6",
    "#4c1d95",
    "#2e1065",
  ],
  purple: [
    "#faf5ff",
    "#f3e8ff",
    "#e9d5ff",
    "#d8b4fe",
    "#c084fc",
    "#a855f7",
    "#9333ea",
    "#7e22ce",
    "#6b21a8",
    "#581c87",
    "#3b0764",
  ],
  fuchsia: [
    "#fdf4ff",
    "#fae8ff",
    "#f5d0fe",
    "#f0abfc",
    "#e879f9",
    "#d946ef",
    "#c026d3",
    "#a21caf",
    "#86198f",
    "#701a75",
    "#4a044e",
  ],
  pink: [
    "#fdf2f8",
    "#fce7f3",
    "#fbcfe8",
    "#f9a8d4",
    "#f472b6",
    "#ec4899",
    "#db2777",
    "#be185d",
    "#9d174d",
    "#831843",
    "#500724",
  ],
  rose: [
    "#fff1f2",
    "#ffe4e8",
    "#fecdd3",
    "#fda4af",
    "#fb7185",
    "#f43f5e",
    "#e11d48",
    "#be123c",
    "#9f1239",
    "#881337",
    "#4c0519",
  ],
};

export const COLOR_500: Record<string, string> = {
  slate: "#64748b",
  gray: "#6b7280",
  zinc: "#71717a",
  neutral: "#737373",
  stone: "#78716c",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
};

function colorCssVars(color: string): string {
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  const palette = PALETTES[color] ?? PALETTES.indigo!;
  return shades.map((s, i) => `--color-accent-${s}: ${palette[i]}`).join("; ");
}

/* ==================== Theme Loading ==================== */

const isDev = process.env.NODE_ENV !== "production";
let cache: Map<string, CompiledTheme> | null = null;

export async function loadThemes(
  themesDir: string,
): Promise<Map<string, CompiledTheme>> {
  if (cache && !isDev) return cache;

  const themes = new Map<string, CompiledTheme>();
  try {
    const entries = await readdir(themesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const theme = await loadTheme(join(themesDir, entry.name), entry.name);
      if (theme) themes.set(entry.name, theme);
    }
  } catch {
    // themes directory doesn't exist or isn't readable
  }

  cache = themes;
  return themes;
}

async function loadTheme(
  dir: string,
  fallbackName: string,
): Promise<CompiledTheme | null> {
  const configFile = Bun.file(join(dir, "theme.toml"));
  if (!(await configFile.exists())) return null;

  const raw = parse(await configFile.text()) as Record<string, unknown>;
  const rawDefaults = (raw.defaults || {}) as Record<string, unknown>;
  const rawVars = (raw.vars || {}) as Record<
    string,
    Record<string, string> | undefined
  >;
  const rawOptions = (raw.options || {}) as Record<string, unknown>;
  const rawAssets = (raw.assets || {}) as Record<string, unknown>;

  const darkVal =
    rawDefaults.dark === "auto"
      ? "auto"
      : rawDefaults.dark === false
        ? false
        : rawDefaults.dark === true
          ? true
          : "auto";

  const config: ThemeConfig = {
    name: (raw.name as string) || fallbackName,
    defaults: {
      font: (rawDefaults.font as string) || "Inter",
      color: (rawDefaults.color as string) || "indigo",
      dark: darkVal,
      background_color: (rawDefaults.background_color as string) || "#0f172a",
      background_color_dark:
        (rawDefaults.background_color_dark as string) || undefined,
      background_color_light:
        (rawDefaults.background_color_light as string) || undefined,
    },
    vars: rawVars.dark || rawVars.light ? rawVars : undefined,
    options:
      rawOptions.body_class || rawOptions.container_class
        ? {
            body_class: (rawOptions.body_class as string) || undefined,
            container_class:
              (rawOptions.container_class as string) || undefined,
          }
        : undefined,
    assets:
      rawAssets.css || rawAssets.js || rawAssets.head_js
        ? {
            css: (rawAssets.css as string[]) || undefined,
            js: (rawAssets.js as string[]) || undefined,
            head_js: (rawAssets.head_js as string[]) || undefined,
          }
        : undefined,
  };

  const page = await compileFile(join(dir, "page.html"));
  const login = await compileFile(join(dir, "login.html"));
  if (!page || !login) return null;

  const section = await compileFile(join(dir, "items", "section.html"));
  const itemTypes = [
    "link",
    "text",
    "image",
    "file",
    "video",
    "audio",
    "code",
    "embed",
  ];
  const items: Record<string, Handlebars.TemplateDelegate> = {};
  for (const type of itemTypes) {
    const tmpl = await compileFile(join(dir, "items", `${type}.html`));
    if (tmpl) items[type] = tmpl;
  }

  let css = "";
  const cssFile = Bun.file(join(dir, "style.css"));
  if (await cssFile.exists()) css += await cssFile.text();

  return {
    config,
    page,
    login,
    items,
    section: section || Handlebars.compile(""),
    css,
  };
}

async function compileFile(
  path: string,
): Promise<Handlebars.TemplateDelegate | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return Handlebars.compile(await file.text());
}

/* ==================== Handlebars Helpers ==================== */

// {{dc "dark-classes" "light-classes"}} — outputs the correct set based on dark mode.
// When dark="auto", combines both with Tailwind dark: prefix for auto-switching.
Handlebars.registerHelper(
  "dc",
  function (
    darkClasses: string,
    lightClasses: string,
    options: Handlebars.HelperOptions,
  ) {
    const dark = options.data.root.dark;
    const autoDark = options.data.root.auto_dark;
    if (autoDark) {
      const darkPrefixed = darkClasses
        .split(/\s+/)
        .filter(Boolean)
        .map((c) => `dark:${c}`)
        .join(" ");
      return `${lightClasses} ${darkPrefixed}`;
    }
    return dark ? darkClasses : lightClasses;
  },
);

// {{t "Some string"}} or {{t "Back to {title}" title=parent.title}}
// {{t "Copy" msgctxt="verb"}} for disambiguation context
// All msg* hash args are reserved for gettext and not used as placeholders.
// Using {msg*} placeholders in msgid is an error.
Handlebars.registerHelper(
  "t",
  function (msgid: string, options: Handlebars.HelperOptions) {
    const translator: Translator | undefined = options.data?.root?.__t;
    const msgctxt: string | undefined = options.hash?.msgctxt;
    let translated = translator ? translator(msgid, msgctxt) : msgid;
    // Replace {key} placeholders with hash arguments
    if (options.hash) {
      for (const [key, value] of Object.entries(options.hash)) {
        // Reserve all msg* keys for gettext fields
        if (key.startsWith("msg")) continue;
        translated = translated.replace(
          new RegExp(`\\{${key}\\}`, "g"),
          String(value),
        );
      }
    }
    return translated;
  },
);

/* ==================== Public API ==================== */

export function getThemeDefaults(
  name: string,
  themes: Map<string, CompiledTheme>,
): ThemeDefaults {
  const theme = themes.get(name) || themes.get("default");
  return (
    theme?.config.defaults || {
      font: "Inter",
      color: "indigo",
      dark: "auto" as const,
      background_color: "#0f172a",
    }
  );
}

export function listThemes(themes: Map<string, CompiledTheme>): string[] {
  return Array.from(themes.keys());
}

export function renderPage(
  section: Section,
  themes: Map<string, CompiledTheme>,
  catalogs: Catalogs,
): string {
  const theme = themes.get(section.style.theme) || themes.get("default");
  if (!theme) return fallback404();

  const { style, config, children, path } = section;
  const vars = getVars(theme, style.dark);
  const __t = createTranslator(catalogs, style.locale);

  const isAuto = style.dark === "auto";
  // When auto, pass dark=false so {{#if dark}} picks light as the base,
  // and auto_dark=true so templates can use {{dc}} helper.
  const darkForTemplate = isAuto ? false : style.dark;
  const autoFlag = isAuto ? { auto_dark: true } : {};
  const theme_assets = `/assets/${style.theme}`;

  // Pre-render child section cards
  const childrenHtml = children
    .map((child) =>
      theme.section({
        title: child.config.title,
        description: child.config.description || "",
        path: child.path,
        has_password: !!child.config.password,
        dark: darkForTemplate,
        ...autoFlag,
        theme_assets,
        __t,
        ...vars,
      }),
    )
    .join("\n");

  // Pre-render items
  const items = config.items || [];
  const hasCode = items.some((i) => i.type === "code");
  const hasEmbed = items.some((i) => i.type === "embed");
  const itemsHtml = items
    .map((item) => {
      const type = item.type || "link";
      const tmpl = theme.items[type];
      if (!tmpl) return "";
      return tmpl(
        buildItemContext(item, type, section, vars, __t, theme_assets),
      );
    })
    .join("\n");

  const bgDark =
    style.background_color_dark || style.background_color || "#0f172a";
  const bgLight =
    style.background_color_light || style.background_color || "#ffffff";

  const body = theme.page({
    title: config.title,
    description: config.description || "",
    path,
    logo: style.logo ? resolveUrl(style.logo, path) : "",
    dark: darkForTemplate,
    ...autoFlag,
    background_color_dark: bgDark,
    background_color_light: bgLight,
    parent: section.parent
      ? { path: section.parent.path, title: section.parent.config.title }
      : null,
    is_protected: section.protected,
    show_nav: !!(section.parent || section.protected),
    children_html: childrenHtml,
    items_html: itemsHtml,
    theme_assets,
    locale: style.locale,
    dir: dirForLocale(style.locale),
    __t,
    ...vars,
  });

  return layoutShell(
    {
      title: config.title,
      style,
      sectionPath: path,
      themeAssets: theme_assets,
      hasCode,
      hasEmbed,
      extraStyles: theme.css,
      bodyClass: theme.config.options?.body_class,
      containerClass: theme.config.options?.container_class,
      locale: style.locale,
      themeAssetConfig: theme.config.assets,
    },
    body,
  );
}

export function renderLogin(
  section: Section,
  themes: Map<string, CompiledTheme>,
  catalogs: Catalogs,
  error?: string,
): string {
  const theme = themes.get(section.style.theme) || themes.get("default");
  if (!theme) return fallback404();

  const { style, config, path } = section;
  const vars = getVars(theme, style.dark);
  const __t = createTranslator(catalogs, style.locale);
  const isAuto = style.dark === "auto";
  const darkForTemplate = isAuto ? false : style.dark;
  const autoFlag = isAuto ? { auto_dark: true } : {};

  const loginBgDark =
    style.background_color_dark || style.background_color || "#0f172a";
  const loginBgLight =
    style.background_color_light || style.background_color || "#ffffff";
  const theme_assets = `/assets/${style.theme}`;

  const body = theme.login({
    title: config.title,
    path,
    dark: darkForTemplate,
    ...autoFlag,
    background_color_dark: loginBgDark,
    background_color_light: loginBgLight,
    parent: section.parent
      ? { path: section.parent.path, title: section.parent.config.title }
      : null,
    error: error || "",
    theme_assets,
    locale: style.locale,
    dir: dirForLocale(style.locale),
    __t,
    ...vars,
  });

  return layoutShell(
    {
      title: `${config.title} - Protected`,
      style,
      sectionPath: path,
      themeAssets: theme_assets,
      extraStyles: theme.css,
      bodyClass: theme.config.options?.body_class,
      containerClass: theme.config.options?.container_class,
      locale: style.locale,
      themeAssetConfig: theme.config.assets,
    },
    body,
  );
}

export function render404(catalogs?: Catalogs, locale?: string): string {
  return fallback404(catalogs, locale);
}

/* ==================== Internal Helpers ==================== */

function transformEmbedUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.hostname !== "docs.google.com") return url;

  const path = parsed.pathname;

  // Already embeddable formats — pass through unchanged
  if (/\/(pub|preview|embed)(\/|$)/.test(path)) return url;

  // Google Docs: /document/d/ID/edit... → /document/d/ID/preview
  const docMatch = path.match(/^\/document\/d\/([^/]+)/);
  if (docMatch) {
    return `https://docs.google.com/document/d/${docMatch[1]}/preview`;
  }

  // Google Sheets: /spreadsheets/d/ID/edit... → /spreadsheets/d/ID/preview
  const sheetMatch = path.match(/^\/spreadsheets\/d\/([^/]+)/);
  if (sheetMatch) {
    return `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/preview`;
  }

  // Google Slides: /presentation/d/ID/edit... → /presentation/d/ID/embed
  const slideMatch = path.match(/^\/presentation\/d\/([^/]+)/);
  if (slideMatch) {
    return `https://docs.google.com/presentation/d/${slideMatch[1]}/embed?start=false&loop=false&delayms=3000`;
  }

  // Forms and everything else pass through unchanged
  return url;
}

function getVars(
  theme: CompiledTheme,
  dark: boolean | "auto",
): Record<string, string> {
  if (!theme.config.vars) return {};

  if (dark === "auto") {
    const darkVars = theme.config.vars.dark || {};
    const lightVars = theme.config.vars.light || darkVars;
    const allKeys = new Set([
      ...Object.keys(darkVars),
      ...Object.keys(lightVars),
    ]);
    const merged: Record<string, string> = {};
    for (const key of allKeys) {
      const dv = darkVars[key] || "";
      const lv = lightVars[key] || "";
      if (dv === lv) {
        merged[key] = dv;
      } else {
        const darkPrefixed = dv
          .split(/\s+/)
          .filter(Boolean)
          .map((c) => `dark:${c}`)
          .join(" ");
        merged[key] = `${lv} ${darkPrefixed}`;
      }
    }
    return merged;
  }

  if (dark) return theme.config.vars.dark || {};
  return theme.config.vars.light || theme.config.vars.dark || {};
}

function buildItemContext(
  item: ItemConfig,
  type: string,
  section: Section,
  vars: Record<string, string>,
  __t: Translator,
  theme_assets: string,
): Record<string, unknown> {
  const path = section.path;
  const rawUrl = item.url || "#";
  const url = type === "embed" ? transformEmbedUrl(rawUrl) : rawUrl;
  return {
    title: item.title,
    description: item.description || "",
    url,
    file_url: item.file ? resolveUrl(item.file, path) : item.url || "",
    content: item.content || "",
    language: item.language || "",
    language_class: item.language ? `language-${item.language}` : "",
    height: item.height || 400,
    icon: item.icon ? resolveUrl(item.icon, path) : "",
    filename: item.filename || item.file || "",
    dark: section.style.dark === "auto" ? false : section.style.dark,
    auto_dark: section.style.dark === "auto" ? true : false,
    type,
    theme_assets,
    __t,
    ...vars,
  };
}

/* ==================== CDN Helpers ==================== */

const HLJS_VERSION = "11.11.1";

function hljsScriptUrl(provider: CdnConfig["js"]): string {
  switch (provider) {
    case "jsdelivr":
      return `https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@${HLJS_VERSION}/build/highlight.min.js`;
    case "unpkg":
      return `https://unpkg.com/@highlightjs/cdn-assets@${HLJS_VERSION}/highlight.min.js`;
    case "cdnjs":
    default:
      return `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${HLJS_VERSION}/highlight.min.js`;
  }
}

function hljsStyleUrl(provider: CdnConfig["js"], theme: string): string {
  switch (provider) {
    case "jsdelivr":
      return `https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@${HLJS_VERSION}/build/styles/${theme}.min.css`;
    case "unpkg":
      return `https://unpkg.com/@highlightjs/cdn-assets@${HLJS_VERSION}/styles/${theme}.min.css`;
    case "cdnjs":
    default:
      return `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${HLJS_VERSION}/styles/${theme}.min.css`;
  }
}

function fontLinks(
  provider: CdnConfig["fonts"],
  font: string,
  weights: number[],
): string {
  if (provider === "none" || font === "system-ui") return "";
  const weightsStr = weights.join(";");
  const family = encodeURIComponent(font);
  if (provider === "bunny") {
    return `<link rel="preconnect" href="https://fonts.bunny.net"><link href="https://fonts.bunny.net/css2?family=${family}:wght@${weightsStr}&display=swap" rel="stylesheet">`;
  }
  // Default: google
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=${family}:wght@${weightsStr}&display=swap" rel="stylesheet">`;
}

function themeAssetTags(
  assets: ThemeAssets | undefined,
  themeAssetsBase: string,
  position: "head" | "body",
): string {
  if (!assets) return "";
  const tags: string[] = [];
  if (position === "head") {
    for (const css of assets.css || []) {
      tags.push(`<link rel="stylesheet" href="${themeAssetsBase}/${css}">`);
    }
    for (const js of assets.head_js || []) {
      tags.push(`<script src="${themeAssetsBase}/${js}"></script>`);
    }
  } else {
    for (const js of assets.js || []) {
      tags.push(`<script src="${themeAssetsBase}/${js}"></script>`);
    }
  }
  return tags.join("\n  ");
}

/* ==================== Layout Shell ==================== */

interface ShellOpts {
  title: string;
  style: ResolvedStyle;
  sectionPath: string;
  themeAssets: string;
  hasCode?: boolean;
  hasEmbed?: boolean;
  extraStyles?: string;
  bodyClass?: string;
  containerClass?: string;
  locale?: string;
  themeAssetConfig?: ThemeAssets;
}

function layoutShell(opts: ShellOpts, body: string): string {
  const {
    title,
    style,
    sectionPath,
    themeAssets,
    hasCode,
    hasEmbed,
    extraStyles,
  } = opts;
  const { font, dark, color, background, background_color } = style;
  const isAuto = dark === "auto";

  // Background
  let bgStyle: string;
  let autoBgCss = "";
  if (background) {
    bgStyle = `background-image: url('${e(resolveUrl(background, sectionPath))}'); background-size: cover; background-position: center; background-attachment: fixed;`;
  } else if (isAuto) {
    const bgDark = style.background_color_dark || background_color || "#0f172a";
    const bgLight =
      style.background_color_light || background_color || "#ffffff";
    bgStyle = "";
    autoBgCss = `html:not(.dark) body { background-color: ${bgLight}; } html.dark body { background-color: ${bgDark}; }`;
  } else {
    bgStyle = `background-color: ${e(background_color)};`;
  }

  // Body class: theme-specific extras + text color
  const themeBodyClass = opts.bodyClass || "";
  let textClass: string;
  if (isAuto) {
    textClass = "text-gray-900 dark:text-white";
  } else {
    textClass = dark ? "text-white" : "text-gray-900";
  }
  const bodyClass = `${textClass} ${themeBodyClass}`.trim();

  // Highlight.js theme
  const cdn = style.cdn;
  let highlightLink = "";
  if (hasCode) {
    if (isAuto) {
      highlightLink = `<link rel="stylesheet" href="${hljsStyleUrl(cdn.js, cdn.hljs_theme)}" media="(prefers-color-scheme: light)"><link rel="stylesheet" href="${hljsStyleUrl(cdn.js, cdn.hljs_theme_dark)}" media="(prefers-color-scheme: dark)">`;
    } else {
      const highlightTheme = dark ? cdn.hljs_theme_dark : cdn.hljs_theme;
      highlightLink = `<link rel="stylesheet" href="${hljsStyleUrl(cdn.js, highlightTheme)}">`;
    }
  }

  // Auto dark mode head script (runs before body to prevent flash)
  const autoDarkScript = isAuto
    ? `<script>
    (function(){
      var m = window.matchMedia('(prefers-color-scheme: dark)');
      function apply(dark) { document.documentElement.classList.toggle('dark', dark); }
      apply(m.matches);
      m.addEventListener('change', function(e) { apply(e.matches); });
    })();
  </script>`
    : "";

  const lang = opts.locale || DEFAULT_LOCALE;
  const dir = dirForLocale(lang);

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}"${dark === true ? ' class="dark"' : ""}>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${e(title)}</title>
  <link rel="stylesheet" href="${themeAssets}/tailwind.css">
  ${autoDarkScript}
  ${fontLinks(cdn.fonts, font, cdn.font_weights)}
  ${highlightLink}
  ${themeAssetTags(opts.themeAssetConfig, themeAssets, "head")}
  <style>
    :root { ${colorCssVars(color)} }
    * { font-family: '${font}', system-ui, sans-serif; }
    ${autoBgCss}
    ${hasCode ? "pre code.hljs { background: transparent !important; padding: 0 !important; }" : ""}
    ${
      hasEmbed
        ? `.ls-embed-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; }
    .ls-embed-overlay iframe { width: 95vw; height: 92vh; border: none; border-radius: 8px; }
    .ls-embed-close { position: fixed; top: 12px; right: 16px; z-index: 10001; width: 40px; height: 40px; border-radius: 9999px; background: rgba(255,255,255,0.15); color: #fff; border: none; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
    .ls-embed-close:hover { background: rgba(255,255,255,0.3); }
    .ls-embed-maximize { position: absolute; top: 8px; right: 8px; opacity: 0; transition: opacity 0.15s; cursor: pointer; z-index: 5; border: none; padding: 6px; line-height: 1; display: flex; align-items: center; justify-content: center; }
    [data-embed-container]:hover .ls-embed-maximize { opacity: 1; }`
        : ""
    }
  </style>
</head>
<body${bgStyle ? ` style="${bgStyle}"` : ""} class="${bodyClass} antialiased">
  ${background ? '<div class="fixed inset-0 bg-black/30 -z-10"></div>' : ""}
  <div class="${opts.containerClass || "min-h-screen flex flex-col items-center px-4 py-8 sm:py-12"}">
    ${opts.containerClass ? body : `<div class="w-full max-w-xl">${body}</div>`}
  </div>
  ${extraStyles ? `<style>${extraStyles}</style>` : ""}
  ${hasCode ? `<script src="${hljsScriptUrl(cdn.js)}"></script><script>hljs.highlightAll();</script>` : ""}
  ${themeAssetTags(opts.themeAssetConfig, themeAssets, "body")}
  ${
    hasEmbed
      ? `<script>
  function toggleMaximize(btn) {
    var container = btn.closest('[data-embed-container]');
    if (!container) return;
    var iframe = container.querySelector('iframe');
    if (!iframe) return;
    var overlay = document.createElement('div');
    overlay.className = 'ls-embed-overlay';
    var clone = iframe.cloneNode(true);
    clone.removeAttribute('height');
    clone.style.width = '95vw';
    clone.style.height = '92vh';
    overlay.appendChild(clone);
    var closeBtn = document.createElement('button');
    closeBtn.className = 'ls-embed-close';
    closeBtn.innerHTML = '&#10005;';
    closeBtn.onclick = function() { overlay.remove(); };
    overlay.appendChild(closeBtn);
    overlay.addEventListener('click', function(ev) {
      if (ev.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }
  </script>`
      : ""
  }
</body>
</html>`;
}

function fallback404(catalogs?: Catalogs, locale?: string): string {
  const __t = catalogs
    ? createTranslator(catalogs, locale || DEFAULT_LOCALE)
    : (s: string) => s;
  const style: ResolvedStyle = {
    theme: "default",
    color: "indigo",
    dark: true,
    font: "Inter",
    background_color: "#0f172a",
    accent_color: "#6366f1",
    locale: locale || DEFAULT_LOCALE,
    cdn: {
      js: "cdnjs",
      fonts: "google",
      font_weights: [300, 400, 500, 600, 700],
      hljs_theme: "github",
      hljs_theme_dark: "github-dark",
    },
  };
  return layoutShell(
    {
      title: __t("Not Found"),
      style,
      sectionPath: "/",
      themeAssets: `/assets/${style.theme}`,
      locale: locale || DEFAULT_LOCALE,
    },
    `
    <div class="text-center py-20">
      <div class="text-6xl font-bold mb-4 text-white/20">404</div>
      <h1 class="text-2xl font-bold mb-2">${e(__t("Page Not Found"))}</h1>
      <p class="text-white/60 mb-6">${e(__t("The page you're looking for doesn't exist."))}</p>
      <a href="/" class="inline-flex items-center gap-2 text-accent-400 hover:text-accent-300 transition-colors">
        <svg class="w-4 h-4 rtl:scale-x-[-1]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        ${e(__t("Go home"))}
      </a>
    </div>`,
  );
}
