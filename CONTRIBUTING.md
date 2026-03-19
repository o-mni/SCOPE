# Contributing to SCOPE

Thank you for your interest in contributing to SCOPE. This document explains how the project works, how to set up a development environment, and what we expect from contributions.

SCOPE is a defensive security tool. All contributions — code, documentation, tests, checks — must align with the project's core principle: **authorized-scope, ethical, defensive security auditing only**.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ethical Boundaries](#ethical-boundaries)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [How to Add a New Check](#how-to-add-a-new-check)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Issues](#reporting-issues)

---

## Code of Conduct

By participating in this project, you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md). We expect respectful, professional communication from all contributors.

---

## Ethical Boundaries

SCOPE has hard boundaries that apply to all contributions. Pull requests that cross these lines will not be merged, regardless of technical quality.

**Contributions must NOT include:**
- Exploit code or proof-of-concept attack payloads
- Techniques designed to evade detection or hide tool activity
- Logic that modifies system state (SCOPE reads and reports; it does not write or change)
- Network scanning or probing of systems beyond the local host
- Credential brute-forcing, fuzzing, or active attack automation
- Any feature designed to facilitate unauthorized access

If you are unsure whether a contribution falls within these boundaries, open a GitHub Issue and discuss it before writing code.

---

## Development Setup

**Requirements:** Python 3.11+, Git

```bash
# 1. Fork and clone the repository
git clone https://github.com/yourusername/scope.git
cd scope

# 2. Create a virtual environment
python -m venv .venv
source .venv/bin/activate       # Linux/macOS
.venv\Scripts\activate          # Windows

# 3. Install in editable mode with dev dependencies
pip install -e ".[dev]"

# 4. Install pre-commit hooks
pre-commit install
```

Verify your setup:

```bash
scope --help        # CLI should respond
pytest              # All tests should pass
ruff check .        # No lint errors
mypy scope/         # No type errors
```

---

## Project Structure

```
scope/
├── cli/            # Typer CLI entrypoint and subcommands
├── engine/         # Audit orchestration (runner, scheduler)
├── checks/         # Pluggable audit check modules
│   ├── base.py     # BaseCheck ABC — all checks inherit this
│   ├── system/     # OS-level checks
│   ├── network/    # Network and firewall checks
│   ├── software/   # Package and service config checks
│   └── secrets/    # Credential and key exposure checks
├── findings/       # Finding data model and aggregation
├── reporters/      # Output formatters (console, markdown, JSON)
├── config/         # Config loading and Pydantic schema
└── utils/          # Platform detection, privilege checks, logging
```

All check modules live under `scope/checks/`. This is where most contributions will go.

---

## How to Add a New Check

Adding a check is the most common type of contribution. The process is straightforward.

### Step 1 — Choose the right domain

| Domain | Location | Examples |
|---|---|---|
| System | `scope/checks/system/` | kernel params, user accounts, file permissions |
| Network | `scope/checks/network/` | open ports, firewall, TLS |
| Software | `scope/checks/software/` | package versions, service configs |
| Secrets | `scope/checks/secrets/` | exposed keys, hardcoded credentials |

### Step 2 — Create the check file

Name your file `<topic>.py` in snake_case. Example: `scope/checks/system/login_banner.py`

### Step 3 — Implement BaseCheck

```python
from scope.checks.base import BaseCheck
from scope.findings.models import Finding, Severity


class LoginBannerCheck(BaseCheck):
    name = "system.login_banner"
    description = "Verifies that a legal login banner is configured."
    platforms = ["linux", "windows"]
    severity = Severity.LOW

    def run(self) -> list[Finding]:
        findings: list[Finding] = []
        # Read system state — never modify it
        # If a problem is found, append a Finding with:
        #   - a clear title
        #   - what was observed
        #   - why it matters
        #   - what to do about it
        return findings
```

### Step 4 — Register the check

Add your check to `scope/checks/__init__.py`:

```python
from scope.checks.system.login_banner import LoginBannerCheck

REGISTRY["system.login_banner"] = LoginBannerCheck
```

### Step 5 — Add to the default config

Enable your check in `config/default.yaml` under `enabled_checks`.

### Step 6 — Document it

Add a row for your check in `docs/checks_reference.md`.

### Step 7 — Write tests

Add at least one unit test in `tests/unit/checks/`. Test that:
- `is_supported()` returns the correct value for the target platforms
- `run()` returns a `list[Finding]`
- A known-bad fixture triggers the expected finding

---

## Coding Standards

This project uses automated tooling to enforce consistency. Pre-commit hooks run these automatically before each commit.

| Tool | Purpose |
|---|---|
| [Ruff](https://docs.astral.sh/ruff/) | Linting and formatting (replaces flake8, isort, black) |
| [Mypy](https://mypy.readthedocs.io/) | Static type checking |
| pre-commit | Trailing whitespace, end-of-file newline |

**Style rules:**
- All public functions and classes must have docstrings
- All function signatures must have type hints
- Use `pathlib.Path` instead of string paths
- Prefer `dataclasses` or Pydantic models over raw dicts for structured data
- Checks must be read-only — never write, delete, or execute system commands that alter state
- Use `scope.utils.platform` for OS detection rather than `sys.platform` directly

Run checks manually:

```bash
ruff check .
ruff format .
mypy scope/
pytest
```

---

## Testing Requirements

All new checks must include tests. Tests live in `tests/unit/checks/` or `tests/integration/`.

- Use `pytest` and `pytest fixtures` from `tests/conftest.py`
- Use fixture files in `tests/fixtures/` for sample config/data files
- Mock OS calls where necessary — do not require a specific OS to run unit tests
- Integration tests (marked `@pytest.mark.integration`) may require elevated privileges; document this

Run the full test suite:

```bash
pytest                          # all tests
pytest tests/unit/              # unit only
pytest -m integration           # integration only
```

---

## Submitting a Pull Request

1. **Open an issue first** for anything beyond a trivial fix. Discuss the approach before writing code.
2. **Branch from `main`** with a descriptive name: `feat/login-banner-check`, `fix/config-loader-path`, `docs/checks-reference`.
3. **Keep PRs focused.** One logical change per PR. Do not bundle unrelated fixes.
4. **Fill out the PR template.** Describe what the change does, why it is needed, and how to test it.
5. **Ensure CI passes** before requesting review. PRs with failing lint or tests will not be reviewed until they are green.
6. **No offensive content.** Any PR that introduces exploitation logic, stealth techniques, or offensive automation will be closed without review.

---

## Reporting Issues

Use GitHub Issues for:
- Bug reports (use the bug report template)
- Feature requests (use the feature request template)
- Questions about check behavior or findings

For security vulnerabilities in SCOPE itself, see [SECURITY.md](./SECURITY.md).

---

Thank you for helping make SCOPE better and safer.
