"""
SCOPE Module — system.user_accounts

Audits local user accounts using /etc/passwd, /etc/shadow (root only),
and sudoers configuration.

No external binaries required for most checks.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

from engine.base import BaseCheck, CheckFinding


# Shells that indicate a login-capable account
_LOGIN_SHELLS = {
    "/bin/sh", "/bin/bash", "/bin/zsh", "/bin/fish",
    "/bin/dash", "/bin/ksh", "/bin/tcsh", "/bin/csh",
    "/usr/bin/bash", "/usr/bin/zsh", "/usr/bin/fish",
    "/usr/bin/ksh",
}

# Accounts that legitimately hold UID 0 alongside root
_EXPECTED_UID0 = {"root"}

# Service accounts that should NOT have login shells
_SERVICE_ACCOUNT_PREFIXES = (
    "daemon", "bin", "sys", "sync", "games", "man", "lp", "mail",
    "news", "uucp", "proxy", "www-data", "backup", "list", "irc",
    "gnats", "nobody", "systemd", "messagebus", "syslog", "ntp",
    "postfix", "mysql", "postgres", "redis", "mongodb", "elasticsearch",
    "nginx", "apache", "http", "git", "ftp", "ftpuser",
)


def _parse_passwd() -> list[dict]:
    """Parse /etc/passwd into a list of account dicts."""
    accounts = []
    try:
        lines = Path("/etc/passwd").read_text(errors="replace").splitlines()
    except (FileNotFoundError, PermissionError):
        return accounts
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(":")
        if len(parts) < 7:
            continue
        accounts.append({
            "username": parts[0],
            "password_field": parts[1],
            "uid": parts[2],
            "gid": parts[3],
            "home": parts[5],
            "shell": parts[6],
        })
    return accounts


def _parse_shadow() -> dict[str, str]:
    """Parse /etc/shadow → {username: password_hash}. Empty dict if unreadable."""
    result = {}
    try:
        lines = Path("/etc/shadow").read_text(errors="replace").splitlines()
    except (FileNotFoundError, PermissionError):
        return result
    for line in lines:
        parts = line.strip().split(":")
        if len(parts) >= 2:
            result[parts[0]] = parts[1]
    return result


def _parse_sudoers_nopasswd() -> list[str]:
    """
    Return a list of evidence strings for NOPASSWD entries found in
    /etc/sudoers and /etc/sudoers.d/*.
    """
    evidence = []
    nopasswd_re = re.compile(r"NOPASSWD", re.IGNORECASE)

    files: list[Path] = []
    sudoers = Path("/etc/sudoers")
    if sudoers.exists():
        files.append(sudoers)
    sudoers_d = Path("/etc/sudoers.d")
    if sudoers_d.is_dir():
        files.extend(f for f in sudoers_d.iterdir() if f.is_file())

    for path in files:
        try:
            for lineno, line in enumerate(
                path.read_text(errors="replace").splitlines(), 1
            ):
                stripped = line.strip()
                if stripped.startswith("#") or not stripped:
                    continue
                if nopasswd_re.search(stripped):
                    evidence.append(f"{path}:{lineno}  {stripped}")
        except PermissionError:
            pass

    return evidence


class UserAccountsCheck(BaseCheck):
    name = "system.user_accounts"
    description = "User account and privilege review"
    requires_root = False   # shadow check is skipped gracefully when non-root

    def run(self) -> list[CheckFinding]:
        findings: list[CheckFinding] = []
        accounts = _parse_passwd()

        # ── 1. Multiple UID 0 accounts ────────────────────────────────────────
        uid0_extra = [
            a["username"] for a in accounts
            if a["uid"] == "0" and a["username"] not in _EXPECTED_UID0
        ]
        if uid0_extra:
            findings.append(CheckFinding(
                severity="critical",
                title="Non-root account with UID 0 detected",
                category="Accounts",
                description="One or more accounts share UID 0 with root. Any of these accounts "
                            "has full superuser privileges regardless of account name.",
                evidence="\n".join(
                    f"/etc/passwd — {u}: UID=0" for u in uid0_extra
                ),
                remediation_simple="Remove or reassign UID 0 from all non-root accounts.",
                remediation_technical="\n".join(
                    f"# Reassign UID for {u}:\nusermod -u <new_uid> {u}" for u in uid0_extra
                ),
            ))

        # ── 2. Service accounts with login shells ─────────────────────────────
        service_with_shell = [
            a for a in accounts
            if a["shell"] in _LOGIN_SHELLS
            and any(a["username"].startswith(p) for p in _SERVICE_ACCOUNT_PREFIXES)
        ]
        if service_with_shell:
            findings.append(CheckFinding(
                severity="medium",
                title="Service accounts have interactive login shells",
                category="Accounts",
                description="Service or system accounts have shells set to interactive interpreters. "
                            "If these accounts are compromised, an attacker gains a usable shell.",
                evidence="\n".join(
                    f"{a['username']}: shell={a['shell']}" for a in service_with_shell
                ),
                remediation_simple="Set service account shells to /sbin/nologin or /bin/false.",
                remediation_technical="\n".join(
                    f"usermod -s /usr/sbin/nologin {a['username']}" for a in service_with_shell
                ),
            ))

        # ── 3. Accounts with empty password in /etc/passwd (rare, legacy) ─────
        passwd_field_empty = [
            a for a in accounts if a["password_field"] == ""
        ]
        if passwd_field_empty:
            findings.append(CheckFinding(
                severity="critical",
                title="Account with empty password field in /etc/passwd",
                category="Accounts",
                description="One or more accounts have an empty password field in /etc/passwd. "
                            "On systems not using shadow passwords this means no password is required.",
                evidence="\n".join(
                    f"/etc/passwd — {a['username']}: password field is empty"
                    for a in passwd_field_empty
                ),
                remediation_simple="Set a password or lock the account.",
                remediation_technical="\n".join(
                    f"# Lock account or set password:\npasswd -l {a['username']}"
                    for a in passwd_field_empty
                ),
            ))

        # ── 4. Empty password hash in /etc/shadow (requires root) ─────────────
        shadow = _parse_shadow()
        if shadow:
            empty_shadow = [
                username for username, phash in shadow.items()
                if phash == "" or phash == "!"[0:0]  # empty string = no password
            ]
            # Filter to only login-shell accounts
            login_usernames = {a["username"] for a in accounts if a["shell"] in _LOGIN_SHELLS}
            empty_shadow_login = [u for u in empty_shadow if u in login_usernames]
            if empty_shadow_login:
                findings.append(CheckFinding(
                    severity="critical",
                    title="Login account with no password set",
                    category="Accounts",
                    description="One or more accounts with login shells have an empty password hash "
                                "in /etc/shadow. These accounts can be accessed without a password.",
                    evidence="\n".join(
                        f"/etc/shadow — {u}: no password set" for u in empty_shadow_login
                    ),
                    remediation_simple="Set a password or lock the account immediately.",
                    remediation_technical="\n".join(
                        f"passwd {u}  # set password\n# or: passwd -l {u}  # lock account"
                        for u in empty_shadow_login
                    ),
                ))

        # ── 5. Sudoers NOPASSWD entries ───────────────────────────────────────
        nopasswd_evidence = _parse_sudoers_nopasswd()
        if nopasswd_evidence:
            findings.append(CheckFinding(
                severity="high",
                title="Sudoers NOPASSWD entries detected",
                category="Privileges",
                description="One or more sudoers rules allow executing commands as root without "
                            "a password. If these accounts are compromised, privilege escalation "
                            "requires no additional credentials.",
                evidence="\n".join(nopasswd_evidence),
                remediation_simple="Remove NOPASSWD from sudoers rules unless strictly necessary. "
                                   "Require password confirmation for all sudo usage.",
                remediation_technical="visudo  # edit /etc/sudoers\n"
                                      "# Remove NOPASSWD: from any rule that does not explicitly require it\n"
                                      "# Example safe rule: deploy ALL=(ALL) /usr/bin/systemctl restart myapp",
            ))

        return findings
