# LinkShare

A simple, hierarchical link sharing application. Like Linktree, but with nested sections, password protection, and full customization — all driven by TOML config files.

## Quick Start

```bash
bun install
bun dev
```

Open http://localhost:3000.

## How It Works

Create a `content/` directory with nested folders. Each folder with a `config.toml` becomes a section.

```
content/
├── config.toml              # Root page
├── logo.png                 # Assets served automatically
├── work/
│   ├── config.toml          # /work section
│   └── projects/
│       └── config.toml      # /work/projects section
└── personal/
    ├── config.toml           # /personal section
    └── background.jpg        # Section-specific assets
```

## Config Format

Each `config.toml` defines a section:

```toml
title = "My Links"
description = "Shared resources for the team"

# Access control
# password = "secret123"

# Appearance
# theme = "default"                # Theme name (see Themes below)
# dark = "auto"                    # true, false, or "auto" (default: "auto")
# background = "background.jpg"    # Local file or URL
# background_color = "#0f172a"     # CSS color
# logo = "logo.png"                # Local file or URL
# font = "Inter"                   # Any Google Font
# color = "violet"                 # Tailwind color palette name
# accent_color = "#6366f1"         # Accent color (hex)
# locale = "en"                    # Language code (see Localization below)
# inherit = true                   # Inherit parent styling (default: true)

# Links
[[items]]
title = "Example"
url = "https://example.com"
description = "An example link"
# icon = "icon.png"                # Custom icon (local file or URL)

# Text notes
[[items]]
title = "Important Note"
type = "text"
content = "This is a text note displayed inline."

# Images
[[items]]
title = "Team Photo"
type = "image"
file = "photo.jpg"                 # Local file
# description = "From the offsite"

# Downloadable files
[[items]]
title = "Project Report"
type = "file"
file = "report.pdf"               # Local file
# url = "https://s3.example.com/report.pdf"  # Or remote URL
# filename = "report-q4.pdf"      # Suggested download filename

# Video
[[items]]
title = "Demo Recording"
type = "video"
file = "demo.mp4"                 # Local file or url = "https://..."

# Audio
[[items]]
title = "Podcast Episode"
type = "audio"
file = "episode.mp3"              # Local file or url = "https://..."

# Code snippets (with syntax highlighting)
[[items]]
title = "Quick Start"
type = "code"
language = "bash"                  # Language hint for highlighting
content = "bun install && bun dev"

# Embeds (iframes)
[[items]]
title = "Location"
type = "embed"
url = "https://www.google.com/maps/embed?..."
# height = 400                    # iframe height in px (default: 400)
```

## Item Types

| Type | Fields | Description |
|------|--------|-------------|
| `link` (default) | `url`, `description`, `icon` | A clickable external link |
| `text` | `content` | An inline text note |
| `image` | `file` or `url`, `description` | An inline image |
| `file` | `file` or `url`, `filename`, `description` | Downloadable file with download button |
| `video` | `file` or `url`, `description` | Embedded video player |
| `audio` | `file` or `url`, `description` | Embedded audio player |
| `code` | `content`, `language` | Syntax-highlighted code snippet (highlight.js) |
| `embed` | `url`, `height`, `description` | iframe embed (YouTube, Maps, etc.) |

## Themes

LinkShare ships with several built-in themes: `bare`, `book`, `carnival`, `chalk`, `christmas`, `comic-sans`, `cooking`, `default`, `dog`, `easter`, `halloween`, `kawaii`, `retro`, `sherlock`, `vaporwave`, and `win98`.

Set a theme per-section in `config.toml`:

```toml
theme = "retro"
```

Each theme is a directory under `themes/` containing a `theme.toml`, Handlebars templates, and a `style.css`. You can create custom themes by adding new directories there.

## Dark Mode

The `dark` option is tri-state:

- `"auto"` (default) — follows the user's system preference via `prefers-color-scheme`
- `true` — always dark
- `false` — always light

```toml
dark = true
```

## Style Inheritance

By default, child sections inherit their parent's styling (font, theme, colors, logo, background). Override any property in the child's `config.toml`, or set `inherit = false` to start fresh.

## Password Protection

Add `password = "your-password"` to any section's `config.toml`. The password check is **server-side** — protected content is never sent to the browser until authenticated. Auth tokens are stored in signed cookies (24h expiry).

## Localization

LinkShare supports multiple languages. Set `locale` per-section in `config.toml`:

```toml
locale = "pt-BR"
```

The locale is inherited by child sections. Available locales: `ar`, `de`, `el`, `en`, `es`, `fr`, `he`, `hi`, `hy`, `it`, `ja`, `ka`, `ko`, `pt-BR`, `th`, `zh-Hans`, `zh-Hant`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `CONTENT_DIR` | `./content` | Path to content directory |
| `THEMES_DIR` | `./themes` | Path to themes directory |
| `LOCALES_DIR` | `./locales` | Path to locales directory |
| `AUTH_SECRET` | Auto-generated | Secret for signing auth cookies. Set this in production for persistent sessions across restarts. |
| `NODE_ENV` | — | Set to `production` to cache content at startup |

## Deployment

### Docker (pre-built image)

A Docker image is published to GitHub Container Registry on every push to `main`. Pull it and bind-mount your content directory:

```bash
docker run -p 3000:3000 \
  -v /path/to/your/content:/app/content \
  -e AUTH_SECRET=your-secret-here \
  ghcr.io/<owner>/linkshare:main
```

The bind mount shadows the image's built-in `/app/content`, so the container only sees your mounted files. You can also mount custom themes or locales:

```bash
docker run -p 3000:3000 \
  -v /path/to/content:/app/content \
  -v /path/to/themes:/app/themes \
  ghcr.io/<owner>/linkshare:main
```

### Docker (build from source)

```bash
docker build -t linkshare .
docker run -p 3000:3000 \
  -v /path/to/your/content:/app/content \
  linkshare
```

### Vercel

LinkShare requires the Bun runtime on Vercel. Setup:

1. Link your project to Vercel:

   ```bash
   vc link
   ```

2. Set a random secret for signing authentication cookies. Without this, sessions are invalidated on each cold start.

   ```bash
   openssl rand -hex 32 | vc env add AUTH_SECRET production
   ```

(If the command above doesn't work for whatever reason, you can just manually add any random secret string to `AUTH_SECRET`)

3. Deploy:

   ```bash
   vc deploy
   ```

Your `content/`, `themes/`, and `locales/` directories are bundled into the deployment. Content changes require a redeploy.

### fly.io

```bash
fly launch
fly deploy
```

### Railway / Render

Connect your GitHub repo — both platforms auto-detect Bun and deploy.

### GitHub Actions

The included workflow (`.github/workflows/deploy.yml`) builds and pushes a Docker image to GitHub Container Registry on every push to `main`.

## Development

```bash
bun dev
```

In development mode, content is re-scanned on every request so you can edit `config.toml` files and see changes immediately.

## Tech Stack

- **[Bun](https://bun.sh)** — Runtime
- **[Elysia](https://elysiajs.com)** — Web framework
- **[Handlebars](https://handlebarsjs.com)** — Templating
- **[Tailwind CSS](https://tailwindcss.com)** — Styling (Play CDN)
- **[highlight.js](https://highlightjs.org)** — Code syntax highlighting
- **[Google Fonts](https://fonts.google.com)** — Typography
- **[smol-toml](https://github.com/nicolo-ribaudo/smol-toml)** — TOML parsing
