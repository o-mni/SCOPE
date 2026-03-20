"""
SCOPE Module — secrets.env_files

Scans common filesystem locations for files that appear to contain
hardcoded credentials, API keys, or sensitive secrets.

Checks:
  - Presence of credential-pattern lines in .env / config files
  - World-readable permissions on files containing secrets
  - Common locations: /opt, /var/www, /home, /root, /srv, /etc

Read-only. No external binaries required.
"""
from __future__ import annotations

import os
import re
import stat
from pathlib import Path

from engine.base import BaseCheck, CheckFinding


# Regex patterns that suggest a line contains a credential
_SECRET_PATTERNS = re.compile(
    r"""
    (?xi)
    (
        (password|passwd|secret|api[_\-]?key|private[_\-]?key|
         access[_\-]?token|auth[_\-]?token|oauth[_\-]?token|
         db[_\-]?pass|database[_\-]?password|client[_\-]?secret|
         aws[_\-]?secret|encryption[_\-]?key|smtp[_\-]?pass)
        \s*[=:]\s*
        (?!["']?\s*["']?\s*$)   # not empty value
        (?!["']{2})             # not empty quoted value
        (?!\$\{)                # not a variable reference
        .{4,}                   # at least 4 chars of value
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)

# File names / extensions to scan
_TARGET_FILENAMES = {
    ".env", ".env.local", ".env.production", ".env.staging",
    ".env.development", ".envrc",
    "config.ini", "config.cfg", "config.conf", "settings.ini",
    "application.properties", "application.yml", "application.yaml",
    "database.yml", "secrets.yml", "credentials.json", "credentials.yaml",
    ".htpasswd",
}

# Directories to walk (limited to avoid very slow scans)
_SCAN_ROOTS = [
    "/home", "/root", "/opt", "/var/www", "/srv",
    "/etc/nginx", "/etc/apache2", "/etc/httpd",
]

# Directories to skip entirely
_SKIP_DIRS = {
    ".git", ".svn", "__pycache__", "node_modules",
    ".venv", "venv", "env", ".tox",
}

_MAX_FINDINGS = 25
_MAX_FILE_SIZE = 512 * 1024  # 512 KB — skip large files


def _file_is_world_readable(path: str) -> bool:
    try:
        mode = os.stat(path).st_mode
        return bool(mode & stat.S_IROTH)
    except OSError:
        return False


def _scan_file(path: str) -> list[str]:
    """Return list of suspicious lines found in a file (up to 5)."""
    try:
        size = os.path.getsize(path)
        if size > _MAX_FILE_SIZE or size == 0:
            return []
        with open(path, "r", errors="replace") as fh:
            hits = []
            for lineno, line in enumerate(fh, 1):
                if _SECRET_PATTERNS.search(line):
                    # Redact the actual value portion
                    redacted = re.sub(
                        r"(=\s*|:\s*)\S.*",
                        r"\1[REDACTED]",
                        line.rstrip(),
                    )
                    hits.append(f"  line {lineno}: {redacted}")
                    if len(hits) >= 5:
                        break
            return hits
    except (PermissionError, IsADirectoryError, UnicodeDecodeError):
        return []


class EnvFilesCheck(BaseCheck):
    name = "secrets.env_files"
    description = "Hardcoded credential and secret file detection"
    requires_root = False

    def run(self) -> list[CheckFinding]:
        findings: list[CheckFinding] = []
        flagged_files: list[tuple[str, list[str], bool]] = []  # (path, hits, world_readable)

        for root_dir in _SCAN_ROOTS:
            if not os.path.isdir(root_dir):
                continue
            try:
                for dirpath, dirnames, filenames in os.walk(root_dir, followlinks=False):
                    # Prune unwanted subdirectories in-place
                    dirnames[:] = [
                        d for d in dirnames
                        if d not in _SKIP_DIRS
                        and not os.path.islink(os.path.join(dirpath, d))
                    ]
                    for fname in filenames:
                        if fname not in _TARGET_FILENAMES and not fname.endswith(
                            (".env", ".cfg", ".ini", ".conf", ".properties",
                             ".yml", ".yaml", ".json")
                        ):
                            continue
                        fpath = os.path.join(dirpath, fname)
                        hits = _scan_file(fpath)
                        if hits:
                            world_readable = _file_is_world_readable(fpath)
                            flagged_files.append((fpath, hits, world_readable))
                            if len(flagged_files) >= _MAX_FINDINGS:
                                break
                    if len(flagged_files) >= _MAX_FINDINGS:
                        break
            except PermissionError:
                continue

        if not flagged_files:
            return findings

        # Separate world-readable (higher severity) from private files
        world_readable = [(p, h) for p, h, wr in flagged_files if wr]
        private = [(p, h) for p, h, wr in flagged_files if not wr]

        if world_readable:
            evidence_lines = []
            for path, hits in world_readable:
                evidence_lines.append(f"{path}  [world-readable]")
                evidence_lines.extend(hits)
            findings.append(CheckFinding(
                severity="critical",
                title="World-readable files containing hardcoded credentials",
                category="Secrets",
                description="Files that appear to contain credentials or secrets are world-readable. "
                            "Any local user on this system can read these files and extract credentials.",
                evidence="\n".join(evidence_lines),
                remediation_simple="Restrict file permissions and remove or rotate any exposed credentials.",
                remediation_technical="chmod 600 <file>   # restrict to owner only\n"
                                      "# Rotate any credentials that were exposed\n"
                                      "# Consider using a secrets manager or environment injection",
            ))

        if private:
            evidence_lines = []
            for path, hits in private:
                evidence_lines.append(path)
                evidence_lines.extend(hits)
            findings.append(CheckFinding(
                severity="high",
                title="Files containing hardcoded credentials detected",
                category="Secrets",
                description="Configuration or environment files containing what appear to be "
                            "hardcoded passwords, API keys, or secrets were found. "
                            "Hardcoded credentials cannot be rotated without code changes and "
                            "are frequently exposed through version control leaks.",
                evidence="\n".join(evidence_lines),
                remediation_simple="Move secrets out of files and into a secrets manager or "
                                   "environment variables injected at runtime.",
                remediation_technical="# Options:\n"
                                      "# 1. Use systemd EnvironmentFile with 0600 permissions\n"
                                      "# 2. Use HashiCorp Vault / pass / age for secrets management\n"
                                      "# 3. Ensure .env files are in .gitignore and never committed",
            ))

        return findings
