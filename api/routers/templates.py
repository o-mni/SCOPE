"""
SCOPE — Templates API router.

GET  /api/templates                  → list all valid templates
GET  /api/templates/{id}             → single template metadata
POST /api/templates/reload           → rescan disk, refresh cache
POST /api/templates/{id}/duplicate   → copy to new custom template
DELETE /api/templates/{id}           → delete custom template (403 for built-ins)
GET  /api/templates/{id}/preview     → render with fixture data → HTML
"""
import subprocess
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

import templates.loader as loader
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
        subprocess.Popen(["xdg-open", str(folder)])   # non-blocking, fire-and-forget
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="xdg-open not found on this system")
    return {"opened": str(folder)}
