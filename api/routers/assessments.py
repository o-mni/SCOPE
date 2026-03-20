from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import models
from database import get_db

router = APIRouter()


class AssessmentCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    target: Optional[str] = ""


def serialize_assessment(a: models.Assessment) -> dict:
    finding_count = len(a.findings)
    critical_count = sum(1 for f in a.findings if f.severity == "critical")
    return {
        "id": a.id,
        "name": a.name,
        "description": a.description,
        "target": a.target,
        "status": a.status,
        "lastRun": a.last_run.isoformat() if a.last_run else None,
        "findingCount": finding_count,
        "criticalCount": critical_count,
        "createdAt": a.created_at.isoformat() if a.created_at else None,
    }


@router.get("/assessments")
def list_assessments(db: Session = Depends(get_db)):
    assessments = db.query(models.Assessment).order_by(
        models.Assessment.created_at.desc()
    ).all()
    return [serialize_assessment(a) for a in assessments]


@router.post("/assessments", status_code=201)
def create_assessment(body: AssessmentCreate, db: Session = Depends(get_db)):
    a = models.Assessment(
        name=body.name,
        description=body.description,
        target=body.target,
        status="draft",
        created_at=datetime.utcnow(),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return serialize_assessment(a)


@router.get("/assessments/{assessment_id}")
def get_assessment(assessment_id: int, db: Session = Depends(get_db)):
    a = db.query(models.Assessment).filter(models.Assessment.id == assessment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return serialize_assessment(a)


@router.delete("/assessments/{assessment_id}", status_code=204)
def delete_assessment(assessment_id: int, db: Session = Depends(get_db)):
    a = db.query(models.Assessment).filter(models.Assessment.id == assessment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    db.delete(a)
    db.commit()
    return None
