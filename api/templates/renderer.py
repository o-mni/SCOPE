"""
SCOPE — Jinja2 report renderer.

render_report() is a pure function: same inputs → same output.
It never raises on missing template variables (uses Undefined, not StrictUndefined).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

import jinja2
from sqlalchemy.orm import Session

import models
from .loader import get, get_folder

log = logging.getLogger(__name__)

REPORTS_OUT = Path(__file__).parent.parent.parent / "reports"


# ── Context builder ───────────────────────────────────────────────────────────

def _build_context(assessment: models.Assessment, db: Session, meta) -> dict:
    findings_raw = (
        db.query(models.Finding)
        .filter_by(assessment_id=assessment.id)
        .order_by(models.Finding.severity, models.Finding.date_found)
        .all()
    )

    SEV_ORDER = ["critical", "high", "medium", "low", "informational", "info"]

    def _f(f: models.Finding) -> dict:
        return {
            "id":           f"F-{f.id:04d}",
            "title":        f.title,
            "severity":     f.severity,
            "category":     f.category or "—",
            "description":  f.description or "",
            "evidence":     f.evidence or "",
            "remediation":  f.remediation_simple or "",
            "affected_item": None,
            "references":   [],
            "status":       f.status,
        }

    findings = [_f(f) for f in findings_raw]

    by_sev: dict[str, list] = {}
    for f in findings:
        key = f["severity"].lower()
        by_sev.setdefault(key, []).append(f)

    tasks = (
        db.query(models.AssessmentTask)
        .filter_by(assessment_id=assessment.id)
        .order_by(models.AssessmentTask.order_index)
        .all()
    )

    STATUS_MAP = {
        "completed":              "passed",
        "needs_manual_validation": "passed",
        "failed":                 "failed",
        "skipped":                "skipped",
        "running":                "skipped",
        "not_planned":            "skipped",
        "ready":                  "skipped",
    }

    coverage = [
        {"name": t.title, "status": STATUS_MAP.get(t.status, "skipped")}
        for t in tasks
    ]

    render_cfg = meta.render.model_dump()
    ts = datetime.now(timezone.utc).strftime(meta.render.date_format)

    return {
        "assessment": {
            "id":             assessment.id,
            "title":          assessment.name,
            "target":         assessment.target or "—",
            "date":           assessment.last_run.strftime("%Y-%m-%d") if assessment.last_run else "—",
            "summary":        assessment.description or "",
            "assessor":       "SCOPE Automated Engine",
            "classification": "Internal Use Only",
        },
        "plan": {
            "id":      assessment.id,
            "title":   assessment.name,
            "target":  assessment.target or "—",
            "author":  "SCOPE Platform",
            "version": "1.0",
            "status":  assessment.status.capitalize(),
            "created_at": assessment.created_at.strftime("%Y-%m-%d") if assessment.created_at else "—",
        },
        "findings":             findings,
        "findings_by_severity": by_sev,
        "coverage":             coverage,
        "recommendations":      [],
        "notes":                None,
        "system":               None,
        "risk_thresholds":      None,
        "disclaimer":           meta.disclaimer,
        "render":               render_cfg,
        "generated_at":         ts,
    }


# ── Jinja2 environment factory ────────────────────────────────────────────────

def _make_env(template_dir: Path) -> jinja2.Environment:
    return jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(template_dir)),
        autoescape=jinja2.select_autoescape(["html"]),
        # Undefined (not StrictUndefined) — missing vars render as empty string
        undefined=jinja2.Undefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )


# ── Public entry point ────────────────────────────────────────────────────────

def render_report(
    assessment: models.Assessment,
    template_id: str,
    report_type: str,   # "report" | "strategy"
    db: Session,
) -> Path:
    """
    Render a Jinja2 template for the given assessment.
    Returns the absolute path to the generated HTML file.
    """
    meta = get(template_id)
    template_dir = get_folder(template_id)

    j2_file = "report.html.j2" if report_type == "report" else "strategy.html.j2"
    j2_path = template_dir / j2_file
    if not j2_path.exists():
        raise FileNotFoundError(
            f"Template '{template_id}' does not have {j2_file}"
        )

    env = _make_env(template_dir)
    tmpl = env.get_template(j2_file)
    context = _build_context(assessment, db, meta)

    html = tmpl.render(**context)

    REPORTS_OUT.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    slug = f"{assessment.id}-{ts}-{template_id}-{report_type}"
    out_path = REPORTS_OUT / f"{slug}.html"
    out_path.write_text(html, encoding="utf-8")

    log.info("[renderer] Wrote %s (%d bytes)", out_path.name, len(html))
    return out_path


# ── Fixture preview renderer ──────────────────────────────────────────────────

def render_preview(template_id: str, report_type: str) -> str:
    """Render a template with synthetic fixture data. Returns HTML string."""
    meta = get(template_id)
    template_dir = get_folder(template_id)

    j2_file = "report.html.j2" if report_type == "report" else "strategy.html.j2"
    if not (template_dir / j2_file).exists():
        raise FileNotFoundError(f"Template '{template_id}' does not have {j2_file}")

    fixture_findings = [
        {"id": "F-0001", "title": "Root login enabled via SSH", "severity": "critical",
         "category": "Auth", "description": "PermitRootLogin is set to yes in sshd_config.",
         "evidence": "PermitRootLogin yes", "remediation": "Set PermitRootLogin to no.",
         "affected_item": "/etc/ssh/sshd_config", "references": [], "status": "open"},
        {"id": "F-0002", "title": "Firewall inactive", "severity": "high",
         "category": "Network", "description": "ufw is installed but not enabled.",
         "evidence": "Status: inactive", "remediation": "Run: ufw enable",
         "affected_item": None, "references": [], "status": "open"},
        {"id": "F-0003", "title": "World-writable /tmp files found", "severity": "medium",
         "category": "File System", "description": "17 world-writable files found under /tmp.",
         "evidence": "-rwxrwxrwx 1 root root /tmp/installer.sh",
         "remediation": "Review and restrict permissions with chmod.",
         "affected_item": "/tmp", "references": [], "status": "open"},
        {"id": "F-0004", "title": "Password aging not configured", "severity": "low",
         "category": "Auth", "description": "PASS_MAX_DAYS is set to 99999 in /etc/login.defs.",
         "evidence": "PASS_MAX_DAYS   99999",
         "remediation": "Set PASS_MAX_DAYS to 90.", "affected_item": None,
         "references": [], "status": "open"},
        {"id": "F-0005", "title": "SSH banner not configured", "severity": "informational",
         "category": "Auth", "description": "No login banner is displayed before authentication.",
         "evidence": "Banner none", "remediation": "Set Banner /etc/issue.net in sshd_config.",
         "affected_item": None, "references": [], "status": "open"},
    ]
    by_sev = {}
    for f in fixture_findings:
        by_sev.setdefault(f["severity"], []).append(f)

    ts = datetime.now(timezone.utc).strftime(meta.render.date_format)

    context = {
        "assessment": {
            "id": 1, "title": "Preview Assessment — Acme Corp",
            "target": "acme-prod-01.local",
            "date": "2026-03-22", "summary": "Automated preliminary security assessment.",
            "assessor": "SCOPE Engine", "classification": "Internal Use Only",
        },
        "plan": {
            "id": 1, "title": "Preview Strategy — Acme Corp",
            "target": "acme-prod-01.local", "author": "SCOPE Platform",
            "version": "1.0", "status": "Draft", "created_at": "2026-03-22",
        },
        "findings": fixture_findings,
        "findings_by_severity": by_sev,
        "coverage": [
            {"name": "SSH Configuration", "status": "passed"},
            {"name": "Firewall State",    "status": "failed"},
            {"name": "User Accounts",     "status": "passed"},
            {"name": "Kernel Parameters", "status": "passed"},
            {"name": "File Permissions",  "status": "skipped"},
        ],
        "recommendations": [
            {"title": "Disable SSH root login",    "priority": "critical", "detail": None},
            {"title": "Enable and configure ufw",  "priority": "high",     "detail": None},
            {"title": "Enforce password ageing",   "priority": "low",      "detail": None},
        ],
        "notes": None,
        "system": {
            "hostname": "acme-prod-01", "os": "Ubuntu 24.04 LTS",
            "kernel": "6.8.0-52-generic", "arch": "x86_64",
            "uptime": "14 days, 3:21", "users": "3 active",
            "ip_addresses": ["192.168.1.10", "10.0.0.5"],
        },
        "risk_thresholds": {
            "require_approval": ["critical", "high"],
            "log_only": ["medium", "low", "informational"],
            "auto_remediate": [],
        },
        "disclaimer": meta.disclaimer,
        "render": meta.render.model_dump(),
        "generated_at": ts,
    }

    env = _make_env(template_dir)
    tmpl = env.get_template(j2_file)
    return tmpl.render(**context)
