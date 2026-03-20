"""
SCOPE Module — secrets.key_files

Audits SSH private key and authorized_keys file permissions.
Flags private keys with insecure permissions that allow other users to read them.

No external binaries required — uses os.stat() directly.
"""
from __future__ import annotations

import os
import re
import stat
from pathlib import Path

from engine.base import BaseCheck, CheckFinding


# Patterns that identify SSH private key files
_PRIVATE_KEY_NAMES = re.compile(
    r"^(id_rsa|id_dsa|id_ecdsa|id_ed25519|id_ecdsa_sk|id_ed25519_sk"
    r"|identity|id_xmss|.*_rsa|.*_ecdsa|.*_ed25519)$",
    re.IGNORECASE,
)

# Directories to search for .ssh directories
_HOME_ROOTS = ["/home", "/root"]

# System-level key locations
_SYSTEM_KEY_LOCATIONS = [
    "/etc/ssh",
    "/etc/ssl/private",
]

# Maximum permission bits for private keys (owner read-write only)
_MAX_PRIVATE_KEY_MODE = 0o600
_MAX_DOT_SSH_MODE = 0o700
_MAX_AUTHORIZED_KEYS_MODE = 0o600


def _octal(mode: int) -> str:
    return oct(stat.S_IMODE(mode))


def _find_ssh_dirs() -> list[Path]:
    """Find all .ssh directories under home roots."""
    dirs = []
    for root in _HOME_ROOTS:
        root_path = Path(root)
        if not root_path.is_dir():
            continue
        try:
            # /root/.ssh
            if root == "/root":
                ssh_dir = root_path / ".ssh"
                if ssh_dir.is_dir():
                    dirs.append(ssh_dir)
            else:
                # /home/*/.ssh
                for user_dir in root_path.iterdir():
                    if not user_dir.is_dir():
                        continue
                    ssh_dir = user_dir / ".ssh"
                    if ssh_dir.is_dir():
                        dirs.append(ssh_dir)
        except PermissionError:
            continue
    return dirs


class KeyFilesCheck(BaseCheck):
    name = "secrets.key_files"
    description = "SSH private key and authorized_keys permission audit"
    requires_root = False

    def run(self) -> list[CheckFinding]:
        findings: list[CheckFinding] = []

        ssh_dirs = _find_ssh_dirs()
        bad_key_perms: list[str] = []
        bad_ssh_dir_perms: list[str] = []
        bad_auth_keys_perms: list[str] = []
        keys_in_unexpected_locs: list[str] = []

        for ssh_dir in ssh_dirs:
            # ── .ssh directory permissions ─────────────────────────────────────
            try:
                dir_stat = os.stat(ssh_dir)
                dir_mode = stat.S_IMODE(dir_stat.st_mode)
                if dir_mode > _MAX_DOT_SSH_MODE:
                    bad_ssh_dir_perms.append(
                        f"{ssh_dir}  (mode: {_octal(dir_mode)}, expected: 0700)"
                    )
            except (PermissionError, FileNotFoundError):
                pass

            # ── Files inside .ssh ──────────────────────────────────────────────
            try:
                for entry in ssh_dir.iterdir():
                    if not entry.is_file():
                        continue
                    try:
                        fstat = os.stat(entry)
                        fmode = stat.S_IMODE(fstat.st_mode)
                    except (PermissionError, FileNotFoundError):
                        continue

                    name = entry.name.lower()

                    # Private keys
                    if _PRIVATE_KEY_NAMES.match(entry.name):
                        if fmode > _MAX_PRIVATE_KEY_MODE:
                            bad_key_perms.append(
                                f"{entry}  (mode: {_octal(fmode)}, expected: 0600)"
                            )

                    # authorized_keys
                    if name in ("authorized_keys", "authorized_keys2"):
                        if fmode > _MAX_AUTHORIZED_KEYS_MODE:
                            bad_auth_keys_perms.append(
                                f"{entry}  (mode: {_octal(fmode)}, expected: 0600)"
                            )
            except PermissionError:
                continue

        # ── System private key permissions ─────────────────────────────────────
        for sys_loc in _SYSTEM_KEY_LOCATIONS:
            sys_path = Path(sys_loc)
            if not sys_path.is_dir():
                continue
            try:
                for entry in sys_path.iterdir():
                    if not entry.is_file():
                        continue
                    if _PRIVATE_KEY_NAMES.match(entry.name) or entry.suffix == ".key":
                        try:
                            fstat = os.stat(entry)
                            fmode = stat.S_IMODE(fstat.st_mode)
                            # System keys should be readable only by root (0600 or 0640)
                            if fmode & (stat.S_IRWXG | stat.S_IRWXO):
                                bad_key_perms.append(
                                    f"{entry}  (mode: {_octal(fmode)}, expected: 0600)"
                                )
                        except (PermissionError, FileNotFoundError):
                            continue
            except PermissionError:
                continue

        # ── Emit findings ──────────────────────────────────────────────────────
        if bad_key_perms:
            findings.append(CheckFinding(
                severity="high",
                title="SSH private keys with insecure file permissions",
                category="Secrets",
                description="One or more SSH private key files have permissions broader than 0600. "
                            "Other local users or processes may be able to read these keys and "
                            "use them to authenticate as the key owner on remote systems.",
                evidence="\n".join(bad_key_perms),
                remediation_simple="Restrict private key permissions to owner-read-write only (0600).",
                remediation_technical="\n".join(
                    f"chmod 600 {line.split()[0]}" for line in bad_key_perms
                ),
            ))

        if bad_ssh_dir_perms:
            findings.append(CheckFinding(
                severity="medium",
                title=".ssh directory has insecure permissions",
                category="Secrets",
                description="One or more .ssh directories have permissions broader than 0700. "
                            "Other local users can list or access files within the directory, "
                            "including private keys and authorized_keys.",
                evidence="\n".join(bad_ssh_dir_perms),
                remediation_simple="Restrict .ssh directory permissions to 0700.",
                remediation_technical="\n".join(
                    f"chmod 700 {line.split()[0]}" for line in bad_ssh_dir_perms
                ),
            ))

        if bad_auth_keys_perms:
            findings.append(CheckFinding(
                severity="medium",
                title="authorized_keys file has insecure permissions",
                category="Secrets",
                description="authorized_keys files with overly broad permissions allow other local "
                            "users to read or potentially modify the file, enabling unauthorized "
                            "SSH public key injection.",
                evidence="\n".join(bad_auth_keys_perms),
                remediation_simple="Restrict authorized_keys to owner-read-write only (0600).",
                remediation_technical="\n".join(
                    f"chmod 600 {line.split()[0]}" for line in bad_auth_keys_perms
                ),
            ))

        return findings
