import { parse } from "smol-toml";
import { readdir } from "fs/promises";
import { join } from "path";
import type {
  Section,
  SectionConfig,
  ResolvedStyle,
  ScanResult,
  CdnConfig,
} from "./types";
import type { ThemeDefaults } from "./theme-engine";
import { COLOR_500 } from "./theme-engine";

function stripNumericPrefix(name: string): string {
  return name.replace(/^\d+-/, "");
}

export async function scanContent(
  contentDir: string,
  getDefaults: (themeName: string) => ThemeDefaults,
): Promise<ScanResult> {
  const sections = new Map<string, Section>();
  const root = await scanDirectory(
    contentDir,
    "/",
    null,
    sections,
    getDefaults,
  );
  return { root, sections };
}

async function scanDirectory(
  dir: string,
  urlPath: string,
  parent: Section | null,
  sections: Map<string, Section>,
  getDefaults: (themeName: string) => ThemeDefaults,
): Promise<Section> {
  const configPath = join(dir, "config.toml");
  let config: SectionConfig = { title: "Untitled" };

  const configFile = Bun.file(configPath);
  if (await configFile.exists()) {
    const text = await configFile.text();
    config = parse(text) as unknown as SectionConfig;
  }

  // Default title to folder name if not provided
  if (!config.title) {
    const slug = urlPath === "/" ? "Home" : urlPath.split("/").pop()!;
    config.title = slug;
  }

  const style = resolveStyle(config, parent, getDefaults);

  // A section is "protected" if it has a password or any ancestor does
  const isProtected = !!config.password || (parent?.protected ?? false);

  const section: Section = {
    slug: urlPath === "/" ? "" : urlPath.split("/").pop()!,
    path: urlPath,
    dirPath: dir,
    config,
    children: [],
    parent,
    style,
    protected: isProtected,
    hidden: !!config.hidden,
  };

  sections.set(urlPath, section);

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const sorted = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of sorted) {
      if (stripNumericPrefix(entry.name) === "assets" && urlPath === "/") {
        console.warn(
          `Warning: content directory "/assets" conflicts with theme asset route /assets/*. It will be shadowed.`,
        );
      }
      const childSlug = stripNumericPrefix(entry.name);
      const childPath =
        urlPath === "/" ? `/${childSlug}` : `${urlPath}/${childSlug}`;
      const childDir = join(dir, entry.name);

      const childConfig = Bun.file(join(childDir, "config.toml"));
      if (await childConfig.exists()) {
        const child = await scanDirectory(
          childDir,
          childPath,
          section,
          sections,
          getDefaults,
        );
        section.children.push(child);
      }
    }
  } catch {
    // Directory not readable, skip children
  }

  return section;
}

const CDN_DEFAULTS: CdnConfig = {
  js: "cdnjs",
  fonts: "google",
  font_weights: [300, 400, 500, 600, 700],
  hljs_theme: "github",
  hljs_theme_dark: "github-dark",
};

function resolveStyle(
  config: SectionConfig,
  parent: Section | null,
  getDefaults: (themeName: string) => ThemeDefaults,
): ResolvedStyle {
  const inherit = config.inherit !== false;

  // Determine theme name first
  const themeName =
    config.theme ?? (inherit && parent ? parent.style.theme : "default");
  const themeDefaults = getDefaults(themeName);

  // Build base style: if the theme changed (explicit theme set), use theme
  // defaults as the base; otherwise inherit from parent.
  const themeChanged = !!config.theme && config.theme !== parent?.style.theme;
  const base: ResolvedStyle =
    inherit && parent && !themeChanged
      ? parent.style
      : {
          theme: themeName,
          color: themeDefaults.color,
          dark: themeDefaults.dark,
          font: themeDefaults.font,
          background_color: themeDefaults.background_color,
          background_color_dark: themeDefaults.background_color_dark,
          background_color_light: themeDefaults.background_color_light,
          accent_color: COLOR_500[themeDefaults.color] || "#6366f1",
          locale: "en",
          cdn: CDN_DEFAULTS,
        };

  const color = config.color ?? base.color;

  return {
    theme: themeName,
    color,
    dark: config.dark ?? base.dark,
    font: config.font ?? base.font,
    background: config.background ?? (inherit ? base.background : undefined),
    background_color: config.background_color ?? base.background_color,
    background_color_dark: base.background_color_dark,
    background_color_light: base.background_color_light,
    logo: config.logo ?? (inherit ? base.logo : undefined),
    accent_color: config.accent_color ?? COLOR_500[color] ?? base.accent_color,
    locale: config.locale ?? base.locale,
    cdn: {
      js: config.cdn?.js ?? base.cdn.js,
      fonts: config.cdn?.fonts ?? base.cdn.fonts,
      font_weights: config.cdn?.font_weights ?? base.cdn.font_weights,
      hljs_theme: config.cdn?.hljs_theme ?? base.cdn.hljs_theme,
      hljs_theme_dark: config.cdn?.hljs_theme_dark ?? base.cdn.hljs_theme_dark,
    },
  };
}
