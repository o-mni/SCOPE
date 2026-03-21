from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    target = Column(String, default="")
    status = Column(String, default="draft")  # active, complete, draft, failed
    last_run = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    module_names = Column(String, default="[]")   # JSON array — fixed at creation
    template_id = Column(String, nullable=True)   # advisory: which template was used

    findings = relationship("Finding", back_populates="assessment", cascade="all, delete-orphan")
    runs = relationship("Run", back_populates="assessment", cascade="all, delete-orphan")
    tasks = relationship(
        "AssessmentTask", back_populates="assessment",
        cascade="all, delete-orphan",
        order_by="AssessmentTask.order_index",
    )


class Finding(Base):
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id"), nullable=False)
    task_id = Column(Integer, ForeignKey("assessment_tasks.id", ondelete="SET NULL"), nullable=True)
    severity = Column(String, nullable=False)  # critical, high, medium, low, info
    title = Column(String, nullable=False)
    category = Column(String, default="")
    status = Column(String, default="open")  # open, remediated, accepted
    description = Column(Text, default="")
    evidence = Column(Text, default="")
    remediation_simple = Column(Text, default="")
    remediation_technical = Column(Text, default="")
    date_found = Column(DateTime, default=datetime.utcnow)

    assessment = relationship("Assessment", back_populates="findings")
    task = relationship("AssessmentTask", back_populates="findings")


class Run(Base):
    __tablename__ = "runs"

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id"), nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="complete")  # complete, failed, running
    duration = Column(String, default="")
    finding_count = Column(Integer, default=0)

    assessment = relationship("Assessment", back_populates="runs")


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    assessment_id = Column(Integer, ForeignKey("assessments.id"), nullable=True)
    assessment_name = Column(String, default="")
    format = Column(String, default="PDF")  # PDF, HTML, JSON, Markdown
    date = Column(DateTime, default=datetime.utcnow)
    size = Column(String, default="")


class ActivityEvent(Base):
    __tablename__ = "activity"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)
    message = Column(String, nullable=False)
    detail = Column(String, default="")
    timestamp = Column(DateTime, default=datetime.utcnow)
    icon = Column(String, default="check")
    color = Column(String, default="primary")


class AssessmentTask(Base):
    __tablename__ = "assessment_tasks"

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False)
    module_name = Column(String, nullable=False)
    title = Column(String, nullable=False)
    description = Column(String)
    category = Column(String)
    priority = Column(String, default="medium")       # critical/high/medium/low/info
    automation_level = Column(String, default="auto") # auto/semi_auto/manual
    status = Column(String, default="not_planned")    # see lifecycle in checklist.py
    requires_root = Column(Boolean, default=False)
    domain_id = Column(String)                        # from domains.py MODULE_TO_DOMAIN
    tool_dependencies = Column(String)                # JSON array of tool names
    module_dependencies = Column(String)              # JSON array of module dotted names
    finding_count = Column(Integer, default=0)
    last_run_at = Column(DateTime)
    notes = Column(String)
    manually_validated = Column(Boolean, default=False)
    manually_validated_at = Column(DateTime)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)

    assessment = relationship("Assessment", back_populates="tasks")
    findings = relationship("Finding", back_populates="task")
    task_runs = relationship("TaskRun", back_populates="task", cascade="all, delete-orphan")


class TaskRun(Base):
    __tablename__ = "task_runs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("assessment_tasks.id", ondelete="CASCADE"), nullable=False)
    assessment_id = Column(Integer, nullable=False)
    run_id = Column(Integer, ForeignKey("runs.id", ondelete="SET NULL"), nullable=True)
    triggered_by = Column(String, default="auto")   # auto / manual
    started_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime)
    status = Column(String, nullable=False)          # running/completed/failed
    finding_count = Column(Integer, default=0)
    error_message = Column(String)
    duration_ms = Column(Integer)

    task = relationship("AssessmentTask", back_populates="task_runs")
