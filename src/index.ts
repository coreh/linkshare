import { Elysia } from "elysia";
import type { Cookie } from "elysia/cookies";
import { join, resolve } from "path";
import { scanContent } from "./scanner";
import { getOrCreateSecret, getAuthedPaths, addAuthedPath } from "./auth";
import {
  loadThemes,
  renderPage,
  renderLogin,
  render404,
  getThemeDefaults,
} from "./theme-engine";
import type { Section, ScanResult } from "./types";
import { loadCatalogs } from "./i18n";
import type { Catalogs } from "./i18n";

const CONTENT_DIR = resolve(process.env.CONTENT_DIR || "./content");
const THEMES_DIR = resolve(process.env.THEMES_DIR || "./themes");
const LOCALES_DIR = resolve(process.env.LOCALES_DIR || "./locales");
const AUTH_SECRET = getOrCreateSecret(resolve("."));
const PORT = parseInt(process.env.PORT || "3000", 10);
const isDev = process.env.NODE_ENV !== "production";

interface AppState {
  scan: ScanResult;
  themes: Awaited<ReturnType<typeof loadThemes>>;
  catalogs: Catalogs;
}

let cached: AppState | null = null;

async function getState(): Promise<AppState> {
  if (isDev || !cached) {
    const themes = await loadThemes(THEMES_DIR);
    const scan = await scanContent(CONTENT_DIR, (name) =>
      getThemeDefaults(name, themes),
    );
    const catalogs = await loadCatalogs(LOCALES_DIR);
    cached = { scan, themes, catalogs };
  }
  return cached;
}

function findOwningSection(
  sections: Map<string, Section>,
  urlPath: string,
): Section | undefined {
  const parts = urlPath.split("/").filter(Boolean);
  while (parts.length > 0) {
    parts.pop();
    const sectionPath = parts.length === 0 ? "/" : "/" + parts.join("/");
    const section = sections.get(sectionPath);
    if (section) return section;
  }
  return sections.get("/");
}

function isAuthorized(section: Section, authedPaths: Set<string>): boolean {
  // Walk up the ancestor chain; every section with a password must be authed
  let current: Section | null = section;
  while (current) {
    if (current.config.password && !authedPaths.has(current.path)) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

function findLockingSection(
  section: Section,
  authedPaths: Set<string>,
): Section {
  // Find the first ancestor (or self) with a password that is NOT authed
  let current: Section | null = section;
  let locker: Section = section;
  while (current) {
    if (current.config.password && !authedPaths.has(current.path)) {
      locker = current;
    }
    current = current.parent;
  }
  return locker;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handleGet(urlPath: string, cookieValue: string | undefined) {
  const { sections, themes, catalogs } = await getState().then((s) => ({
    sections: s.scan.sections,
    themes: s.themes,
    catalogs: s.catalogs,
  }));
  const authedPaths = getAuthedPaths(cookieValue, AUTH_SECRET);

  const section = sections.get(urlPath);
  if (section) {
    if (!isAuthorized(section, authedPaths)) {
      const locker = findLockingSection(section, authedPaths);
      return htmlResponse(renderLogin(locker, themes, catalogs));
    }
    return htmlResponse(renderPage(section, themes, catalogs));
  }

  // Block config files
  if (urlPath.endsWith(".toml")) {
    return htmlResponse(render404(catalogs), 404);
  }

  // Serve static file from content directory
  const filePath = join(CONTENT_DIR, urlPath);

  // Prevent path traversal
  if (!resolve(filePath).startsWith(CONTENT_DIR)) {
    return htmlResponse(render404(catalogs), 404);
  }

  const file = Bun.file(filePath);
  if (await file.exists()) {
    const owningSection = findOwningSection(sections, urlPath);
    if (owningSection && !isAuthorized(owningSection, authedPaths)) {
      return new Response("Unauthorized", { status: 401 });
    }
    return new Response(file);
  }

  return htmlResponse(render404(catalogs), 404);
}

type RedirectFn = (
  url: string,
  status?: 301 | 302 | 303 | 307 | 308,
) => Response;

async function handlePost(
  urlPath: string,
  body: unknown,
  authCookie: Cookie<unknown>,
  redirect: RedirectFn,
) {
  const { scan, themes, catalogs } = await getState();
  const { sections } = scan;

  const section = sections.get(urlPath);
  if (!section) {
    return htmlResponse(render404(catalogs), 404);
  }

  const formData = body as Record<string, string> | null;

  // Handle logout
  if (formData?.action === "logout") {
    authCookie.value = "";
    authCookie.httpOnly = true;
    authCookie.path = "/";
    authCookie.maxAge = 0;
    authCookie.sameSite = "lax";
    return redirect(urlPath);
  }

  if (!section.config.password) {
    return redirect(urlPath);
  }

  const password = formData?.password;

  if (password && password === section.config.password) {
    const newCookie = addAuthedPath(
      authCookie.value as string | undefined,
      urlPath,
      AUTH_SECRET,
    );
    authCookie.value = newCookie;
    authCookie.httpOnly = true;
    authCookie.path = "/";
    authCookie.maxAge = 86400;
    authCookie.sameSite = "lax";
    return redirect(urlPath);
  }

  return htmlResponse(
    renderLogin(section, themes, catalogs, "Incorrect password"),
    401,
  );
}

const app = new Elysia()
  .get("/assets/*", async ({ params }) => {
    const rest = params["*"] || "";
    const slashIdx = rest.indexOf("/");
    if (slashIdx < 0) return new Response("Not Found", { status: 404 });

    const themeName = rest.slice(0, slashIdx);
    const filePath = rest.slice(slashIdx + 1);
    if (!themeName || !filePath)
      return new Response("Not Found", { status: 404 });

    const resolved = resolve(join(THEMES_DIR, themeName, "assets", filePath));
    const assetsRoot = resolve(join(THEMES_DIR, themeName, "assets"));
    if (!resolved.startsWith(assetsRoot + "/") && resolved !== assetsRoot) {
      return new Response("Not Found", { status: 404 });
    }

    const file = Bun.file(resolved);
    if (await file.exists()) return new Response(file);
    return new Response("Not Found", { status: 404 });
  })
  .get("/", ({ cookie: { ls_auth } }) => {
    return handleGet("/", ls_auth.value as string | undefined);
  })
  .get("/*", ({ params, cookie: { ls_auth } }) => {
    const urlPath = "/" + (params["*"] || "");
    return handleGet(urlPath, ls_auth.value as string | undefined);
  })
  .post("/", async ({ body, cookie: { ls_auth }, redirect }) => {
    return handlePost("/", body, ls_auth, redirect);
  })
  .post("/*", async ({ params, body, cookie: { ls_auth }, redirect }) => {
    const urlPath = "/" + (params["*"] || "");
    return handlePost(urlPath, body, ls_auth, redirect);
  });

if (import.meta.main) {
  app.listen(PORT);
  console.log(`LinkShare running at http://localhost:${PORT}`);
  console.log(`Serving content from ${CONTENT_DIR}`);
  console.log(`Loading themes from ${THEMES_DIR}`);
  if (isDev) {
    console.log(`Development mode: content & themes reload on each request`);
  }
}

export default app;
