"""
SCOPE Module — software.package_versions

Checks for stale package databases and known end-of-life package versions.
Supports: Arch Linux (pacman), Debian/Ubuntu (apt/dpkg), RHEL/Fedora (rpm).

Does NOT run package manager syncs — purely read-only inspection.
"""
from __future__ import annotations

import os
import re
import subprocess
import time
from pathlib import Path

from engine.base import BaseCheck, CheckFinding


# Days since last package DB sync before we flag it
_SYNC_STALE_DAYS = 30

# Known EOL / vulnerable package name patterns and conditions
# Format: (name_pattern, version_check_fn, severity, title, description, remediation)
# version_check_fn(installed_version_str) -> True if finding
def _ver_startswith(*prefixes):
    def _check(v):
        return any(v.startswith(p) for p in prefixes)
    return _check

_EOL_PACKAGES = [
    (
        re.compile(r"^openssl$"),
        _ver_startswith("1.0.", "1.1."),
        "high",
        "OpenSSL version is end-of-life",
        "OpenSSL 1.0.x and 1.1.x are end-of-life and no longer receive security patches. "
        "Update to OpenSSL 3.x.",
        "Update OpenSSL to the latest stable release (3.x).\n"
        "# Arch: pacman -Syu openssl\n# Debian: apt upgrade openssl",
    ),
    (
        re.compile(r"^python2$|^python-2\.|^python2\.7$"),
        lambda v: True,
        "high",
        "Python 2 is installed and end-of-life",
        "Python 2 reached end-of-life on 2020-01-01 and no longer receives security fixes. "
        "Any application depending on Python 2 should be migrated to Python 3.",
        "Migrate applications to Python 3. Remove Python 2 if no longer needed.",
    ),
    (
        re.compile(r"^openssh$"),
        _ver_startswith("7.", "8.0", "8.1", "8.2", "8.3", "8.4"),
        "medium",
        "OpenSSH version may be outdated",
        "An older OpenSSH version is installed. Older versions have had critical vulnerabilities "
        "(e.g. CVE-2023-38408). Update to the latest release.",
        "Update OpenSSH to the current release.\n"
        "# Arch: pacman -Syu openssh\n# Debian: apt upgrade openssh-server",
    ),
    (
        re.compile(r"^bind$|^bind9$"),
        _ver_startswith("9.11.", "9.14.", "9.15.", "9.16.0", "9.16.1"),
        "high",
        "BIND DNS server is a vulnerable or EOL version",
        "An older or EOL BIND version is installed. Multiple critical CVEs have been published "
        "for BIND 9.11.x–9.16.x. Update to the latest stable or LTS release.",
        "Update BIND to the latest secure release.\n"
        "# Check: named -v\n# Arch: pacman -Syu bind\n# Debian: apt upgrade bind9",
    ),
]


def _detect_distro() -> str:
    """Return 'arch', 'debian', 'rhel', or 'unknown'."""
    os_release = Path("/etc/os-release")
    if not os_release.exists():
        return "unknown"
    try:
        content = os_release.read_text(errors="replace").lower()
    except PermissionError:
        return "unknown"
    if "arch" in content:
        return "arch"
    if "debian" in content or "ubuntu" in content or "mint" in content:
        return "debian"
    if "fedora" in content or "rhel" in content or "centos" in content or "almalinux" in content:
        return "rhel"
    return "unknown"


def _pacman_sync_age_days() -> float | None:
    """Return days since last pacman -Sy, or None if unknown."""
    db_path = Path("/var/lib/pacman/sync/core.db")
    if not db_path.exists():
        return None
    try:
        mtime = db_path.stat().st_mtime
        return (time.time() - mtime) / 86400
    except OSError:
        return None


def _pacman_installed_versions() -> dict[str, str]:
    """Return {package_name: version} for all installed packages."""
    try:
        r = subprocess.run(
            ["pacman", "-Q"],
            capture_output=True, text=True, timeout=30,
        )
        result = {}
        for line in r.stdout.splitlines():
            parts = line.split(None, 1)
            if len(parts) == 2:
                result[parts[0].lower()] = parts[1].strip()
        return result
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {}


def _apt_upgradable_count() -> tuple[int, list[str]]:
    """Return (total_upgradable, list of security-related package names)."""
    try:
        r = subprocess.run(
            ["apt", "list", "--upgradable"],
            capture_output=True, text=True, timeout=30,
            env={**os.environ, "DEBIAN_FRONTEND": "noninteractive"},
        )
        lines = [l for l in r.stdout.splitlines() if "/" in l]
        security = [l.split("/")[0] for l in lines if "security" in l.lower()]
        return len(lines), security
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return 0, []


def _rpm_installed_versions() -> dict[str, str]:
    try:
        r = subprocess.run(
            ["rpm", "-qa", "--qf", "%{NAME} %{VERSION}-%{RELEASE}\n"],
            capture_output=True, text=True, timeout=30,
        )
        result = {}
        for line in r.stdout.splitlines():
            parts = line.split(None, 1)
            if len(parts) == 2:
                result[parts[0].lower()] = parts[1].strip()
        return result
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {}


class PackageVersionsCheck(BaseCheck):
    name = "software.package_versions"
    description = "Package update status and EOL version detection"
    requires_root = False

    def run(self) -> list[CheckFinding]:
        findings: list[CheckFinding] = []
        distro = _detect_distro()

        # ── Arch Linux ────────────────────────────────────────────────────────
        if distro == "arch":
            age = _pacman_sync_age_days()
            if age is not None and age > _SYNC_STALE_DAYS:
                findings.append(CheckFinding(
                    severity="medium",
                    title=f"Package database not updated in {int(age)} days",
                    category="Software",
                    description=f"The pacman package database was last synchronised {int(age)} days ago. "
                                "Running with a stale database means security updates may not have "
                                "been applied to the system.",
                    evidence=f"/var/lib/pacman/sync/core.db — last modified {int(age)} days ago",
                    remediation_simple="Update the package database and apply available updates.",
                    remediation_technical="pacman -Syu   # sync and upgrade all packages",
                ))

            installed = _pacman_installed_versions()
            if installed:
                for pkg_re, version_check, sev, title, desc, rem in _EOL_PACKAGES:
                    for pkg_name, pkg_ver in installed.items():
                        if pkg_re.match(pkg_name) and version_check(pkg_ver):
                            findings.append(CheckFinding(
                                severity=sev,
                                title=title,
                                category="Software",
                                description=desc,
                                evidence=f"Installed: {pkg_name} {pkg_ver}",
                                remediation_simple=f"Update {pkg_name} to the latest version.",
                                remediation_technical=rem,
                            ))

        # ── Debian / Ubuntu ───────────────────────────────────────────────────
        elif distro == "debian":
            total, security_pkgs = _apt_upgradable_count()
            if security_pkgs:
                findings.append(CheckFinding(
                    severity="high",
                    title=f"{len(security_pkgs)} security update(s) available",
                    category="Software",
                    description="Packages with available security updates are installed. "
                                "Unpatched vulnerabilities in these packages may be exploitable.",
                    evidence="Packages with security updates available:\n" +
                             "\n".join(f"  {p}" for p in security_pkgs[:20]),
                    remediation_simple="Apply security updates as soon as possible.",
                    remediation_technical="apt update && apt upgrade\n# Or security-only:\napt-get upgrade -s | grep -i security",
                ))
            elif total > 0:
                findings.append(CheckFinding(
                    severity="low",
                    title=f"{total} package update(s) available",
                    category="Software",
                    description=f"{total} package(s) have updates available. "
                                "Keeping packages updated reduces exposure to known vulnerabilities.",
                    evidence=f"{total} packages pending update (no explicit security tag found)",
                    remediation_simple="Apply pending package updates.",
                    remediation_technical="apt update && apt upgrade",
                ))

        # ── RHEL / Fedora ─────────────────────────────────────────────────────
        elif distro == "rhel":
            installed = _rpm_installed_versions()
            if installed:
                for pkg_re, version_check, sev, title, desc, rem in _EOL_PACKAGES:
                    for pkg_name, pkg_ver in installed.items():
                        if pkg_re.match(pkg_name) and version_check(pkg_ver):
                            findings.append(CheckFinding(
                                severity=sev,
                                title=title,
                                category="Software",
                                description=desc,
                                evidence=f"Installed: {pkg_name} {pkg_ver}",
                                remediation_simple=f"Update {pkg_name} to the latest version.",
                                remediation_technical=rem,
                            ))

        # ── Unknown distro ────────────────────────────────────────────────────
        else:
            findings.append(CheckFinding(
                severity="info",
                title="Package manager not detected — version check skipped",
                category="Software",
                description="Could not detect a supported package manager (pacman, apt, rpm). "
                            "Manual review of installed package versions is recommended.",
                evidence="/etc/os-release — distribution not identified",
                remediation_simple="Manually review installed package versions and apply available updates.",
                remediation_technical="# List installed packages:\ndpkg -l  # Debian\npacman -Q  # Arch\nrpm -qa  # RHEL",
            ))

        return findings
