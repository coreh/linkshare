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
# background = "background.jpg"    # Local file or URL
# background_color = "#0f172a"     # CSS color
# logo = "logo.png"                # Local file or URL
# font = "Inter"                   # Any Google Font
# accent_color = "#6366f1"         # Accent color
# theme = "dark"                   # "dark" or "light"
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

## Style Inheritance

By default, child sections inherit their parent's styling (font, theme, colors, logo, background). Override any property in the child's `config.toml`, or set `inherit = false` to start fresh.

## Password Protection

Add `password = "your-password"` to any section's `config.toml`. The password check is **server-side** — protected content is never sent to the browser until authenticated. Auth tokens are stored in signed cookies (24h expiry).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `CONTENT_DIR` | `./content` | Path to content directory |
| `AUTH_SECRET` | Auto-generated | Secret for signing auth cookies. Set this in production for persistent sessions across restarts. |
| `NODE_ENV` | — | Set to `production` to cache content at startup |

## Deployment

### Docker

```bash
docker build -t linkshare .
docker run -p 3000:3000 linkshare
```

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
- **[Tailwind CSS](https://tailwindcss.com)** — Styling (Play CDN)
- **[Google Fonts](https://fonts.google.com)** — Typography
- **[smol-toml](https://github.com/nicolo-ribaudo/smol-toml)** — TOML parsing
