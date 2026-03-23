# Argus Spatial Intelligence — Zerve `main.py`

Use this as the full FastAPI deployment file for the Zerve custom deployment.

## Zerve runtime setup

- **Deployment type:** Custom
- **Executor image:** FastAPI
- **Run command:**

```bash
uvicorn main:app --host 0.0.0.0 --port 8080
```

## Artifact layout

Place the generated spatial artifacts in a folder named `spatial/` next to `main.py`:

- `spatial/spatial_dashboard.html`
- `spatial/spatial_quality_scorecard.json`
- `spatial/postgis_extension_report.md`
- `spatial/spatial_index_audit.md`

## `main.py`

```python
from __future__ import annotations

import os
import html
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse

try:
    import markdown as md_lib
except Exception:
    md_lib = None

app = FastAPI(title="Argus Spatial Intelligence", version="1.0.0")


# -----------------------------------------------------------------------------
# Artifact location
# -----------------------------------------------------------------------------
def detect_spatial_dir() -> Path:
    """
    Look for the generated spatial artifacts in a few common locations.
    Override with SPATIAL_DIR if needed.
    """
    env_dir = os.environ.get("SPATIAL_DIR")
    candidates = []

    if env_dir:
        candidates.append(Path(env_dir))

    candidates.extend([
        Path("./spatial"),
        Path("."),
        Path("/app/spatial"),
        Path("/workspace/spatial"),
    ])

    required = [
        "spatial_dashboard.html",
        "spatial_quality_scorecard.json",
        "postgis_extension_report.md",
        "spatial_index_audit.md",
    ]

    for base in candidates:
        if all((base / name).exists() for name in required):
            return base

    # Fall back to ./spatial if nothing is found
    return Path("./spatial")


SPATIAL_DIR = detect_spatial_dir()


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def file_exists(name: str) -> bool:
    return (SPATIAL_DIR / name).exists()


def read_text(path: Path) -> str:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Missing file: {path.name}")
    return path.read_text(encoding="utf-8")


def render_markdown_text(markdown_text: str) -> str:
    """
    Render markdown to HTML. If the markdown package is unavailable,
    fall back to escaped plaintext in <pre>.
    """
    if md_lib is not None:
        try:
            return md_lib.markdown(
                markdown_text,
                extensions=["extra", "tables", "fenced_code", "sane_lists"],
            )
        except Exception:
            pass

    return f"<pre>{html.escape(markdown_text)}</pre>"


def page_shell(title: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(title)}</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #0f1115;
      --panel: #171a21;
      --panel-2: #1f2430;
      --text: #e6e6e6;
      --muted: #9aa4b2;
      --accent: #7aa2f7;
      --accent-2: #9ece6a;
      --border: #2a2f3a;
      --danger: #f7768e;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    a {{ color: var(--accent); text-decoration: none; }}
    .wrap {{
      max-width: 1200px;
      margin: 0 auto;
      padding: 28px 20px 48px;
    }}
    .nav {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }}
    .brand {{
      font-size: 1.05rem;
      font-weight: 800;
      letter-spacing: 0.02em;
    }}
    .links {{
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
    }}
    .links a {{
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: rgba(255,255,255,0.02);
    }}
    .hero, .card {{
      background: linear-gradient(180deg, var(--panel), var(--panel-2));
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.25);
    }}
    .hero {{
      padding: 28px;
      margin-bottom: 18px;
    }}
    .title {{
      margin: 0 0 8px;
      font-size: 2rem;
      font-weight: 850;
    }}
    .subtitle {{
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
      max-width: 70ch;
    }}
    .btns {{
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 20px;
    }}
    .btn {{
      display: inline-block;
      padding: 10px 14px;
      border-radius: 10px;
      font-weight: 700;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
      color: var(--text);
    }}
    .btn.primary {{
      background: var(--accent);
      color: #08101f;
      border-color: transparent;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-top: 18px;
    }}
    .card {{
      padding: 16px;
    }}
    .card h3 {{
      margin: 0 0 8px;
      font-size: 1rem;
    }}
    .card p {{
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }}
    .status {{
      margin-top: 18px;
      color: var(--muted);
    }}
    .ok {{ color: var(--accent-2); font-weight: 700; }}
    .bad {{ color: var(--danger); font-weight: 700; }}
    .content {{
      padding: 24px;
      line-height: 1.65;
    }}
    .content table {{
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
      overflow: hidden;
      border-radius: 10px;
    }}
    .content th, .content td {{
      border: 1px solid var(--border);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }}
    .content th {{
      background: rgba(255,255,255,0.03);
    }}
    .content pre {{
      overflow-x: auto;
      padding: 14px;
      background: #0b0d12;
      border-radius: 10px;
      border: 1px solid var(--border);
    }}
    .content code {{
      background: #0b0d12;
      padding: 2px 5px;
      border-radius: 6px;
    }}
    iframe.dashboard {{
      width: 100%;
      height: 82vh;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: #111;
    }}
    .muted {{ color: var(--muted); }}
    .footer {{
      margin-top: 16px;
      color: var(--muted);
      font-size: 0.92rem;
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <div class="brand">Argus Spatial Intelligence</div>
      <div class="links">
        <a href="/">Home</a>
        <a href="/dashboard">Dashboard</a>
        <a href="/scorecard">Scorecard</a>
        <a href="/report/postgis">PostGIS</a>
        <a href="/report/indexes">Indexes</a>
      </div>
    </div>
    {body}
  </div>
</body>
</html>"""


def artifact_summary_cards() -> str:
    items = [
        ("Dashboard", "spatial_dashboard.html"),
        ("Scorecard", "spatial_quality_scorecard.json"),
        ("PostGIS Report", "postgis_extension_report.md"),
        ("Index Audit", "spatial_index_audit.md"),
    ]

    cards = []
    for label, filename in items:
        ok = file_exists(filename)
        cards.append(f"""
        <div class="card">
          <h3>{label}</h3>
          <p>{'Available' if ok else 'Missing'}</p>
        </div>
        """)
    return "\n".join(cards)


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def home():
    body = f"""
    <div class="hero">
      <h1 class="title">Argus Spatial Intelligence</h1>
      <p class="subtitle">
        Explore PostGIS audits, spatial quality reports, and the interactive spatial dashboard
        generated by Zerve. This service is designed to be proxied later into <code>argusweb.bond</code>.
      </p>

      <div class="btns">
        <a class="btn primary" href="/dashboard">Open Dashboard</a>
        <a class="btn" href="/scorecard">View Scorecard</a>
        <a class="btn" href="/report/postgis">PostGIS Report</a>
        <a class="btn" href="/report/indexes">Index Audit</a>
      </div>

      <div class="grid">
        {artifact_summary_cards()}
      </div>

      <p class="status">
        Service status: <span class="ok">ready</span> on port 8080
      </p>
      <p class="footer">
        Spatial dir: <code>{html.escape(str(SPATIAL_DIR))}</code>
      </p>
    </div>
    """
    return HTMLResponse(page_shell("Argus Spatial Intelligence", body))


@app.get("/dashboard")
def dashboard():
    path = SPATIAL_DIR / "spatial_dashboard.html"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Missing file: {path.name}")
    return FileResponse(path, media_type="text/html")


@app.get("/scorecard")
def scorecard():
    path = SPATIAL_DIR / "spatial_quality_scorecard.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Missing file: {path.name}")
    return FileResponse(path, media_type="application/json")


@app.get("/report/postgis", response_class=HTMLResponse)
def postgis_report():
    path = SPATIAL_DIR / "postgis_extension_report.md"
    md = read_text(path)
    body = render_markdown_text(md)
    return HTMLResponse(page_shell("PostGIS Extension Report", f'<div class="card content">{body}</div>'))


@app.get("/report/indexes", response_class=HTMLResponse)
def index_report():
    path = SPATIAL_DIR / "spatial_index_audit.md"
    md = read_text(path)
    body = render_markdown_text(md)
    return HTMLResponse(page_shell("Spatial Index Audit", f'<div class="card content">{body}</div>'))


@app.get("/embed", response_class=HTMLResponse)
def embed_dashboard():
    """
    A simple embedded view that nests the dashboard HTML.
    Useful if you want a single page with the dashboard inline.
    """
    dash_path = SPATIAL_DIR / "spatial_dashboard.html"
    if not dash_path.exists():
        raise HTTPException(status_code=404, detail="Missing spatial_dashboard.html")

    body = f"""
    <div class="hero">
      <h1 class="title">Spatial Dashboard</h1>
      <p class="subtitle">Embedded view of the generated dashboard artifact.</p>
    </div>
    <iframe class="dashboard" src="/dashboard" title="Argus Spatial Dashboard"></iframe>
    """
    return HTMLResponse(page_shell("Argus Spatial Dashboard", body))


@app.get("/api/status")
def api_status():
    return JSONResponse(
        {
            "service": "argus-spatial-intelligence",
            "spatial_dir": str(SPATIAL_DIR),
            "dashboard": file_exists("spatial_dashboard.html"),
            "scorecard": file_exists("spatial_quality_scorecard.json"),
            "postgis_report": file_exists("postgis_extension_report.md"),
            "index_report": file_exists("spatial_index_audit.md"),
        }
    )
```

## Notes

- Put the generated files in `spatial/` next to `main.py`.
- If your files live elsewhere, change:

```python
SPATIAL_DIR = BASE_DIR / "spatial"
```

- This app is designed to be proxied later into `argusweb.bond`.
- It keeps the UI dark, minimal, and Argus-friendly.
