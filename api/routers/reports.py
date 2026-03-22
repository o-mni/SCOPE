from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import get_db

router = APIRouter()

REPORTS_OUT = Path(__file__).parent.parent.parent / "reports"


def serialize_report(r: models.Report) -> dict:
    return {
        "id":             r.id,
        "name":           r.name,
        "assessmentId":   r.assessment_id,
        "assessmentName": r.assessment_name,
        "format":         r.format,
        "date":           r.date.isoformat() if r.date else None,
        "size":           r.size,
        "templateId":     r.template_id,
        "reportType":     r.report_type,
        "filePath":       r.file_path,
    }


@router.get("/reports")
def list_reports(db: Session = Depends(get_db)):
    reports = db.query(models.Report).order_by(models.Report.date.desc()).all()
    return [serialize_report(r) for r in reports]


@router.delete("/reports/{report_id}", status_code=204)
def delete_report(report_id: int, db: Session = Depends(get_db)):
    r = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    if r.file_path:
        p = Path(r.file_path)
        p.unlink(missing_ok=True)
    db.delete(r)
    db.commit()
    return None


# ── Render ────────────────────────────────────────────────────────────────────

class RenderBody(BaseModel):
    assessment_id: int
    template_id: str
    report_type: str   # "report" | "strategy"


@router.post("/reports/render", status_code=201)
def render_report(body: RenderBody, db: Session = Depends(get_db)):
    if body.report_type not in ("report", "strategy"):
        raise HTTPException(status_code=400, detail="report_type must be 'report' or 'strategy'")

    assessment = db.query(models.Assessment).filter_by(id=body.assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    from templates.renderer import render_report as do_render
    try:
        out_path = do_render(assessment, body.template_id, body.report_type, db)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Render failed: {e}")

    size_bytes = out_path.stat().st_size
    size_str = f"{size_bytes / 1024:.1f} KB"

    label = "Security Assessment Report" if body.report_type == "report" else "Strategy Plan"
    report_name = f"{assessment.name} — {label}"

    r = models.Report(
        name            = report_name,
        assessment_id   = assessment.id,
        assessment_name = assessment.name,
        format          = "PDF",
        date            = datetime.utcnow(),
        size            = size_str,
        template_id     = body.template_id,
        report_type     = body.report_type,
        file_path       = str(out_path),
    )
    db.add(r)
    db.commit()
    db.refresh(r)

    # Persist selected template back to assessment
    if body.report_type == "report":
        assessment.template_id = body.template_id
    else:
        assessment.strategy_template_id = body.template_id
    db.commit()

    return serialize_report(r)


# ── Download / Open ───────────────────────────────────────────────────────────

def _get_report_file(report_id: int, db: Session) -> tuple:
    r = db.query(models.Report).filter_by(id=report_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    if not r.file_path:
        raise HTTPException(status_code=404, detail="Report file path not recorded")
    p = Path(r.file_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Report file not found on disk")
    return r, p


@router.get("/reports/{report_id}/download")
def download_report(report_id: int, db: Session = Depends(get_db)):
    r, p = _get_report_file(report_id, db)
    return FileResponse(
        path=str(p),
        media_type="application/pdf",
        filename=p.name,
        headers={"Content-Disposition": f'attachment; filename="{p.name}"'},
    )


@router.get("/reports/{report_id}/view")
def view_report(report_id: int, db: Session = Depends(get_db)):
    """Open PDF inline in browser (for the Open button)."""
    r, p = _get_report_file(report_id, db)
    return FileResponse(
        path=str(p),
        media_type="application/pdf",
        filename=p.name,
        headers={"Content-Disposition": f'inline; filename="{p.name}"'},
    )
