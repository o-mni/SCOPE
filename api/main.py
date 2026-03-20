from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base, get_db
from sqlalchemy.orm import Session
from fastapi import Depends
import models

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SCOPE API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers
from routers import assessments, findings, reports, tasks

app.include_router(assessments.router, prefix="/api")
app.include_router(findings.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")


@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    from sqlalchemy import func

    total_assessments = db.query(models.Assessment).count()
    open_findings = db.query(models.Finding).filter(models.Finding.status == "open").count()
    critical_findings = db.query(models.Finding).filter(
        models.Finding.status == "open",
        models.Finding.severity == "critical"
    ).count()

    from datetime import datetime, timedelta
    week_ago = datetime.utcnow() - timedelta(days=7)
    runs_this_week = db.query(models.Run).filter(models.Run.date >= week_ago).count()

    return {
        "totalAssessments": total_assessments,
        "openFindings": open_findings,
        "criticalFindings": critical_findings,
        "runsThisWeek": runs_this_week,
        "riskScore": 6.4,
        "riskTrend": "down",
    }


@app.get("/api/activity")
def get_activity(db: Session = Depends(get_db)):
    events = db.query(models.ActivityEvent).order_by(
        models.ActivityEvent.timestamp.desc()
    ).limit(10).all()

    return [
        {
            "id": e.id,
            "type": e.type,
            "message": e.message,
            "detail": e.detail,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            "icon": e.icon,
            "color": e.color,
        }
        for e in events
    ]


@app.get("/")
def root():
    return {"status": "ok", "service": "SCOPE API", "version": "1.0.0"}


@app.on_event("startup")
def startup_event():
    """Seed database if empty."""
    db = next(get_db())
    try:
        count = db.query(models.Assessment).count()
        if count == 0:
            import seed
            seed.seed_database(db)
    finally:
        db.close()
