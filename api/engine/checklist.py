"""
SCOPE Engine — Assessment Checklist Generator

Converts a list of module names into AssessmentTask rows that track
per-module execution state, coverage, notes, and findings.

Idempotent: calling generate_checklist() twice on the same assessment
only creates tasks for modules that don't already have a row.

Task lifecycle states
---------------------
not_planned  → ready (when deps are satisfied at generation time)
ready        → running (set by runner before execution)
running      → completed (set by runner._persist after successful run)
running      → failed    (set by runner on unhandled exception)
completed    → needs_manual_validation (semi_auto modules — future)
needs_manual_validation → completed (analyst clicks Mark Validated)
ready/not_planned → skipped  (analyst decision)
ready → blocked  (tool or root unavailable at generation time)
"""
from __future__ import annotations

import json
from datetime import datetime

import models
from engine.registry import REGISTRY
from engine.capabilities import detect_capabilities
from engine.domains import MODULE_TO_DOMAIN

# ── Per-module metadata ───────────────────────────────────────────────────────

MODULE_META: dict[str, dict] = {
    "system.kernel_params":      {"priority": "high",     "category": "System"},
    "system.user_accounts":      {"priority": "high",     "category": "System"},
    "system.file_permissions":   {"priority": "medium",   "category": "System"},
    "network.open_ports":        {"priority": "high",     "category": "Network"},
    "network.firewall_state":    {"priority": "high",     "category": "Network"},
    "auth.ssh_config":           {"priority": "critical", "category": "Authentication"},
    "auth.pam_config":           {"priority": "high",     "category": "Authentication"},
    "software.package_versions": {"priority": "medium",   "category": "Software"},
    "software.service_config":   {"priority": "medium",   "category": "Software"},
    "secrets.env_files":         {"priority": "critical", "category": "Secrets"},
    "secrets.key_files":         {"priority": "high",     "category": "Secrets"},
}

# Module-level hard dependencies (module → list of required module names).
MODULE_DEPS: dict[str, list[str]] = {}


def _category_from_name(mod_name: str) -> str:
    prefix = mod_name.split(".")[0]
    return {
        "system":   "System",
        "network":  "Network",
        "auth":     "Authentication",
        "software": "Software",
        "secrets":  "Secrets",
    }.get(prefix, "General")


def _initial_status(check, caps) -> str:
    if check.requires_root and not caps.is_root:
        return "blocked"
    if not check.is_available():
        return "blocked"
    return "ready"


# ── Public API ────────────────────────────────────────────────────────────────

def generate_checklist(
    assessment_id: int,
    module_names: list[str],
    db,
) -> list[models.AssessmentTask]:
    """
    Create AssessmentTask rows for each module in *module_names*.
    Skips modules that already have a task row for this assessment.
    Returns the list of newly-created task objects (refreshed from DB).
    """
    caps = detect_capabilities()
    existing = {
        t.module_name
        for t in db.query(models.AssessmentTask)
                   .filter_by(assessment_id=assessment_id)
                   .all()
    }

    new_tasks: list[models.AssessmentTask] = []
    now = datetime.utcnow()

    for i, mod_name in enumerate(module_names):
        if mod_name in existing:
            continue

        check_cls = REGISTRY.get(mod_name)
        if check_cls is None:
            continue

        check = check_cls()
        meta = MODULE_META.get(mod_name, {})
        deps = MODULE_DEPS.get(mod_name, [])

        task = models.AssessmentTask(
            assessment_id       = assessment_id,
            module_name         = mod_name,
            title               = check.description,
            category            = meta.get("category", _category_from_name(mod_name)),
            domain_id           = MODULE_TO_DOMAIN.get(mod_name, "other"),
            priority            = meta.get("priority", "medium"),
            automation_level    = "auto",
            status              = _initial_status(check, caps),
            requires_root       = check.requires_root,
            tool_dependencies   = json.dumps([]),
            module_dependencies = json.dumps(deps),
            order_index         = i,
            created_at          = now,
            updated_at          = now,
        )
        db.add(task)
        new_tasks.append(task)

    if new_tasks:
        db.commit()
        for t in new_tasks:
            db.refresh(t)

    return new_tasks


def calculate_coverage(assessment_id: int, db) -> dict:
    tasks = (
        db.query(models.AssessmentTask)
          .filter_by(assessment_id=assessment_id)
          .all()
    )
    total = len(tasks)
    if total == 0:
        return {
            "total": 0, "covered": 0, "pct": 0,
            "auto": 0, "manual": 0, "blocked": 0, "remaining": 0,
        }

    COVERED = {"completed", "needs_manual_validation", "skipped"}

    covered   = sum(1 for t in tasks if t.status in COVERED)
    auto_done = sum(1 for t in tasks if t.status == "completed" and t.automation_level == "auto")
    validated = sum(1 for t in tasks if t.manually_validated)
    blocked   = sum(1 for t in tasks if t.status == "blocked")

    return {
        "total":     total,
        "covered":   covered,
        "pct":       round((covered / total) * 100),
        "auto":      auto_done,
        "manual":    validated,
        "blocked":   blocked,
        "remaining": max(0, total - covered - blocked),
    }
