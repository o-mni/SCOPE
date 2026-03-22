"""
SCOPE — Templates API router.

GET    /api/templates                        → list all valid templates
GET    /api/templates/{id}                   → single template metadata
POST   /api/templates/reload                 → rescan disk, refresh cache
POST   /api/templates/upload                 → upload a ZIP template package
POST   /api/templates/{id}/duplicate        → copy to new custom template
DELETE /api/templates/{id}                   → delete custom template (403 for built-ins)
GET    /api/templates/{id}/preview/{type}   → render with fixture data → HTML
POST   /api/templates/{id}/open-folder      → xdg-open template directory
"""
import io
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

import templates.loader as loader
from templates.loader import TEMPLATES_DIR
from templates.renderer import render_preview

router = APIRouter()


def _serialize(meta) -> dict:
    from templates.loader import get_folder
    folder = get_folder(meta.id)
    files = [f.name for f in folder.iterdir() if f.is_file()]
    asset_files = [f.name for f in (folder / "assets").iterdir()] if (folder / "assets").is_dir() else []
    return {
        "id":           meta.id,
        "name":         meta.name,
        "version":      meta.version,
        "description":  meta.description,
        "templateType": meta.template_type,
        "builtin":      meta.builtin,
        "branding":     meta.branding.model_dump(),
        "render":       meta.render.model_dump(),
        "sections":     [s.model_dump() for s in meta.sections],
        "files":        files,
        "assetFiles":   asset_files,
    }


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/templates")
def list_templates():
    templates = loader.get_all()
    errors = loader.get_errors()
    return {
        "templates": [_serialize(m) for m in templates.values()],
        "errors":    errors,
    }


# ── Single ────────────────────────────────────────────────────────────────────

@router.get("/templates/{template_id}")
def get_template(template_id: str):
    try:
        meta = loader.get(template_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    return _serialize(meta)


# ── Reload ────────────────────────────────────────────────────────────────────

@router.post("/templates/reload")
def reload_templates():
    loaded = loader.load_all()
    errors = loader.get_errors()
    return {
        "loaded": len(loaded),
        "errors": errors,
    }


# ── Preview ───────────────────────────────────────────────────────────────────

@router.get("/templates/{template_id}/preview/{report_type}", response_class=HTMLResponse)
def preview_template(template_id: str, report_type: str):
    if report_type not in ("report", "strategy"):
        raise HTTPException(status_code=400, detail="report_type must be 'report' or 'strategy'")
    try:
        html = render_preview(template_id, report_type)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    except FileNotFoundError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return HTMLResponse(content=html)


# ── Duplicate ─────────────────────────────────────────────────────────────────

class DuplicateBody(BaseModel):
    new_id: str
    new_name: str


@router.post("/templates/{template_id}/duplicate", status_code=201)
def duplicate_template(template_id: str, body: DuplicateBody):
    try:
        meta = loader.duplicate(template_id, body.new_id, body.new_name)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _serialize(meta)


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/templates/{template_id}", status_code=204)
def delete_template(template_id: str):
    try:
        loader.delete(template_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return None


# ── Open folder (xdg-open) ────────────────────────────────────────────────────

@router.post("/templates/{template_id}/open-folder")
def open_template_folder(template_id: str):
    try:
        folder = loader.get_folder(template_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")
    try:
        subprocess.Popen(["xdg-open", str(folder)])
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="xdg-open not found on this system")
    return {"opened": str(folder)}


# ── Upload ZIP ────────────────────────────────────────────────────────────────

@router.post("/templates/upload", status_code=201)
async def upload_template(file: UploadFile = File(...)):
    """
    Accept a ZIP file containing a complete template folder.
    ZIP must contain exactly one root folder with template.yml and at least
    one .html.j2 file. The folder name becomes the template ID.

    ZIP structure:
        my-template/
            template.yml
            report.html.j2      (or strategy.html.j2)
            assets/
                styles.css
    """
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip archive")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:   # 10 MB cap
        raise HTTPException(status_code=413, detail="ZIP file must be under 10 MB")

    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="File is not a valid ZIP archive")

    # Security: reject any path traversal entries
    for name in zf.namelist():
        if ".." in name or name.startswith("/") or name.startswith("\\"):
            raise HTTPException(status_code=400, detail=f"Unsafe path in ZIP: {name}")

    # Determine root folder name (template ID)
    entries = [n for n in zf.namelist() if n.strip("/")]
    if not entries:
        raise HTTPException(status_code=400, detail="ZIP is empty")

    # Find the common root directory
    roots = {e.split("/")[0] for e in entries if "/" in e or not e.endswith("/")}
    top_dirs = {e.split("/")[0] for e in entries}
    if len(top_dirs) != 1:
        raise HTTPException(
            status_code=400,
            detail="ZIP must contain exactly one root folder (the template ID folder)"
        )
    template_id = top_dirs.pop()

    # Validate slug
    import re
    if not re.match(r"^[a-z0-9][a-z0-9\-]*$", template_id):
        raise HTTPException(
            status_code=400,
            detail=f"Template folder name '{template_id}' must be lowercase letters, digits, and hyphens"
        )

    dest = TEMPLATES_DIR / template_id
    if dest.exists():
        raise HTTPException(
            status_code=409,
            detail=f"Template '{template_id}' already exists. Delete it first or use a different folder name."
        )

    # Extract to a temp directory, validate, then move
    with tempfile.TemporaryDirectory() as tmp:
        zf.extractall(tmp)
        extracted = Path(tmp) / template_id

        if not extracted.is_dir():
            raise HTTPException(status_code=400, detail=f"Expected folder '{template_id}' inside ZIP root")

        yml_path = extracted / "template.yml"
        if not yml_path.exists():
            raise HTTPException(status_code=400, detail="template.yml not found inside the template folder")

        j2_files = list(extracted.glob("*.html.j2"))
        if not j2_files:
            raise HTTPException(status_code=400, detail="No .html.j2 template file found inside the template folder")

        # Validate the YAML with Pydantic before moving anything
        from templates.loader import _load_one
        meta, err = _load_one(extracted)
        if err:
            raise HTTPException(status_code=422, detail=f"Template validation failed: {err}")

        # Move to report_templates/
        shutil.move(str(extracted), str(dest))

    # Reload cache and return metadata
    loader.load_all()
    try:
        meta = loader.get(template_id)
    except KeyError:
        raise HTTPException(status_code=500, detail="Template moved but failed to load after install")

    return _serialize(meta)
