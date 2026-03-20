# SCOPE

**Security Configuration Observation and Protection Engine**

> A local-first Linux security assessment platform for authorized defensive use.
> Observe risk, audit configurations, run modular checks, manage findings, and generate reports — entirely on your own infrastructure.

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![Platform: Linux](https://img.shields.io/badge/platform-Linux-informational.svg)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Status: Early Development](https://img.shields.io/badge/status-early%20development-orange.svg)]()

---

## What is SCOPE?

SCOPE is an open-source local security assessment platform built for Linux.
It runs entirely on the machine being audited. It collects nothing, phones home to nothing,
and performs no actions beyond reading system state and producing reports.

SCOPE **audits, detects, and reports**. It does not exploit, modify, or automate offensive actions.

**Platform:** Linux only. Developed on Arch Linux. Tested on systemd-based distributions.

---

## Core Features

| Feature | Description |
|---|---|
| **Local Web GUI** | Browser-based dashboard at `localhost:5173` |
| **Modular Audit Engine** | 11 real Linux check modules across 5 categories |
| **Playbook Workflows** | Run curated module groups (CIS baseline, SSH hardening, etc.) |
| **Live SSE Console** | Real-time streaming output as each module executes |
| **Findings Management** | Severity-ranked findings with full remediation guidance |
| **Report Generation** | HTML, Markdown, and JSON reports written to `reports/` |
| **Assessment Tracking** | Manage multiple assessments with run history |
| **No Cloud Dependency** | Everything runs and stays local |

---

## Audit Modules

| Module | What it checks |
|---|---|
| `system.kernel_params` | Sysctl hardening parameters via `/proc/sys/` |
| `system.user_accounts` | UID 0 accounts, empty passwords, sudoers NOPASSWD |
| `system.file_permissions` | World-writable files, unexpected SUID/SGID binaries |
| `network.open_ports` | Listening ports via `ss -tlnp`, dangerous service detection |
| `network.firewall_state` | ufw / iptables / nftables active state and persistence |
| `auth.ssh_config` | `/etc/ssh/sshd_config` — root login, ciphers, idle timeout, etc. |
| `auth.pam_config` | PAM password complexity and account lockout configuration |
| `software.package_versions` | Stale package DB, EOL package detection (pacman/apt/rpm) |
| `software.service_config` | Dangerous running services (telnet, rsh, vsftpd, etc.) |
| `secrets.env_files` | Hardcoded credentials in config/env files |
| `secrets.key_files` | SSH private key and `authorized_keys` permission audit |

---

## Playbooks

| Playbook | Modules |
|---|---|
| `linux-baseline` | All 11 modules — full CIS-aligned baseline |
| `ssh-hardening` | `auth.ssh_config`, `auth.pam_config`, `secrets.key_files` |
| `network-exposure` | `network.open_ports`, `network.firewall_state` |
| `user-accounts` | `system.user_accounts`, `auth.pam_config` |
| `file-permissions` | `system.file_permissions`, `secrets.key_files` |

---

## Architecture

```
Browser (React + Vite :5173)
    │  REST + Server-Sent Events
    ▼
FastAPI (:8000)
    │  POST /api/tasks  → task_id
    │  GET  /api/tasks/{id}/stream → SSE events
    ▼
AuditRunner (engine/runner.py)
    │  Loads module list from REGISTRY
    │  Checks EUID, tool availability
    │  Executes each BaseCheck.run() in thread pool
    │  Yields SSE events per finding
    ▼
Audit Modules (engine/modules/**)
    │  Read /proc/sys/, /etc/, /var/
    │  subprocess.run(["ss", ...])  ← no shell=True
    │  Return list[CheckFinding]
    ▼
SQLite (api/scope.db)
    │  Findings, Runs, Assessments, Reports, Activity
    ▼
React pages read via REST for display
```

---

## Design Principles

**1. Defensive only.**
No check causes harm, exfiltrates data, or grants unauthorised access.

**2. Local-first.**
All processing happens on the machine being audited. No telemetry, no cloud dependency.

**3. Linux-native.**
SCOPE assumes Linux — `/proc/`, `/etc/`, `systemd`, `ss`, standard file permissions.
It does not attempt cross-platform compatibility.

**4. Authorised scope only.**
SCOPE is designed to be run by the person or team responsible for the system being audited.

**5. Safe subprocess usage.**
No `shell=True`. All external commands are called with list arguments and a timeout.
Tools are checked for availability before use. Root-required checks skip gracefully when not root.

**6. Transparency.**
Every finding includes what was checked, what was found, why it matters, and what to do about it.

---

## Ethical Use Statement

SCOPE is a defensive tool maintained with the explicit intent of helping operators
improve their security posture through visibility and remediation guidance.

**This tool must only be used:**
- On systems you own or administer
- On systems where you have explicit written authorisation to perform a security audit
- In compliance with all applicable laws and regulations in your jurisdiction

Misuse of this tool against systems you do not have authorisation to audit may be
illegal under computer fraud and abuse laws in your jurisdiction.

By using SCOPE, you agree to use it only for lawful, authorised, defensive purposes.

---

## Installation

**Requirements:** Python 3.11+, Node.js 18+, Linux (systemd-based)

```bash
git clone https://github.com/yourusername/scope.git
cd scope

# Start both API and UI
chmod +x start.sh
./start.sh
```

Open `http://localhost:5173` in your browser.

**Optional — run as root for full coverage:**
```bash
sudo ./start.sh
```
Some modules (e.g. `/etc/shadow` checks) require root. Non-root modules always run regardless.

---

## Project Structure

```
SCOPE/
├── api/
│   ├── main.py              # FastAPI app
│   ├── database.py          # SQLAlchemy + SQLite
│   ├── models.py            # ORM models
│   ├── routers/
│   │   ├── assessments.py
│   │   ├── findings.py
│   │   ├── reports.py
│   │   └── tasks.py         # Task dispatch + SSE streaming
│   └── engine/              # Real Linux audit engine
│       ├── base.py          # BaseCheck ABC + CheckFinding
│       ├── registry.py      # Module registry
│       ├── runner.py        # AuditRunner (async SSE generator)
│       └── modules/
│           ├── system/      # kernel_params, user_accounts, file_permissions
│           ├── network/     # open_ports, firewall_state
│           ├── auth/        # ssh_config, pam_config
│           ├── software/    # package_versions, service_config
│           └── secrets/     # env_files, key_files
├── ui/                      # React + Vite frontend
├── reports/                 # Generated report output (local)
└── start.sh                 # Linux launch script
```

---

## Roadmap

### v1.1 — Real Engine (current)
- [x] Real Linux audit engine replacing all simulated output
- [x] 11 production check modules across 5 categories
- [x] Live SSE streaming from real module execution
- [x] Report generation (HTML, Markdown, JSON) to `reports/`
- [x] Findings persisted to DB after each run
- [x] Linux-only codebase — all Windows artifacts removed

### v1.2 — Depth and Polish
- [ ] Root-mode full coverage (shadow, iptables, etc.)
- [ ] Additional modules: cron jobs, kernel modules, auditd state
- [ ] Scheduled assessments (systemd timer integration)
- [ ] Baseline comparison (diff between two run results)

### v1.3 — Hardening Profiles
- [ ] YAML-configurable scan profiles (minimal, standard, strict)
- [ ] CIS Benchmark mapping per finding
- [ ] Risk score calculation from real finding data

---

## Contributing

SCOPE is a solo-built open-source project. Contributions are welcome.

Key guidelines:
- All contributions must remain strictly defensive in nature
- Linux-only — no cross-platform abstractions, no Windows compatibility layers
- New checks must subclass `BaseCheck`, declare `requires_root`, and implement `is_available()`
- No `shell=True` in any subprocess call

---

## License

MIT License. See [LICENSE](./LICENSE) for details.

This licence does not grant permission to use this tool for unauthorised access to computer systems.
