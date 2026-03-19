# Security Policy

## Scope and Intended Use

SCOPE is a **defensive security auditing tool**. It is designed to help system administrators, developers, and security teams understand the security posture of systems they own and operate. It reads system state and produces findings. It does not exploit, modify, or propagate.

### Authorized Use

You may only run SCOPE against:
- Systems you own outright
- Systems where you have **explicit written authorization** from the system owner to perform a security audit

Running SCOPE against systems you do not own or have written authorization to audit is a violation of this project's intended use and may constitute unauthorized computer access under applicable law, including but not limited to the Computer Fraud and Abuse Act (CFAA, USA), the Computer Misuse Act (CMA, UK), and equivalent legislation in other jurisdictions.

The maintainers of this project accept no liability for misuse.

---

## Reporting a Vulnerability in SCOPE

If you have discovered a security vulnerability **in SCOPE itself** — for example, a path traversal in report generation, privilege escalation in a check, or unsafe deserialization in config loading — please report it responsibly.

### Do not open a public GitHub Issue for security vulnerabilities.

Public disclosure before a fix is available puts users of this tool at risk.

### How to Report

**Preferred method:** Open a [GitHub Security Advisory](https://github.com/yourusername/scope/security/advisories/new) using GitHub's private vulnerability reporting feature. This keeps the report confidential until a fix is published.

**Alternatively:** Email the maintainer directly. Contact information is available in the repository's `pyproject.toml` or GitHub profile.

### What to Include

A useful vulnerability report includes:

- A clear description of the vulnerability and its impact
- Steps to reproduce the issue
- The version of SCOPE affected
- Your operating system and Python version
- Suggested remediation if you have one (optional but appreciated)

### What to Expect

- **Acknowledgement** within 5 business days
- **Assessment** of severity and exploitability within 10 business days
- **Fix or mitigation** timeline communicated as soon as it is known
- **Credit** in the changelog and release notes if you want it (opt-in)

This is a solo-maintained open-source project. Response times reflect that reality. Patience is appreciated.

---

## Vulnerability Disclosure Policy

Once a fix is available and released:

1. A GitHub Security Advisory will be published with full details
2. The CHANGELOG will reference the advisory
3. If the vulnerability is serious enough to warrant a CVE, one will be requested

We ask that reporters observe a **90-day coordinated disclosure window** from the time the maintainer acknowledges the report. If a fix cannot be produced within 90 days, we will communicate that openly and work with you on next steps.

---

## Security Design Principles

The following principles govern SCOPE's design and help bound the attack surface:

**Read-only by design.**
SCOPE reads system state to produce findings. No check in this project is permitted to write files, execute commands that alter system state, or send network traffic beyond what is required to test a local service configuration.

**No remote communication.**
SCOPE does not connect to external services, does not upload findings, and has no telemetry. All processing is local.

**Minimal privilege where possible.**
SCOPE is designed to degrade gracefully when run without elevated privileges. Checks that require root or Administrator access will report as skipped, not fail silently or escalate.

**No exploitation logic.**
SCOPE does not include or ship payloads, shellcode, exploit modules, or any technique designed to gain unauthorized access. If a pull request introduces such logic, it will be rejected.

**Dependency hygiene.**
Dependencies are pinned in `pyproject.toml` and reviewed for known vulnerabilities before each release. If you discover a vulnerable dependency in SCOPE, please report it using the process above.

---

## Supported Versions

| Version | Supported |
|---|---|
| `main` branch | Yes — active development |
| Released versions | Only the most recent release receives security patches |

SCOPE is in early development. No stable release has been published yet. Once `v1.0.0` is released, a formal support window will be defined.

---

## Out of Scope

The following are **not** security vulnerabilities in SCOPE and do not qualify for coordinated disclosure:

- Findings that SCOPE produces about the system it is run on — those are intentional outputs, not bugs
- Issues that require physical access to the audited machine
- Social engineering or phishing attacks against SCOPE users
- Vulnerabilities in optional third-party integrations not maintained by this project
- Issues that require SCOPE to be run by a malicious user against their own system

---

Thank you for helping keep SCOPE and its users safe.
