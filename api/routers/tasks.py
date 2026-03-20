"""
SCOPE — Task dispatch and SSE streaming router.

POST /api/tasks        — create a task, get back a task_id
GET  /api/tasks/{id}/stream — stream SSE events for the task

Task execution is delegated to the real audit engine (engine/runner.py).
Simulated/mock generators have been removed.
"""
import json
import uuid
from datetime import datetime

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from engine.runner import AuditRunner, _evt, _sse

router = APIRouter()

# In-memory task store (sufficient for a local single-user tool)
_tasks: dict[str, dict] = {}


# ── Playbook definitions (module name lists) ──────────────────────────────────

PLAYBOOK_MODULES: dict[str, list[str]] = {
    "linux-baseline": [
        "system.kernel_params",
        "system.user_accounts",
        "system.file_permissions",
        "network.open_ports",
        "network.firewall_state",
        "auth.ssh_config",
        "auth.pam_config",
        "software.package_versions",
        "software.service_config",
        "secrets.env_files",
        "secrets.key_files",
    ],
    "ssh-hardening": [
        "auth.ssh_config",
        "auth.pam_config",
        "secrets.key_files",
    ],
    "network-exposure": [
        "network.open_ports",
        "network.firewall_state",
    ],
    "user-accounts": [
        "system.user_accounts",
        "auth.pam_config",
    ],
    "file-permissions": [
        "system.file_permissions",
        "secrets.key_files",
    ],
}


# ── Timestamp helper ──────────────────────────────────────────────────────────

def _ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


# ── Task generators ───────────────────────────────────────────────────────────

async def gen_run_playbook(task_id: str, playbook: str, assessment_id=None,
                           dry_run: bool = False, verbose: bool = False):
    module_names = PLAYBOOK_MODULES.get(playbook)
    if not module_names:
        yield _sse(_evt("error", f"Unknown playbook: '{playbook}'", "✗"))
        yield _sse(json.dumps({"type": "done"}))
        return

    runner = AuditRunner(
        module_names=module_names,
        assessment_id=assessment_id,
        verbose=verbose,
        dry_run=dry_run,
    )
    async for chunk in runner.stream():
        yield chunk


async def gen_run_module(task_id: str, module: str, assessment_id=None,
                         verbose: bool = False):
    from engine.registry import REGISTRY
    if module not in REGISTRY:
        yield _sse(_evt("error", f"Unknown module: '{module}'", "✗"))
        yield _sse(json.dumps({"type": "done"}))
        return

    runner = AuditRunner(
        module_names=[module],
        assessment_id=assessment_id,
        verbose=verbose,
        dry_run=False,
    )
    async for chunk in runner.stream():
        yield chunk


async def gen_refresh_findings(task_id: str):
    """Re-aggregate finding stats and update dashboard KPIs."""
    from database import SessionLocal
    import models

    yield _sse(_evt("task_start", "Refreshing findings database...", "↻"))

    db = SessionLocal()
    try:
        open_count = db.query(models.Finding).filter(
            models.Finding.status == "open"
        ).count()
        critical_count = db.query(models.Finding).filter(
            models.Finding.status == "open",
            models.Finding.severity == "critical",
        ).count()

        yield _sse(_evt("info", f"  Open findings: {open_count}", "·"))
        yield _sse(_evt("info", f"  Critical findings: {critical_count}", "·"))
        yield _sse(_evt("task_complete", "Refresh complete — dashboard KPIs updated.", "✓"))
    except Exception as exc:
        yield _sse(_evt("error", f"  Refresh failed: {exc}", "✗"))
    finally:
        db.close()

    yield _sse(json.dumps({"type": "done"}))


async def gen_generate_report(task_id: str, format_: str, assessment_id=None):
    """Generate a report file from assessment findings."""
    import os
    from database import SessionLocal
    import models

    fmt_upper = format_.upper()
    yield _sse(_evt("task_start", f"Generating {fmt_upper} report...", "⤓"))

    db = SessionLocal()
    try:
        # Gather findings
        query = db.query(models.Finding)
        if assessment_id:
            query = query.filter(models.Finding.assessment_id == assessment_id)
        findings = query.order_by(models.Finding.severity).all()

        yield _sse(_evt("info", f"  Loading {len(findings)} finding(s)...", "·"))

        # Build report content
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "reports")
        os.makedirs(report_dir, exist_ok=True)

        fname = f"scope_report_{timestamp}.{format_.lower()}"
        fpath = os.path.join(report_dir, fname)

        if format_.lower() == "json":
            _write_json_report(fpath, findings)
        elif format_.lower() in ("html",):
            _write_html_report(fpath, findings)
        else:
            _write_markdown_report(fpath, findings)

        size_kb = os.path.getsize(fpath) // 1024
        yield _sse(_evt("info", f"  Rendering complete — {len(findings)} findings included.", "·"))
        yield _sse(_evt("report", f"Report generated: {fname}  ({size_kb} KB)", "✓"))
        yield _sse(_evt("info", f"  Saved to: reports/{fname}", "·"))

        # Persist report record
        assessment_name = ""
        if assessment_id:
            a = db.query(models.Assessment).filter(
                models.Assessment.id == assessment_id
            ).first()
            if a:
                assessment_name = a.name

        db.add(models.Report(
            name=f"Report — {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            assessment_id=assessment_id,
            assessment_name=assessment_name,
            format=fmt_upper,
            date=datetime.utcnow(),
            size=f"{size_kb} KB",
        ))
        db.commit()

    except Exception as exc:
        yield _sse(_evt("error", f"  Report generation failed: {exc}", "✗"))
    finally:
        db.close()

    yield _sse(json.dumps({"type": "done"}))


async def gen_suggest_checks(task_id: str):
    """Analyse current findings and suggest follow-up modules."""
    from database import SessionLocal
    from engine.registry import REGISTRY
    import models

    yield _sse(_evt("task_start", "Analysing current findings for coverage gaps...", "💡"))

    db = SessionLocal()
    try:
        open_findings = db.query(models.Finding).filter(
            models.Finding.status == "open"
        ).all()

        categories = {f.category.lower() for f in open_findings}
        titles = " ".join(f.title.lower() for f in open_findings)

        suggestions: list[tuple[str, str]] = []

        if "authentication" in categories or "ssh" in titles:
            if "auth.ssh_config" in REGISTRY:
                suggestions.append(("auth.ssh_config", "Auth/SSH findings present — SSH config not recently audited"))
        if "authentication" in categories or "pam" in titles:
            if "auth.pam_config" in REGISTRY:
                suggestions.append(("auth.pam_config", "Auth findings present — PAM policy not audited"))
        if "network" in categories or "port" in titles or "firewall" in titles:
            if "network.firewall_state" in REGISTRY:
                suggestions.append(("network.firewall_state", "Network findings present — firewall state not verified"))
            if "network.open_ports" in REGISTRY:
                suggestions.append(("network.open_ports", "Network findings present — full port inventory recommended"))
        if "secrets" in categories or "credential" in titles or "password" in titles:
            if "secrets.env_files" in REGISTRY:
                suggestions.append(("secrets.env_files", "Credential findings present — env file scan recommended"))
        if "software" in categories or "package" in titles or "outdated" in titles:
            if "software.package_versions" in REGISTRY:
                suggestions.append(("software.package_versions", "Software findings present — full package audit recommended"))

        # Always suggest linux-baseline if nothing else
        if not suggestions:
            suggestions = [
                ("system.kernel_params",      "No kernel hardening audit on record"),
                ("system.user_accounts",      "No user account review on record"),
                ("auth.ssh_config",           "No SSH configuration audit on record"),
                ("network.firewall_state",    "No firewall state check on record"),
            ]

        yield _sse(_evt("info", f"  Analysed {len(open_findings)} open finding(s)...", "·"))
        yield _sse(_evt("divider", "", ""))
        yield _sse(_evt("suggest", "Suggested modules based on current findings:", "💡"))

        for mod, reason in suggestions:
            yield _sse(_evt("suggest", f"  {mod.ljust(34)} {reason}", "→"))

        yield _sse(_evt("info", "", "·"))
        yield _sse(_evt("info", "Run any suggestion from the Console page.", "·"))

    except Exception as exc:
        yield _sse(_evt("error", f"  Suggestion analysis failed: {exc}", "✗"))
    finally:
        db.close()

    yield _sse(json.dumps({"type": "done"}))


# ── Simple report writers ─────────────────────────────────────────────────────

def _write_json_report(path: str, findings) -> None:
    import json as _json
    data = {
        "generated": datetime.utcnow().isoformat(),
        "finding_count": len(findings),
        "findings": [
            {
                "id": f.id,
                "severity": f.severity,
                "title": f.title,
                "category": f.category,
                "status": f.status,
                "description": f.description,
                "evidence": f.evidence,
                "remediation_simple": f.remediation_simple,
                "remediation_technical": f.remediation_technical,
                "date_found": f.date_found.isoformat() if f.date_found else None,
            }
            for f in findings
        ],
    }
    with open(path, "w") as fh:
        _json.dump(data, fh, indent=2)


def _write_markdown_report(path: str, findings) -> None:
    lines = [
        "# SCOPE Security Assessment Report",
        f"\n**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        f"**Total Findings:** {len(findings)}",
        "\n---\n",
    ]
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    sorted_findings = sorted(findings, key=lambda f: sev_order.get(f.severity, 5))
    for f in sorted_findings:
        lines.append(f"## [{f.severity.upper()}] {f.title}")
        lines.append(f"\n**Category:** {f.category}  |  **Status:** {f.status}\n")
        lines.append(f"### Description\n{f.description}\n")
        if f.evidence:
            lines.append(f"### Evidence\n```\n{f.evidence}\n```\n")
        if f.remediation_simple:
            lines.append(f"### Remediation\n{f.remediation_simple}\n")
        if f.remediation_technical:
            lines.append(f"```bash\n{f.remediation_technical}\n```\n")
        lines.append("---\n")
    with open(path, "w") as fh:
        fh.write("\n".join(lines))


def _write_html_report(path: str, findings) -> None:
    sev_colors = {
        "critical": "#dc2626", "high": "#ea580c",
        "medium": "#d97706", "low": "#2563eb", "info": "#6b7280",
    }
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    sorted_findings = sorted(findings, key=lambda f: sev_order.get(f.severity, 5))

    rows = ""
    for f in sorted_findings:
        color = sev_colors.get(f.severity, "#6b7280")
        rows += f"""
        <div class="finding">
          <div class="finding-header">
            <span class="badge" style="background:{color}">{f.severity.upper()}</span>
            <strong>{f.title}</strong>
            <span class="category">{f.category}</span>
          </div>
          <p>{f.description}</p>
          {"<pre class='evidence'>" + f.evidence + "</pre>" if f.evidence else ""}
          <p><strong>Remediation:</strong> {f.remediation_simple}</p>
          {"<pre class='code'>" + f.remediation_technical + "</pre>" if f.remediation_technical else ""}
        </div>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SCOPE Security Report</title>
  <style>
    body {{ font-family: system-ui, sans-serif; max-width: 960px; margin: 40px auto; padding: 0 20px; background: #0f172a; color: #e2e8f0; }}
    h1 {{ color: #38bdf8; }} .meta {{ color: #94a3b8; margin-bottom: 2rem; }}
    .finding {{ border: 1px solid #1e293b; border-radius: 8px; padding: 1.5rem; margin: 1rem 0; background: #1e293b; }}
    .finding-header {{ display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }}
    .badge {{ padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; color: #fff; }}
    .category {{ font-size: 0.85rem; color: #94a3b8; margin-left: auto; }}
    pre {{ background: #0f172a; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.85rem; }}
    .evidence {{ border-left: 3px solid #475569; }}
    .code {{ border-left: 3px solid #38bdf8; }}
  </style>
</head>
<body>
  <h1>SCOPE Security Assessment Report</h1>
  <p class="meta">Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')} &nbsp;|&nbsp; {len(findings)} finding(s)</p>
  {rows}
</body>
</html>"""
    with open(path, "w") as fh:
        fh.write(html)


# ── Router endpoints ──────────────────────────────────────────────────────────

@router.post("/tasks")
async def create_task(body: dict):
    task_id = str(uuid.uuid4())[:8]
    _tasks[task_id] = body
    return {"task_id": task_id}


@router.get("/tasks/{task_id}/stream")
async def stream_task(task_id: str):
    body = _tasks.get(task_id)

    if not body:
        async def not_found():
            yield _sse(_evt("error", f"Task {task_id} not found.", "✗"))
            yield _sse(json.dumps({"type": "done"}))
        return StreamingResponse(not_found(), media_type="text/event-stream")

    task_type = body.get("task")
    assessment_id = body.get("assessmentId")

    if task_type == "run_playbook":
        gen = gen_run_playbook(
            task_id,
            body.get("playbook", "linux-baseline"),
            assessment_id=assessment_id,
            dry_run=body.get("dryRun", False),
            verbose=body.get("verbose", False),
        )
    elif task_type == "run_module":
        gen = gen_run_module(
            task_id,
            body.get("module", ""),
            assessment_id=assessment_id,
            verbose=body.get("verbose", False),
        )
    elif task_type == "refresh_findings":
        gen = gen_refresh_findings(task_id)
    elif task_type == "generate_report":
        gen = gen_generate_report(
            task_id,
            body.get("format", "html"),
            assessment_id=assessment_id,
        )
    elif task_type == "suggest_checks":
        gen = gen_suggest_checks(task_id)
    else:
        async def unknown():
            yield _sse(_evt("error", f"Unknown task type: {task_type}", "✗"))
            yield _sse(json.dumps({"type": "done"}))
        gen = unknown()

    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/modules")
async def list_modules():
    from engine.registry import REGISTRY
    return [
        {"name": name, "desc": cls.description}
        for name, cls in REGISTRY.items()
    ]


@router.get("/playbooks")
async def list_playbooks():
    descriptions = {
        "linux-baseline":   "Full Linux CIS baseline audit (11 modules)",
        "ssh-hardening":    "SSH configuration and key review (3 modules)",
        "network-exposure": "Open ports and firewall state (2 modules)",
        "user-accounts":    "User account and privilege audit (2 modules)",
        "file-permissions": "World-writable files and SUID/SGID scan (2 modules)",
    }
    return [
        {"name": name, "desc": descriptions.get(name, ""), "modules": modules}
        for name, modules in PLAYBOOK_MODULES.items()
    ]
