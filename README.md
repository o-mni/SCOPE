# SCOPE

**Security Configuration Observation and Protection Engine**

> A local-first security audit engine for organizations that need to observe risk, harden configurations, and act on findings — without sending data anywhere.

[![CI](https://github.com/yourusername/scope/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/scope/actions)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Status: Early Development](https://img.shields.io/badge/status-early%20development-orange.svg)]()

---

## What is SCOPE?

SCOPE is an open-source, CLI-first internal security audit engine designed for small and medium businesses, sysadmins, and security-conscious developers who need structured visibility into their security posture without the overhead of enterprise tooling.

It runs entirely on your own infrastructure. It collects nothing, phones home to nothing, and performs no actions beyond reading system state and producing reports.

SCOPE audits, detects, and reports. It does not exploit, modify, or automate offensive actions.

---

## Core Features

| Feature | Description |
|---|---|
| **Configuration Auditing** | Examine OS, service, and application configurations for hardening gaps |
| **System Checks** | Review user accounts, file permissions, kernel parameters, and privilege exposure |
| **Network Visibility** | Identify unexpected listening ports, firewall state, and TLS configuration issues |
| **Secret Detection** | Surface hardcoded credentials, exposed key files, and insecure environment handling |
| **Software Hygiene** | Flag outdated packages and vulnerable service configurations |
| **Prioritized Findings** | All findings carry severity (Critical → Info) and actionable remediation guidance |
| **Flexible Reporting** | Output to terminal (Rich), Markdown, or JSON — Jinja2-templated reports |
| **Audit Profiles** | Configurable YAML profiles: default, strict, or minimal scan depth |

---

## Design Principles

**1. Defensive only.**
SCOPE exists to reduce risk, not to exploit it. No check in this project performs any action that would cause harm, exfiltrate data, or grant unauthorized access.

**2. Local-first.**
All processing happens on the machine being audited. No telemetry, no cloud dependency, no license servers.

**3. Authorized scope only.**
SCOPE is designed to be run by the person or team responsible for the system being audited. Running it against systems you do not own or have explicit written permission to audit is prohibited and out of scope for this project.

**4. Transparency.**
Every finding includes what was checked, what was found, why it matters, and what to do about it. No black-box scoring.

**5. Practical over perfect.**
SCOPE targets the most impactful hardening gaps for small and medium organizations — not theoretical edge cases.

---

## Ethical Use Statement

SCOPE is a defensive tool. It is designed and maintained with the explicit intent of helping organizations improve their security posture through visibility and remediation guidance.

**This tool must only be used:**
- On systems you own or administer
- On systems where you have explicit written authorization to perform a security audit
- In compliance with all applicable laws and regulations in your jurisdiction

Misuse of this tool against systems you do not have authorization to audit is a violation of this project's terms and may be illegal under computer fraud and abuse laws in your jurisdiction.

By using SCOPE, you agree to use it only for lawful, authorized, defensive purposes.

See [SECURITY.md](./SECURITY.md) for the full responsible use and disclosure policy.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                     CLI (Typer)                     │
│         scope audit / scope scan / scope report     │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│                   AuditRunner                       │
│   Loads config → discovers checks → executes them   │
└──────┬────────────────────────────────────┬──────────┘
       │                                    │
       ▼                                    ▼
┌──────────────┐                   ┌────────────────────┐
│   Checks     │                   │  FindingAggregator │
│  (pluggable) │ ──── Finding[] ──▶│  dedup, sort, rank │
│  BaseCheck   │                   └────────┬───────────┘
└──────────────┘                            │
  system/                                   ▼
  network/                       ┌────────────────────┐
  software/                      │     Reporters      │
  secrets/                       │  console / md / json│
                                 └────────────────────┘
```

Check modules are pluggable and platform-aware (Linux / Windows). Adding a new check requires one file and no wiring changes.

---

## Project Status

SCOPE is in **early development**. The architecture and module structure are being established. No production-ready checks have been implemented yet.

Current milestone: `v0.1.0` — repository skeleton, data models, CLI scaffold, and base check interface.

See the [roadmap](#roadmap) below for what comes next.

---

## Installation

> **Note:** SCOPE is not yet published to PyPI. Install from source during early development.

**Requirements:** Python 3.11+, Linux or Windows

```bash
# Clone the repository
git clone https://github.com/yourusername/scope.git
cd scope

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # Linux/macOS
.venv\Scripts\activate           # Windows

# Install in editable mode with all dependencies
pip install -e ".[dev]"
```

---

## Quick Start

```bash
# Show available commands
scope --help

# Run a full audit with the default profile
scope audit --config config/default.yaml

# Run a minimal audit and output JSON
scope audit --config config/minimal.yaml --format json --output report.json

# Generate a Markdown report from a previous audit result
scope report --input report.json --format markdown --output report.md
```

> Depending on the checks enabled and your OS, some checks may require elevated privileges (root on Linux, Administrator on Windows). SCOPE will tell you which checks were skipped due to insufficient permissions rather than failing silently.

---

## Audit Profiles

SCOPE ships with three built-in profiles in `config/`:

| Profile | File | Use Case |
|---|---|---|
| Default | `config/default.yaml` | Balanced — all checks, LOW severity threshold |
| Strict | `config/strict.yaml` | Thorough — all checks, INFO threshold, verbose |
| Minimal | `config/minimal.yaml` | Fast — system checks only, HIGH threshold |

You can copy and customize any profile for your environment.

---

## Roadmap

### v0.1.0 — Foundation *(in progress)*
- [ ] Repository skeleton and project structure
- [ ] CLI scaffold (`scope audit`, `scope scan`, `scope report`)
- [ ] Finding data model (severity, status, remediation)
- [ ] BaseCheck interface and check registry
- [ ] Config loader and Pydantic schema validation
- [ ] Console and Markdown reporters

### v0.2.0 — First Real Checks
- [ ] OS hardening checks (Linux: sysctl, kernel params)
- [ ] User account checks (UID 0, empty passwords, sudoers)
- [ ] File permission checks (world-writable, SUID/SGID)
- [ ] Open port detection
- [ ] Basic SSH configuration check

### v0.3.0 — Expanded Coverage
- [ ] Windows support for system and network checks
- [ ] Firewall state checks (iptables/nftables, Windows Firewall)
- [ ] Package version and CVE stub check
- [ ] Secret/credential file surface detection
- [ ] HTML report output

### v0.4.0 — Polish and Packaging
- [ ] PyPI publication
- [ ] Man page and shell completions
- [ ] Scheduled audit support
- [ ] Baseline comparison (diff between two audit results)

---

## Contributing

SCOPE is a solo-built open-source project, and contributions are welcome once the foundation is stable.

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request.

Key guidelines:
- All contributions must remain strictly defensive in nature
- New checks must include documentation and at least one unit test
- Follow the existing code style (enforced by Ruff and Mypy)

---

## License

MIT License. See [LICENSE](./LICENSE) for details.

This license does not grant permission to use this tool for unauthorized access to computer systems. See the [Ethical Use Statement](#ethical-use-statement) above.
