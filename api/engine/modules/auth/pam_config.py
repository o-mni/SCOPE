"""
SCOPE Module — auth.pam_config

Checks PAM (Pluggable Authentication Modules) configuration for:
  - Password quality enforcement (pam_pwquality / pam_cracklib)
  - Account lockout after failed attempts (pam_faillock / pam_tally2)

Reads /etc/pam.d/ files directly — no external binaries required.
"""
from __future__ import annotations

import re
from pathlib import Path

from engine.base import BaseCheck, CheckFinding


_PAM_D = Path("/etc/pam.d")

# Distro-specific password PAM files (checked in order)
_PASSWORD_FILES = [
    "common-password",          # Debian / Ubuntu
    "system-auth",              # Arch / RHEL / CentOS / Fedora
    "password-auth",            # RHEL alternative
]

# Distro-specific auth PAM files (for lockout checks)
_AUTH_FILES = [
    "common-auth",              # Debian / Ubuntu
    "system-auth",              # Arch / RHEL
    "password-auth",            # RHEL alternative
]


def _read_pam_file(filename: str) -> str | None:
    path = _PAM_D / filename
    if not path.exists():
        return None
    try:
        return path.read_text(errors="replace")
    except PermissionError:
        return None


def _find_pam_file(candidates: list[str]) -> tuple[str | None, str | None]:
    """Return (filename, content) for the first matching PAM file."""
    for name in candidates:
        content = _read_pam_file(name)
        if content is not None:
            return name, content
    return None, None


class PamConfigCheck(BaseCheck):
    name = "auth.pam_config"
    description = "PAM password quality and account lockout configuration check"
    requires_root = False

    def is_available(self) -> bool:
        return _PAM_D.is_dir()

    def run(self) -> list[CheckFinding]:
        findings: list[CheckFinding] = []

        # ── 1. Password quality enforcement ───────────────────────────────────
        pw_file, pw_content = _find_pam_file(_PASSWORD_FILES)

        if pw_file is None:
            # PAM directory exists but no known password file found
            findings.append(CheckFinding(
                severity="info",
                title="PAM password configuration file not found",
                category="Authentication",
                description="Could not locate a standard PAM password configuration file "
                            "(common-password, system-auth, password-auth). "
                            "Password complexity policy could not be assessed.",
                evidence=f"Searched in /etc/pam.d/: {', '.join(_PASSWORD_FILES)}",
                remediation_simple="Verify PAM is correctly configured for your distribution.",
                remediation_technical="ls /etc/pam.d/  # inspect available PAM files",
            ))
        else:
            has_pwquality = bool(re.search(r"pam_pwquality\.so", pw_content, re.IGNORECASE))
            has_cracklib = bool(re.search(r"pam_cracklib\.so", pw_content, re.IGNORECASE))

            if not has_pwquality and not has_cracklib:
                findings.append(CheckFinding(
                    severity="medium",
                    title="No password complexity policy configured in PAM",
                    category="Authentication",
                    description="Neither pam_pwquality nor pam_cracklib is configured in the PAM "
                                "password stack. Without a complexity policy, users can set trivially "
                                "weak passwords that are easy to brute-force.",
                    evidence=f"/etc/pam.d/{pw_file} — no pam_pwquality or pam_cracklib found",
                    remediation_simple="Install and configure pam_pwquality to enforce password complexity.",
                    remediation_technical="# Arch Linux:\npacman -S libpwquality\n"
                                          "# Add to /etc/pam.d/system-auth (password section):\n"
                                          "password  required  pam_pwquality.so retry=3 minlen=14 "
                                          "ucredit=-1 lcredit=-1 dcredit=-1 ocredit=-1\n\n"
                                          "# Debian/Ubuntu:\napt install libpam-pwquality\n"
                                          "# /etc/pam.d/common-password already includes it after install",
                ))
            else:
                # Check if minlen is set to something reasonable
                minlen_match = re.search(r"minlen=(\d+)", pw_content)
                if minlen_match:
                    minlen = int(minlen_match.group(1))
                    if minlen < 12:
                        findings.append(CheckFinding(
                            severity="low",
                            title="PAM password minimum length is below recommended value",
                            category="Authentication",
                            description=f"pam_pwquality is configured with minlen={minlen}. "
                                        "NIST SP 800-63B recommends a minimum of 8 characters, "
                                        "but 12–16 is the practical recommendation for most environments.",
                            evidence=f"/etc/pam.d/{pw_file} — minlen={minlen} (recommended: >= 12)",
                            remediation_simple="Increase the minimum password length to at least 12 characters.",
                            remediation_technical=f"# In /etc/pam.d/{pw_file}, update pam_pwquality.so line:\n"
                                                  "password  required  pam_pwquality.so retry=3 minlen=14 ...",
                        ))

        # ── 2. Account lockout after failed attempts ───────────────────────────
        auth_file, auth_content = _find_pam_file(_AUTH_FILES)

        lockout_configured = False
        if auth_content:
            has_faillock = bool(re.search(r"pam_faillock\.so", auth_content, re.IGNORECASE))
            has_tally2 = bool(re.search(r"pam_tally2\.so", auth_content, re.IGNORECASE))
            lockout_configured = has_faillock or has_tally2

        # Also check /etc/security/faillock.conf if it exists
        faillock_conf = Path("/etc/security/faillock.conf")
        if not lockout_configured and faillock_conf.exists():
            try:
                fc = faillock_conf.read_text(errors="replace")
                if re.search(r"deny\s*=\s*\d+", fc):
                    lockout_configured = True
            except PermissionError:
                pass

        if not lockout_configured:
            findings.append(CheckFinding(
                severity="medium",
                title="No account lockout policy configured in PAM",
                category="Authentication",
                description="Neither pam_faillock nor pam_tally2 is configured. Without an account "
                            "lockout policy, there is no protection against brute-force attacks on "
                            "local authentication (console login, su, sudo).",
                evidence=f"/etc/pam.d/{auth_file or 'common-auth'} — no pam_faillock or pam_tally2 found",
                remediation_simple="Configure PAM account lockout to lock accounts after repeated failures.",
                remediation_technical="# Arch / RHEL (pam_faillock — modern):\n"
                                      "# /etc/security/faillock.conf:\n"
                                      "deny = 5\nunlock_time = 600\neven_deny_root\n\n"
                                      "# /etc/pam.d/system-auth (auth section, add before pam_unix):\n"
                                      "auth  required  pam_faillock.so preauth\n"
                                      "auth  required  pam_faillock.so authfail\n\n"
                                      "# Debian/Ubuntu:\napt install libpam-modules  # pam_faillock included\n"
                                      "# Add to /etc/pam.d/common-auth per above pattern",
            ))

        return findings
