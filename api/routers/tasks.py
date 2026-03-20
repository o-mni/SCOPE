import asyncio
import json
import uuid
from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()

# In-memory task store (sufficient for local single-user tool)
_tasks = {}

# ─── Timestamp helper ─────────────────────────────────────────────────────────

def ts():
    return datetime.now().strftime("%H:%M:%S")

# ─── Event builder ────────────────────────────────────────────────────────────

def evt(type_, message, icon="·"):
    return json.dumps({"type": type_, "message": message, "icon": icon, "ts": ts()})

def divider():
    return json.dumps({"type": "divider", "message": "", "icon": "", "ts": ts()})

# ─── Task generators ──────────────────────────────────────────────────────────

PLAYBOOK_MODULES = {
    "linux-baseline": [
        ("system.kernel_params",    "Kernel sysctl parameter checks",          True,  2, "2 findings — net.ipv4.tcp_syncookies disabled, kernel.dmesg_restrict not set"),
        ("system.user_accounts",    "User account and privilege review",        True,  1, "1 finding — account 'backup' has no password set"),
        ("system.file_permissions", "World-writable and SUID/SGID scan",        True,  3, "3 findings — /var/tmp/uploads world-writable, 2 unexpected SUID binaries"),
        ("network.open_ports",      "Listening port enumeration",               False, 0, "Passed — no unexpected listening ports"),
        ("network.firewall_state",  "Firewall configuration check",             True,  1, "1 finding — iptables rules not persistent across reboots"),
        ("auth.ssh_config",         "SSH daemon configuration audit",           True,  4, "4 findings — root login permitted, weak ciphers enabled, no idle timeout, no banner"),
        ("auth.pam_config",         "PAM authentication configuration",         False, 0, "Passed — PAM configuration within baseline"),
        ("software.package_versions","Outdated package detection",              True,  2, "2 findings — openssl 1.1.1k (EOL), bind9 vulnerable version"),
        ("software.service_config", "Running service configuration review",     False, 0, "Passed — no unexpected services"),
        ("secrets.env_files",       "Exposed credentials in environment files", True,  1, "1 finding — .env file with DB_PASSWORD in /opt/app"),
        ("secrets.key_files",       "SSH key and certificate exposure scan",    True,  1, "1 finding — private key world-readable: /home/deploy/.ssh/id_rsa"),
    ],
    "ssh-hardening": [
        ("auth.ssh_config",  "SSH daemon configuration audit",      True,  4, "4 findings — root login permitted, weak ciphers, no idle timeout, no banner"),
        ("auth.pam_config",  "PAM authentication configuration",    False, 0, "Passed — PAM configuration within baseline"),
        ("secrets.key_files","SSH key and certificate exposure scan",True, 1, "1 finding — private key world-readable: /home/deploy/.ssh/id_rsa"),
    ],
    "network-exposure": [
        ("network.open_ports",   "Listening port enumeration",       True,  1, "1 finding — port 2222 listening, no corresponding service documented"),
        ("network.firewall_state","Firewall configuration check",    True,  1, "1 finding — iptables rules not persistent across reboots"),
    ],
    "user-accounts": [
        ("system.user_accounts", "User account and privilege review",True,  1, "1 finding — account 'backup' has no password set"),
        ("auth.pam_config",      "PAM authentication configuration", False, 0, "Passed — PAM configuration within baseline"),
    ],
    "file-permissions": [
        ("system.file_permissions","World-writable and SUID/SGID scan",True, 3, "3 findings — /var/tmp/uploads world-writable, 2 unexpected SUID binaries"),
        ("secrets.key_files",     "SSH key exposure scan",           True,  1, "1 finding — private key world-readable"),
    ],
}

async def gen_run_playbook(task_id, playbook, dry_run=False, verbose=False):
    modules = PLAYBOOK_MODULES.get(playbook, [])
    total   = len(modules)
    mode    = " [DRY RUN — no findings will be saved]" if dry_run else ""

    yield f"data: {evt('task_start', f'Starting playbook: {playbook}{mode}', '▷')}\n\n"
    await asyncio.sleep(0.3)
    yield f"data: {evt('info', f'Loading {total} modules...', '·')}\n\n"
    await asyncio.sleep(0.4)

    total_findings = 0
    errors         = 0

    for i, (mod_name, mod_desc, has_findings, finding_count, detail) in enumerate(modules, 1):
        yield f"data: {evt('module_start', f'[{i}/{total}]  Running: {mod_name}  —  {mod_desc}', '·')}\n\n"
        await asyncio.sleep(0.6 + (0.4 if has_findings else 0.2))

        if dry_run:
            yield f"data: {evt('dry_run', f'  DRY RUN: {mod_name} would execute ({finding_count} expected findings)', '○')}\n\n"
            continue

        if has_findings:
            sev = "CRITICAL" if finding_count >= 4 else "HIGH" if finding_count >= 2 else "MEDIUM"
            etype = "finding_critical" if sev == "CRITICAL" else "finding"
            yield f"data: {evt(etype, f'  ⚑  {mod_name} — {finding_count} finding(s)  [{sev}]', '⚑')}\n\n"
            if verbose:
                await asyncio.sleep(0.1)
                yield f"data: {evt('info', f'  └─  {detail}', '·')}\n\n"
            total_findings += finding_count
        else:
            yield f"data: {evt('module_done', f'  ✓  {mod_name} — passed (0 findings)', '✓')}\n\n"

        await asyncio.sleep(0.2)

    yield f"data: {divider()}\n\n"
    await asyncio.sleep(0.2)

    if dry_run:
        yield f"data: {evt('task_complete', f'Dry run complete — {total} modules would execute', '✓')}\n\n"
    else:
        yield f"data: {evt('task_complete', f'Playbook complete — {total} modules run  ·  {total_findings} findings created  ·  {errors} errors', '✓')}\n\n"
        await asyncio.sleep(0.1)
        yield f"data: {evt('info', f'Results saved. Run "show findings" to review.', '·')}\n\n"

    yield "data: {\"type\":\"done\"}\n\n"


async def gen_run_module(task_id, module, verbose=False):
    # Find module in flat list
    ALL_MODULES = {
        "system.kernel_params":     ("Kernel sysctl parameter checks",          True,  2, "net.ipv4.tcp_syncookies=0, kernel.dmesg_restrict=0", "HIGH"),
        "system.user_accounts":     ("User account security review",            True,  1, "account 'backup': password field empty", "CRITICAL"),
        "system.file_permissions":  ("File permission auditing",                True,  3, "/var/tmp/uploads mode=0777, /opt/legacy/app suid=1", "HIGH"),
        "network.open_ports":       ("Listening port enumeration",              False, 0, "All listening ports match expected service list", ""),
        "network.firewall_state":   ("Firewall configuration check",            True,  1, "iptables loaded but not saved to /etc/iptables/rules.v4", "MEDIUM"),
        "auth.ssh_config":          ("SSH daemon configuration audit",          True,  4, "PermitRootLogin=yes, Ciphers includes arcfour, no ClientAliveInterval, no Banner", "CRITICAL"),
        "auth.pam_config":          ("PAM authentication configuration",        False, 0, "All PAM modules within baseline", ""),
        "software.package_versions":("Outdated package detection",              True,  2, "openssl/1.1.1k (EOL 2023-09-11), bind9/9.11.5 (CVE-2023-2828)", "HIGH"),
        "software.service_config":  ("Running service configuration review",    False, 0, "No unexpected or misconfigured services", ""),
        "secrets.env_files":        ("Exposed credentials in env files",        True,  1, "/opt/app/.env — DB_PASSWORD exposed in plaintext", "HIGH"),
        "secrets.key_files":        ("SSH key and certificate exposure scan",   True,  1, "/home/deploy/.ssh/id_rsa — mode=0644 (should be 0600)", "HIGH"),
    }

    info = ALL_MODULES.get(module)
    if not info:
        yield f"data: {evt('error', f'Module not found in registry: {module}', '✗')}\n\n"
        yield "data: {\"type\":\"done\"}\n\n"
        return

    desc, has_findings, count, raw_detail, severity = info

    yield f"data: {evt('task_start', f'Running module: {module}', '▷')}\n\n"
    await asyncio.sleep(0.3)
    yield f"data: {evt('info', f'  {desc}', '·')}\n\n"
    await asyncio.sleep(0.8)

    if has_findings:
        etype = "finding_critical" if severity == "CRITICAL" else "finding"
        yield f"data: {evt(etype, f'  ⚑  {count} finding(s) created  [{severity}]', '⚑')}\n\n"
        if verbose:
            await asyncio.sleep(0.15)
            yield f"data: {evt('info', f'  Raw value: {raw_detail}', '·')}\n\n"
    else:
        yield f"data: {evt('module_done', f'  ✓  Passed — no findings', '✓')}\n\n"
        if verbose:
            await asyncio.sleep(0.1)
            yield f"data: {evt('info', f'  Detail: {raw_detail}', '·')}\n\n"

    await asyncio.sleep(0.2)
    yield f"data: {divider()}\n\n"
    yield f"data: {evt('module_done', f'Module complete: {module}', '✓')}\n\n"
    yield "data: {\"type\":\"done\"}\n\n"


async def gen_refresh_findings(task_id):
    yield f"data: {evt('task_start', 'Refreshing findings database...', '↻')}\n\n"
    await asyncio.sleep(0.4)
    yield f"data: {evt('info', '  Re-aggregating open findings...', '·')}\n\n"
    await asyncio.sleep(0.5)
    yield f"data: {evt('info', '  Re-scoring risk by severity weights...', '·')}\n\n"
    await asyncio.sleep(0.4)
    yield f"data: {evt('task_complete', 'Refresh complete — 38 open findings  ·  risk score: 6.4', '✓')}\n\n"
    yield f"data: {evt('info', 'Dashboard KPIs updated.', '·')}\n\n"
    yield "data: {\"type\":\"done\"}\n\n"


async def gen_generate_report(task_id, format_):
    fmt_upper = format_.upper()
    yield f"data: {evt('task_start', f'Generating {fmt_upper} report...', '⤓')}\n\n"
    await asyncio.sleep(0.3)
    yield f"data: {evt('info', '  Loading assessment data...', '·')}\n\n"
    await asyncio.sleep(0.5)
    yield f"data: {evt('info', '  Rendering findings section (38 findings)...', '·')}\n\n"
    await asyncio.sleep(0.6)
    yield f"data: {evt('info', '  Rendering remediation guidance...', '·')}\n\n"
    await asyncio.sleep(0.5)
    yield f"data: {evt('info', '  Applying report template...', '·')}\n\n"
    await asyncio.sleep(0.4)

    filenames = {
        "html":     "scope_report_20260320.html",
        "markdown": "scope_report_20260320.md",
        "json":     "scope_report_20260320.json",
    }
    fname = filenames.get(format_, f"scope_report.{format_}")

    yield f"data: {divider()}\n\n"
    yield f"data: {evt('report', f'Report generated: {fname}', '✓')}\n\n"
    yield f"data: {evt('info', '  Saved to: ./reports/', '·')}\n\n"
    yield "data: {\"type\":\"done\"}\n\n"


async def gen_suggest_checks(task_id):
    yield f"data: {evt('task_start', 'Analysing current findings for gaps...', '💡')}\n\n"
    await asyncio.sleep(0.5)
    yield f"data: {evt('info', '  Reading 38 open findings across 4 assessments...', '·')}\n\n"
    await asyncio.sleep(0.6)
    yield f"data: {evt('info', '  Checking for module coverage gaps...', '·')}\n\n"
    await asyncio.sleep(0.5)
    yield f"data: {divider()}\n\n"
    yield f"data: {evt('suggest', 'Suggested modules based on current findings:', '💡')}\n\n"
    await asyncio.sleep(0.1)
    suggestions = [
        ("auth.pam_config",          "Auth findings present — PAM not yet audited"),
        ("software.package_versions","Outdated packages flagged — full version scan recommended"),
        ("network.firewall_state",   "Port findings present — firewall persistence not verified"),
        ("secrets.env_files",        "No secret scan run on newest assessment"),
    ]
    for mod, reason in suggestions:
        await asyncio.sleep(0.2)
        yield f"data: {evt('suggest', f'  {mod.ljust(32)} {reason}', '→')}\n\n"

    yield f"data: {evt('info', '', '·')}\n\n"
    yield f"data: {evt('info', 'Run any suggestion with: run module <module.name>', '·')}\n\n"
    yield "data: {\"type\":\"done\"}\n\n"


# ─── Router endpoints ─────────────────────────────────────────────────────────

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
            yield f"data: {evt('error', f'Task {task_id} not found.', '✗')}\n\n"
            yield "data: {\"type\":\"done\"}\n\n"
        return StreamingResponse(not_found(), media_type="text/event-stream")

    task_type = body.get("task")

    if task_type == "run_playbook":
        gen = gen_run_playbook(
            task_id,
            body.get("playbook", "linux-baseline"),
            dry_run=body.get("dryRun", False),
            verbose=body.get("verbose", False),
        )
    elif task_type == "run_module":
        gen = gen_run_module(
            task_id,
            body.get("module", ""),
            verbose=body.get("verbose", False),
        )
    elif task_type == "refresh_findings":
        gen = gen_refresh_findings(task_id)
    elif task_type == "generate_report":
        gen = gen_generate_report(task_id, body.get("format", "html"))
    elif task_type == "suggest_checks":
        gen = gen_suggest_checks(task_id)
    else:
        async def unknown():
            yield f"data: {evt('error', f'Unknown task type: {task_type}', '✗')}\n\n"
            yield "data: {\"type\":\"done\"}\n\n"
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
    return [
        {"name": "system.kernel_params",     "desc": "Kernel sysctl parameter checks"},
        {"name": "system.user_accounts",     "desc": "User account security review"},
        {"name": "system.file_permissions",  "desc": "File permission auditing"},
        {"name": "network.open_ports",       "desc": "Listening port enumeration"},
        {"name": "network.firewall_state",   "desc": "Firewall configuration check"},
        {"name": "auth.ssh_config",          "desc": "SSH daemon configuration audit"},
        {"name": "auth.pam_config",          "desc": "PAM authentication configuration"},
        {"name": "software.package_versions","desc": "Outdated package detection"},
        {"name": "software.service_config",  "desc": "Running service configuration review"},
        {"name": "secrets.env_files",        "desc": "Exposed credentials in env files"},
        {"name": "secrets.key_files",        "desc": "SSH key and certificate exposure scan"},
    ]


@router.get("/playbooks")
async def list_playbooks():
    return [
        {"name": "linux-baseline",   "desc": "Full Linux CIS baseline audit (11 modules)"},
        {"name": "ssh-hardening",    "desc": "SSH configuration review (3 modules)"},
        {"name": "network-exposure", "desc": "Open ports and firewall review (2 modules)"},
        {"name": "user-accounts",    "desc": "User account and privilege audit (2 modules)"},
        {"name": "file-permissions", "desc": "World-writable and SUID/SGID scan (2 modules)"},
    ]
