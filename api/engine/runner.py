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
from engine.preflight import run_preflight


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
    module_names    : list of dotted module names, e.g. ["auth.ssh_config"]
    assessment_id   : if provided, findings are persisted to the DB
    task_id         : if provided (AssessmentTask.id), that single task's
                      state is updated and its findings are linked to it
    task_id_map     : module_name → AssessmentTask.id mapping for multi-task
                      runs (Run All / Run Domain). Mutually exclusive with
                      task_id — if both are set, task_id_map takes precedence.
    verbose         : emit raw evidence lines after each finding
    dry_run         : enumerate modules but do not execute or persist anything
    """

    def __init__(
        self,
        module_names: list[str],
        assessment_id: int | None = None,
        task_id: int | None = None,
        task_id_map: dict[str, int] | None = None,
        verbose: bool = False,
        dry_run: bool = False,
    ) -> None:
        self.module_names  = module_names
        self.assessment_id = assessment_id
        self.task_id       = task_id
        self.task_id_map   = task_id_map
        self.verbose       = verbose
        self.dry_run       = dry_run

    # ── Convenience: resolve task_id for a given module ───────────────────────

    def _resolve_task_id(self, mod_name: str) -> int | None:
        if self.task_id_map:
            return self.task_id_map.get(mod_name)
        return self.task_id

    async def stream(self) -> AsyncIterator[str]:
        total     = len(self.module_names)
        mode_tag  = "  [DRY RUN — nothing will be saved]" if self.dry_run else ""
        run_start = datetime.utcnow()

        yield _sse(_evt("task_start", f"Starting audit — {total} module(s){mode_tag}", "▷"))
        await asyncio.sleep(0.05)

        # ── Preflight ─────────────────────────────────────────────────────────
        yield _sse(_evt("preflight_start", "  Preflight checks…", "·"))
        await asyncio.sleep(0.03)

        loop = asyncio.get_running_loop()
        preflight = await loop.run_in_executor(None, run_preflight, self.module_names)
        caps      = preflight.capability_profile

        for evt_type, msg in preflight.to_sse_lines():
            yield _sse(_evt(evt_type, f"  {msg}", "·"))
            await asyncio.sleep(0.02)

        if not preflight.passed:
            for err in preflight.errors:
                yield _sse(_evt("error", f"  Preflight error: {err}", "✗"))
            yield _sse(_evt("task_complete", "Audit aborted — preflight failed.", "✗"))
            yield _sse(json.dumps({"type": "done"}))
            return

        yield _sse(_divider())
        await asyncio.sleep(0.05)

        # Mark relevant checklist tasks as running
        if not self.dry_run:
            if self.task_id is not None:
                await loop.run_in_executor(
                    None, self._set_task_status, [self.task_id], "running"
                )
            elif self.task_id_map:
                await loop.run_in_executor(
                    None, self._set_task_status, list(self.task_id_map.values()), "running"
                )

        # Accumulate (module_name, CheckFinding) for DB persistence
        all_findings: list[tuple[str, CheckFinding]] = []
        errors = 0
        euid   = caps.euid if caps else os.geteuid()

        for i, mod_name in enumerate(self.module_names, 1):
            check_cls = REGISTRY.get(mod_name)
            if check_cls is None:
                yield _sse(_evt("error", f"[{i}/{total}]  Unknown module: {mod_name}", "✗"))
                errors += 1
                continue

            check = check_cls()

            if caps:
                check.capabilities = caps

            yield _sse(_evt(
                "module_start",
                f"[{i}/{total}]  Running: {mod_name}  —  {check.description}",
                "·",
            ))
            await asyncio.sleep(0.05)

            if self.dry_run:
                yield _sse(_evt("dry_run", f"  DRY RUN: {mod_name} would execute", "○"))
                continue

            if check.requires_root and euid != 0:
                yield _sse(_evt("info", f"  Skipped — requires root (run SCOPE as root for full coverage)", "○"))
                continue

            if not check.is_available():
                yield _sse(_evt("info", f"  Skipped — required tools/files not available on this system", "○"))
                continue

            try:
                findings: list[CheckFinding] = await loop.run_in_executor(None, check.run)
            except Exception as exc:
                yield _sse(_evt("error", f"  Error in {mod_name}: {exc}", "✗"))
                errors += 1
                t_id = self._resolve_task_id(mod_name)
                if t_id is not None:
                    await loop.run_in_executor(None, self._set_task_status, [t_id], "failed")
                continue

            if findings:
                for finding in findings:
                    sev_upper = finding.severity.upper()
                    etype = "finding_critical" if finding.severity == "critical" else "finding"
                    yield _sse(_evt(etype, f"  ⚑  {finding.title}  [{sev_upper}]", "⚑"))
                    if self.verbose:
                        await asyncio.sleep(0.03)
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
                self._persist(all_findings, run_start)
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

    # ── DB helpers (synchronous, called from async via run_in_executor) ────────

    def _set_task_status(self, task_ids: list[int], status: str) -> None:
        from database import SessionLocal
        import models as m

        db = SessionLocal()
        try:
            for t_id in task_ids:
                task = db.query(m.AssessmentTask).filter_by(id=t_id).first()
                if task:
                    task.status = status
                    task.updated_at = datetime.utcnow()
            db.commit()
        finally:
            db.close()

    def _persist(self, all_findings: list[tuple[str, CheckFinding]], run_start: datetime | None = None) -> None:
        from database import SessionLocal
        import models as m

        db = SessionLocal()
        now   = datetime.utcnow()
        start = run_start or now

        try:
            # ── Save findings ──────────────────────────────────────────────────
            for mod_name, f in all_findings:
                t_id = self._resolve_task_id(mod_name)
                db.add(m.Finding(
                    assessment_id         = self.assessment_id,
                    task_id               = t_id,
                    severity              = f.severity,
                    title                 = f.title,
                    category              = f.category,
                    description           = f.description,
                    evidence              = f.evidence,
                    remediation_simple    = f.remediation_simple,
                    remediation_technical = f.remediation_technical,
                    status                = "open",
                    date_found            = now,
                ))

            # ── Update assessment ──────────────────────────────────────────────
            assessment = db.query(m.Assessment).filter(
                m.Assessment.id == self.assessment_id
            ).first()
            if assessment:
                assessment.last_run = now
                assessment.status   = "active"

            # ── Update checklist task(s) ───────────────────────────────────────
            duration_ms = int((now - start).total_seconds() * 1000)

            if self.task_id is not None:
                # Single-task run
                task = db.query(m.AssessmentTask).filter_by(id=self.task_id).first()
                if task:
                    task.status        = "completed"
                    task.finding_count = sum(1 for mn, _ in all_findings if self.task_id_map is None)
                    task.last_run_at   = now
                    task.updated_at    = now

                db.add(m.TaskRun(
                    task_id       = self.task_id,
                    assessment_id = self.assessment_id,
                    triggered_by  = "manual",
                    started_at    = start,
                    completed_at  = now,
                    status        = "completed",
                    finding_count = len(all_findings),
                    duration_ms   = duration_ms,
                ))

            elif self.task_id_map:
                # Multi-task run — update each module's task independently
                module_finding_counts: dict[str, int] = {}
                for mod_name, _ in all_findings:
                    module_finding_counts[mod_name] = module_finding_counts.get(mod_name, 0) + 1

                executed_modules = {mn for mn in self.module_names}
                for mod_name, t_id in self.task_id_map.items():
                    if mod_name not in executed_modules:
                        continue
                    task = db.query(m.AssessmentTask).filter_by(id=t_id).first()
                    if task:
                        task.status        = "completed"
                        task.finding_count = module_finding_counts.get(mod_name, 0)
                        task.last_run_at   = now
                        task.updated_at    = now

                    db.add(m.TaskRun(
                        task_id       = t_id,
                        assessment_id = self.assessment_id,
                        triggered_by  = "auto",
                        started_at    = start,
                        completed_at  = now,
                        status        = "completed",
                        finding_count = module_finding_counts.get(mod_name, 0),
                        duration_ms   = duration_ms,
                    ))

            # ── Summary run record ─────────────────────────────────────────────
            has_critical = any(f.severity == "critical" for _, f in all_findings)
            db.add(m.Run(
                assessment_id = self.assessment_id,
                date          = now,
                status        = "complete",
                finding_count = len(all_findings),
            ))

            db.add(m.ActivityEvent(
                type      = "run_complete",
                message   = f"Audit run completed: {len(all_findings)} finding(s)",
                detail    = f"{len(self.module_names)} modules executed",
                timestamp = now,
                icon      = "check",
                color     = "danger" if has_critical else "success",
            ))

            db.commit()
        finally:
            db.close()
