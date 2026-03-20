from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
import models
from database import get_db

router = APIRouter()


def serialize_finding(f: models.Finding) -> dict:
    return {
        "id": f.id,
        "assessmentId": f.assessment_id,
        "assessmentName": f.assessment.name if f.assessment else "",
        "severity": f.severity,
        "title": f.title,
        "category": f.category,
        "status": f.status,
        "description": f.description,
        "evidence": f.evidence,
        "remediationSimple": f.remediation_simple,
        "remediationTechnical": f.remediation_technical,
        "dateFound": f.date_found.isoformat() if f.date_found else None,
    }


@router.get("/findings")
def list_findings(
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    assessment_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(models.Finding)
    if severity:
        query = query.filter(models.Finding.severity == severity)
    if status:
        query = query.filter(models.Finding.status == status)
    if assessment_id:
        query = query.filter(models.Finding.assessment_id == assessment_id)
    findings = query.order_by(models.Finding.date_found.desc()).all()
    return [serialize_finding(f) for f in findings]
