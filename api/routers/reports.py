from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import models
from database import get_db

router = APIRouter()


def serialize_report(r: models.Report) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "assessmentId": r.assessment_id,
        "assessmentName": r.assessment_name,
        "format": r.format,
        "date": r.date.isoformat() if r.date else None,
        "size": r.size,
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
    db.delete(r)
    db.commit()
    return None
