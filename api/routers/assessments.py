from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import json
import models
from database import get_db

router = APIRouter()


# ── Pydantic models ───────────────────────────────────────────────────────────

class AssessmentCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    target: Optional[str] = ""
    module_names: list[str] = []      # fixed at creation by wizard
    template_id: Optional[str] = None # advisory — which template was used


class ChecklistGenerateBody(BaseModel):
    playbook: str


class TaskPatch(BaseModel):
    notes: Optional[str] = None
    status: Optional[str] = None           # skipped / ready / not_planned
    manuallyValidated: Optional[bool] = None


# ── Serializers ───────────────────────────────────────────────────────────────

def serialize_assessment(a: models.Assessment) -> dict:
    finding_count  = len(a.findings)
    critical_count = sum(1 for f in a.findings if f.severity == "critical")
    return {
        "id":            a.id,
        "name":          a.name,
        "description":   a.description,
        "target":        a.target,
        "status":        a.status,
        "lastRun":       a.last_run.isoformat() if a.last_run else None,
        "findingCount":  finding_count,
        "criticalCount": critical_count,
        "createdAt":     a.created_at.isoformat() if a.created_at else None,
        "moduleNames":   json.loads(a.module_names or "[]"),
        "templateId":    a.template_id,
    }


def serialize_task(t: models.AssessmentTask) -> dict:
    return {
        "id":                 t.id,
        "moduleName":         t.module_name,
        "title":              t.title,
        "description":        t.description,
        "category":           t.category,
        "domainId":           t.domain_id,
        "priority":           t.priority,
        "automationLevel":    t.automation_level,
        "status":             t.status,
        "requiresRoot":       t.requires_root,
        "toolDependencies":   json.loads(t.tool_dependencies or "[]"),
        "moduleDependencies": json.loads(t.module_dependencies or "[]"),
        "findingCount":       t.finding_count,
        "lastRunAt":          t.last_run_at.isoformat() if t.last_run_at else None,
        "notes":              t.notes or "",
        "manuallyValidated":  t.manually_validated,
        "manuallyValidatedAt": t.manually_validated_at.isoformat() if t.manually_validated_at else None,
        "orderIndex":         t.order_index,
    }


def serialize_task_run(r: models.TaskRun) -> dict:
    return {
        "id":           r.id,
        "triggeredBy":  r.triggered_by,
        "startedAt":    r.started_at.isoformat() if r.started_at else None,
        "completedAt":  r.completed_at.isoformat() if r.completed_at else None,
        "status":       r.status,
        "findingCount": r.finding_count,
        "durationMs":   r.duration_ms,
    }


# ── Assessment CRUD ───────────────────────────────────────────────────────────

@router.get("/assessments")
def list_assessments(db: Session = Depends(get_db)):
    assessments = db.query(models.Assessment).order_by(
        models.Assessment.created_at.desc()
    ).all()
    return [serialize_assessment(a) for a in assessments]


@router.post("/assessments", status_code=201)
def create_assessment(body: AssessmentCreate, db: Session = Depends(get_db)):
    a = models.Assessment(
        name         = body.name,
        description  = body.description,
        target       = body.target,
        status       = "draft",
        created_at   = datetime.utcnow(),
        module_names = json.dumps(body.module_names),
        template_id  = body.template_id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)

    # Generate checklist atomically at creation time if modules are specified
    if body.module_names:
        from engine.checklist import generate_checklist
        generate_checklist(a.id, body.module_names, db)

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


# ── Runs ──────────────────────────────────────────────────────────────────────

@router.get("/assessments/{assessment_id}/runs")
def list_runs(assessment_id: int, db: Session = Depends(get_db)):
    a = db.query(models.Assessment).filter(models.Assessment.id == assessment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    runs = (
        db.query(models.Run)
        .filter(models.Run.assessment_id == assessment_id)
        .order_by(models.Run.date.desc())
        .all()
    )
    return [
        {
            "id":           r.id,
            "date":         r.date.isoformat() if r.date else None,
            "status":       r.status,
            "duration":     r.duration or "—",
            "findingCount": r.finding_count,
        }
        for r in runs
    ]


# ── Checklist (legacy — kept for existing assessments) ────────────────────────

@router.post("/assessments/{assessment_id}/checklist", status_code=201)
def generate_checklist_endpoint(
    assessment_id: int,
    body: ChecklistGenerateBody,
    db: Session = Depends(get_db),
):
    a = db.query(models.Assessment).filter(models.Assessment.id == assessment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")

    from routers.tasks import PLAYBOOK_MODULES
    module_names = PLAYBOOK_MODULES.get(body.playbook)
    if not module_names:
        raise HTTPException(status_code=400, detail=f"Unknown playbook: {body.playbook}")

    from engine.checklist import generate_checklist
    new_tasks = generate_checklist(assessment_id, module_names, db)
    return {"created": len(new_tasks), "tasks": [serialize_task(t) for t in new_tasks]}


@router.get("/assessments/{assessment_id}/tasks")
def list_tasks(assessment_id: int, db: Session = Depends(get_db)):
    a = db.query(models.Assessment).filter(models.Assessment.id == assessment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    tasks = (
        db.query(models.AssessmentTask)
          .filter_by(assessment_id=assessment_id)
          .order_by(models.AssessmentTask.order_index)
          .all()
    )
    return [serialize_task(t) for t in tasks]


@router.get("/assessments/{assessment_id}/coverage")
def get_coverage(assessment_id: int, db: Session = Depends(get_db)):
    a = db.query(models.Assessment).filter(models.Assessment.id == assessment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")
    from engine.checklist import calculate_coverage
    return calculate_coverage(assessment_id, db)


@router.patch("/assessments/{assessment_id}/tasks/{task_id}")
def update_task(
    assessment_id: int,
    task_id: int,
    body: TaskPatch,
    db: Session = Depends(get_db),
):
    task = (
        db.query(models.AssessmentTask)
          .filter_by(id=task_id, assessment_id=assessment_id)
          .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if body.notes is not None:
        task.notes = body.notes

    if body.status is not None and body.status in ("skipped", "ready", "not_planned"):
        task.status = body.status

    if body.manuallyValidated:
        task.manually_validated    = True
        task.manually_validated_at = datetime.utcnow()
        if task.status in ("needs_manual_validation", "completed", "running"):
            task.status = "completed"

    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return serialize_task(task)


@router.get("/assessments/{assessment_id}/tasks/{task_id}/runs")
def list_task_runs(assessment_id: int, task_id: int, db: Session = Depends(get_db)):
    task = (
        db.query(models.AssessmentTask)
          .filter_by(id=task_id, assessment_id=assessment_id)
          .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    runs = (
        db.query(models.TaskRun)
          .filter_by(task_id=task_id)
          .order_by(models.TaskRun.started_at.desc())
          .all()
    )
    return [serialize_task_run(r) for r in runs]
