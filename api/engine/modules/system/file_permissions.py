"""
SCOPE Module — system.file_permissions

Scans for dangerous file permission configurations:
  - World-writable files in critical system directories
  - Unexpected SUID/SGID binaries outside known-good locations
  - Insecure /tmp and /var/tmp permissions

Uses Python os.walk + os.stat — no external binaries required.
"""
from __future__ import annotations

import os
import stat
from pathlib import Path

from engine.base import BaseCheck, CheckFinding


# Directories to scan for world-writable files (non-recursive for /etc)
_WORLD_WRITABLE_SCAN_DIRS = ["/etc", "/bin", "/sbin", "/usr/bin", "/usr/sbin", "/usr/lib"]

# Directories to scan for SUID/SGID (limited depth to avoid huge scans)
_SUID_SCAN_DIRS = ["/bin", "/sbin", "/usr/bin", "/usr/sbin", "/usr/lib", "/opt"]

# Known-legitimate SUID binaries (Arch Linux defaults + common distros)
_SUID_WHITELIST = {
    "/usr/bin/su", "/usr/bin/sudo", "/usr/bin/passwd", "/usr/bin/chsh",
    "/usr/bin/chfn", "/usr/bin/newgrp", "/usr/bin/gpasswd", "/usr/bin/mount",
    "/usr/bin/umount", "/usr/bin/ping", "/usr/bin/pkexec", "/usr/bin/fusermount",
    "/usr/bin/fusermount3", "/usr/bin/ssh-agent", "/usr/bin/crontab",
    "/usr/bin/at", "/usr/bin/wall", "/usr/bin/write", "/usr/bin/chage",
    "/usr/bin/expiry", "/usr/bin/staprun", "/usr/bin/Xorg",
    "/usr/lib/dbus-1.0/dbus-daemon-launch-helper",
    "/usr/lib/openssh/ssh-keysign",
    "/usr/lib/polkit-1/polkit-agent-helper-1",
    "/usr/libexec/polkit-agent-helper-1",
    "/usr/lib/utempter/utempter",
    "/usr/sbin/pppd", "/usr/sbin/unix_chkpwd",
    "/bin/su", "/bin/ping", "/bin/mount", "/bin/umount",
    "/sbin/unix_chkpwd",
}

_MAX_SUID_FINDINGS = 20   # cap to avoid flooding
_MAX_WRITABLE_FINDINGS = 20


def _is_world_writable(mode: int) -> bool:
    return bool(mode & stat.S_IWOTH)


def _is_suid(mode: int) -> bool:
    return bool(mode & stat.S_ISUID)


def _is_sgid(mode: int) -> bool:
    return bool(mode & stat.S_ISGID)


def _octal(mode: int) -> str:
    return oct(stat.S_IMODE(mode))


class FilePermissionsCheck(BaseCheck):
    name = "system.file_permissions"
    description = "World-writable files and unexpected SUID/SGID binary scan"
    requires_root = False

    def run(self) -> list[CheckFinding]:
        findings: list[CheckFinding] = []

        # ── 1. World-writable files in critical system dirs ───────────────────
        writable: list[str] = []
        for base_dir in _WORLD_WRITABLE_SCAN_DIRS:
            if not os.path.isdir(base_dir):
                continue
            try:
                for dirpath, dirnames, filenames in os.walk(base_dir, followlinks=False):
                    # Don't recurse into /etc/alternatives (symlink farm)
                    dirnames[:] = [
                        d for d in dirnames
                        if not os.path.islink(os.path.join(dirpath, d))
                    ]
                    for fname in filenames:
                        fpath = os.path.join(dirpath, fname)
                        try:
                            st = os.lstat(fpath)
                            if _is_world_writable(st.st_mode) and not stat.S_ISLNK(st.st_mode):
                                writable.append(
                                    f"{fpath}  (mode: {_octal(st.st_mode)})"
                                )
                                if len(writable) >= _MAX_WRITABLE_FINDINGS:
                                    break
                        except (PermissionError, FileNotFoundError):
                            continue
                    if len(writable) >= _MAX_WRITABLE_FINDINGS:
                        break
            except PermissionError:
                continue

        if writable:
            findings.append(CheckFinding(
                severity="high",
                title="World-writable files found in critical system directories",
                category="File Permissions",
                description="Files in system directories (/etc, /bin, /sbin, /usr/bin, /usr/sbin) "
                            "are writable by any user. An unprivileged user could replace or modify "
                            "these files to escalate privileges or backdoor the system.",
                evidence="\n".join(writable[:_MAX_WRITABLE_FINDINGS]),
                remediation_simple="Remove world-write permission from system files.",
                remediation_technical="# Fix permissions on each affected file:\nchmod o-w <file>\n"
                                      "# To find all world-writable files in /etc:\n"
                                      "find /etc -type f -perm -o+w -ls",
            ))

        # ── 2. Unexpected SUID/SGID binaries ─────────────────────────────────
        unexpected_suid: list[str] = []
        for base_dir in _SUID_SCAN_DIRS:
            if not os.path.isdir(base_dir):
                continue
            try:
                for dirpath, _dirnames, filenames in os.walk(base_dir, followlinks=False):
                    for fname in filenames:
                        fpath = os.path.join(dirpath, fname)
                        try:
                            st = os.lstat(fpath)
                            if stat.S_ISREG(st.st_mode) and (
                                _is_suid(st.st_mode) or _is_sgid(st.st_mode)
                            ):
                                if fpath not in _SUID_WHITELIST:
                                    bits = []
                                    if _is_suid(st.st_mode):
                                        bits.append("SUID")
                                    if _is_sgid(st.st_mode):
                                        bits.append("SGID")
                                    unexpected_suid.append(
                                        f"{fpath}  ({'+'.join(bits)}, mode: {_octal(st.st_mode)})"
                                    )
                                    if len(unexpected_suid) >= _MAX_SUID_FINDINGS:
                                        break
                        except (PermissionError, FileNotFoundError):
                            continue
                    if len(unexpected_suid) >= _MAX_SUID_FINDINGS:
                        break
            except PermissionError:
                continue

        if unexpected_suid:
            findings.append(CheckFinding(
                severity="high",
                title="Unexpected SUID/SGID binaries detected",
                category="File Permissions",
                description="Binaries with SUID or SGID bits set outside the expected set were found. "
                            "SUID binaries run with the owner's privileges (often root). "
                            "An unexpected SUID binary may be a backdoor or misconfiguration "
                            "that enables privilege escalation.",
                evidence="\n".join(unexpected_suid),
                remediation_simple="Review each binary. Remove the SUID/SGID bit if it is not needed.",
                remediation_technical="# Review and remove SUID bit:\nchmod u-s <file>\n"
                                      "# Review and remove SGID bit:\nchmod g-s <file>\n"
                                      "# Find all SUID binaries on the system:\n"
                                      "find / -xdev -type f \\( -perm -4000 -o -perm -2000 \\) -ls 2>/dev/null",
            ))

        # ── 3. /tmp and /var/tmp sticky-bit check ─────────────────────────────
        for tmp_dir in ("/tmp", "/var/tmp"):
            if not os.path.isdir(tmp_dir):
                continue
            try:
                st = os.stat(tmp_dir)
                has_sticky = bool(st.st_mode & stat.S_ISVTX)
                is_world_writable = _is_world_writable(st.st_mode)
                if is_world_writable and not has_sticky:
                    findings.append(CheckFinding(
                        severity="medium",
                        title=f"{tmp_dir} is world-writable without sticky bit",
                        category="File Permissions",
                        description=f"{tmp_dir} is world-writable but the sticky bit is not set. "
                                    "Without the sticky bit, any user can delete or rename files "
                                    "owned by other users in this directory.",
                        evidence=f"{tmp_dir}  (mode: {_octal(st.st_mode)}, sticky bit missing)",
                        remediation_simple=f"Set the sticky bit on {tmp_dir}.",
                        remediation_technical=f"chmod +t {tmp_dir}",
                    ))
            except PermissionError:
                continue

        return findings
