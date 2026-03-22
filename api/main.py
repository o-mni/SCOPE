import asyncio

from fastapi import FastAPI
import migrate
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base, get_db
from sqlalchemy.orm import Session
from fastapi import Depends
import models

# Create new tables (idempotent)
Base.metadata.create_all(bind=engine)

# Add columns to existing tables that predate this schema version
migrate.run_migrations()

app = FastAPI(title="SCOPE API", version="1.0.0")

# CORS — localhost only (terminal WebSocket connections included)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers
from routers import assessments, findings, reports, tasks, domains
from routers import terminal
from routers import templates as templates_router

app.include_router(assessments.router, prefix="/api")
app.include_router(findings.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(domains.router, prefix="/api")
app.include_router(terminal.router, prefix="/api")
app.include_router(templates_router.router, prefix="/api")


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
def startup_templates():
    """Load and validate all templates at startup."""
    from templates.loader import load_all
    load_all()


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


@app.on_event("startup")
async def start_terminal_reaper():
    """Background task: reap idle or dead terminal sessions every 60 seconds."""
    async def _reap_loop():
        while True:
            await asyncio.sleep(60)
            try:
                from terminal.manager import session_manager
                session_manager.reap_idle()
            except Exception:
                pass

    asyncio.create_task(_reap_loop())
