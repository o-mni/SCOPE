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

    findings = relationship("Finding", back_populates="assessment", cascade="all, delete-orphan")
    runs = relationship("Run", back_populates="assessment", cascade="all, delete-orphan")


class Finding(Base):
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey("assessments.id"), nullable=False)
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
