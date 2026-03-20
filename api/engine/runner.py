"""
SCOPE Engine — AuditRunner

Executes a list of named check modules, streams SSE events,
and persists findings to the database when an assessment_id is provided.

Design rules:
- run() methods are synchronous; each is called via run_in_executor
  to avoid blocking the async event loop.
- No shell=True anywhere.
- Root-required modules are skipped gracefully when EUID != 0.
- All DB writes happen after all modules complete (no partial commits on error).
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime
from typing import AsyncIterator

from engine.registry import REGISTRY
from engine.base import CheckFinding


# ── SSE helpers ───────────────────────────────────────────────────────────────

def _ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _evt(type_: str, message: str, icon: str = "·") -> str:
    return json.dumps({"type": type_, "message": message, "icon": icon, "ts": _ts()})


def _divider() -> str:
    return json.dumps({"type": "divider", "message": "", "icon": "", "ts": _ts()})


def _sse(payload: str) -> str:
    return f"data: {payload}\n\n"


# ── Runner ────────────────────────────────────────────────────────────────────

class AuditRunner:
    """
    Runs a sequence of named modules and yields SSE-formatted strings.

    Parameters
    ----------
    module_names : list of dotted module names, e.g. ["auth.ssh_config"]
    assessment_id : if provided, findings are persisted to the DB
    verbose : emit raw evidence lines after each finding
    dry_run : enumerate modules but do not execute or persist anything
    """

    def __init__(
        self,
        module_names: list[str],
        assessment_id: int | None = None,
        verbose: bool = False,
        dry_run: bool = False,
    ) -> None:
        self.module_names = module_names
        self.assessment_id = assessment_id
        self.verbose = verbose
        self.dry_run = dry_run

    async def stream(self) -> AsyncIterator[str]:
        total = len(self.module_names)
        mode_tag = "  [DRY RUN — nothing will be saved]" if self.dry_run else ""
        euid = os.geteuid()

        yield _sse(_evt("task_start", f"Starting audit — {total} module(s){mode_tag}", "▷"))
        await asyncio.sleep(0.05)

        if not self.dry_run and euid != 0:
            yield _sse(_evt(
                "info",
                f"  Running as non-root (UID {euid}) — modules requiring root will be skipped",
                "·",
            ))
            await asyncio.sleep(0.05)

        # Accumulate (module_name, CheckFinding) for DB persistence
        all_findings: list[tuple[str, CheckFinding]] = []
        errors = 0

        for i, mod_name in enumerate(self.module_names, 1):
            check_cls = REGISTRY.get(mod_name)
            if check_cls is None:
                yield _sse(_evt("error", f"[{i}/{total}]  Unknown module: {mod_name}", "✗"))
                errors += 1
                continue

            check = check_cls()
            yield _sse(_evt(
                "module_start",
                f"[{i}/{total}]  Running: {mod_name}  —  {check.description}",
                "·",
            ))
            await asyncio.sleep(0.05)

            if self.dry_run:
                yield _sse(_evt("dry_run", f"  DRY RUN: {mod_name} would execute", "○"))
                continue

            # Privilege gate
            if check.requires_root and euid != 0:
                yield _sse(_evt("info", f"  Skipped — requires root (run SCOPE as root for full coverage)", "○"))
                continue

            # Tool availability gate
            if not check.is_available():
                yield _sse(_evt("info", f"  Skipped — required tools/files not available on this system", "○"))
                continue

            # Execute synchronous check in thread pool
            loop = asyncio.get_running_loop()
            try:
                findings: list[CheckFinding] = await loop.run_in_executor(None, check.run)
            except Exception as exc:
                yield _sse(_evt("error", f"  Error in {mod_name}: {exc}", "✗"))
                errors += 1
                continue

            if findings:
                for finding in findings:
                    sev_upper = finding.severity.upper()
                    etype = "finding_critical" if finding.severity == "critical" else "finding"
                    yield _sse(_evt(etype, f"  ⚑  {finding.title}  [{sev_upper}]", "⚑"))
                    if self.verbose:
                        await asyncio.sleep(0.03)
                        # Truncate evidence to keep SSE lines readable
                        ev_line = finding.evidence.split("\n")[0][:120]
                        yield _sse(_evt("info", f"  └─  {ev_line}", "·"))
                all_findings.extend((mod_name, f) for f in findings)
            else:
                yield _sse(_evt("module_done", f"  ✓  {mod_name} — passed (0 findings)", "✓"))

            await asyncio.sleep(0.08)

        yield _sse(_divider())
        await asyncio.sleep(0.05)

        # ── Persist to DB ──────────────────────────────────────────────────────
        if not self.dry_run and self.assessment_id is not None:
            yield _sse(_evt("info", "  Persisting findings to database...", "·"))
            try:
                self._persist(all_findings)
                yield _sse(_evt("info", "  Findings saved.", "·"))
            except Exception as exc:
                yield _sse(_evt("error", f"  Failed to save findings: {exc}", "✗"))
                errors += 1
            await asyncio.sleep(0.05)

        total_f = len(all_findings)
        yield _sse(_evt(
            "task_complete",
            f"Audit complete — {total} modules run  ·  {total_f} finding(s)  ·  {errors} error(s)",
            "✓",
        ))

        if not self.dry_run and total_f > 0:
            await asyncio.sleep(0.05)
            yield _sse(_evt("info", "Review findings in the Findings page.", "·"))

        yield _sse(json.dumps({"type": "done"}))

    # ── DB persistence (synchronous helper, called from async context) ─────────

    def _persist(self, all_findings: list[tuple[str, CheckFinding]]) -> None:
        from database import SessionLocal
        import models

        db = SessionLocal()
        try:
            now = datetime.utcnow()

            for _mod_name, f in all_findings:
                db.add(models.Finding(
                    assessment_id=self.assessment_id,
                    severity=f.severity,
                    title=f.title,
                    category=f.category,
                    description=f.description,
                    evidence=f.evidence,
                    remediation_simple=f.remediation_simple,
                    remediation_technical=f.remediation_technical,
                    status="open",
                    date_found=now,
                ))

            assessment = db.query(models.Assessment).filter(
                models.Assessment.id == self.assessment_id
            ).first()
            if assessment:
                assessment.last_run = now
                assessment.status = "active"

            has_critical = any(f.severity == "critical" for _, f in all_findings)
            db.add(models.Run(
                assessment_id=self.assessment_id,
                date=now,
                status="complete",
                finding_count=len(all_findings),
            ))

            db.add(models.ActivityEvent(
                type="run_complete",
                message=f"Audit run completed: {len(all_findings)} finding(s)",
                detail=f"{len(self.module_names)} modules executed",
                timestamp=now,
                icon="check",
                color="danger" if has_critical else "success",
            ))

            db.commit()
        finally:
            db.close()
