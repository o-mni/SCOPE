"""
SCOPE Module — software.service_config

Checks running systemd services for dangerous or unnecessary services
that should not be active on a hardened server.

Requires: systemctl (systemd) — standard on all modern Linux distributions.
"""
from __future__ import annotations

import subprocess

from engine.base import BaseCheck, CheckFinding


# Format: (service_name_pattern, severity, title, description, remediation)
_DANGEROUS_SERVICES: list[tuple[str, str, str, str, str]] = [
    (
        "telnet",
        "critical",
        "Telnet service is running",
        "Telnet transmits all data including credentials in cleartext. "
        "An attacker with network access can intercept sessions trivially. "
        "Replace with SSH immediately.",
        "systemctl stop telnet.socket telnetd.service 2>/dev/null\n"
        "systemctl disable telnet.socket telnetd.service 2>/dev/null",
    ),
    (
        "vsftpd",
        "medium",
        "FTP (vsftpd) service is running",
        "FTP transmits credentials in cleartext. Verify that anonymous login is "
        "disabled and consider replacing with SFTP.",
        "# If FTP is not required:\nsystemctl stop vsftpd && systemctl disable vsftpd\n"
        "# If required, ensure vsftpd.conf: anonymous_enable=NO",
    ),
    (
        "proftpd",
        "medium",
        "FTP (proftpd) service is running",
        "FTP transmits credentials in cleartext. Disable if not explicitly required.",
        "systemctl stop proftpd && systemctl disable proftpd",
    ),
    (
        "rsh",
        "critical",
        "rsh (remote shell) service is running",
        "rsh is a legacy remote access protocol with no encryption or modern authentication. "
        "It should never be running on a modern system.",
        "systemctl stop rsh.socket && systemctl disable rsh.socket",
    ),
    (
        "rlogin",
        "critical",
        "rlogin service is running",
        "rlogin is a legacy r-service with no encryption. Disable immediately and use SSH.",
        "systemctl stop rlogin.socket && systemctl disable rlogin.socket",
    ),
    (
        "rexec",
        "critical",
        "rexec service is running",
        "rexec is a legacy remote execution service with no encryption or strong authentication.",
        "systemctl stop rexec.socket && systemctl disable rexec.socket",
    ),
    (
        "xinetd",
        "medium",
        "xinetd internet super-server is running",
        "xinetd manages multiple legacy network services. Review xinetd.d/ to ensure no "
        "insecure services (telnet, ftp, rsh) are enabled.",
        "# Review and disable:\nls /etc/xinetd.d/\n"
        "# If not needed:\nsystemctl stop xinetd && systemctl disable xinetd",
    ),
    (
        "avahi-daemon",
        "low",
        "Avahi mDNS daemon is running",
        "Avahi provides zero-configuration mDNS/DNS-SD. On servers this is typically "
        "unnecessary and exposes the host on the local network.",
        "systemctl stop avahi-daemon && systemctl disable avahi-daemon",
    ),
    (
        "cups",
        "low",
        "CUPS print service is running",
        "CUPS (print service) is rarely needed on servers and has had historical RCE vulnerabilities. "
        "Disable if this host does not serve print jobs.",
        "systemctl stop cups cups-browsed 2>/dev/null\nsystemctl disable cups cups-browsed 2>/dev/null",
    ),
    (
        "bluetooth",
        "low",
        "Bluetooth service is running",
        "Bluetooth is almost never needed on a server and expands the attack surface. "
        "Disable if hardware is a server or virtual machine.",
        "systemctl stop bluetooth && systemctl disable bluetooth",
    ),
    (
        "nfs-server",
        "medium",
        "NFS server is running",
        "An NFS server is active. Ensure /etc/exports restricts access to specific "
        "hosts and does not export with insecure options (no_root_squash, rw to *).",
        "# Review exports:\ncat /etc/exports\nexportfs -v\n"
        "# Disable if not needed:\nsystemctl stop nfs-server && systemctl disable nfs-server",
    ),
    (
        "rpcbind",
        "medium",
        "RPCbind (portmapper) is running",
        "RPCbind is required for NFS and other RPC services. If NFS is not in use, "
        "rpcbind should be disabled.",
        "systemctl stop rpcbind rpcbind.socket 2>/dev/null\n"
        "systemctl disable rpcbind rpcbind.socket 2>/dev/null",
    ),
    (
        "snmpd",
        "medium",
        "SNMP daemon is running",
        "SNMP v1/v2c uses cleartext community strings for authentication. "
        "Ensure SNMPv3 with authentication is used, or disable if not required.",
        "# If SNMP not required:\nsystemctl stop snmpd && systemctl disable snmpd\n"
        "# If required: configure SNMPv3 in /etc/snmp/snmpd.conf",
    ),
]


def _get_running_services() -> list[str]:
    """Return a list of running service unit names (without .service suffix)."""
    try:
        r = subprocess.run(
            ["systemctl", "list-units", "--type=service", "--state=running",
             "--no-pager", "--plain", "--no-legend"],
            capture_output=True, text=True, timeout=15,
        )
        services = []
        for line in r.stdout.splitlines():
            parts = line.split()
            if parts:
                unit = parts[0].lower()
                # Strip .service suffix
                if unit.endswith(".service"):
                    unit = unit[:-8]
                services.append(unit)
        return services
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []


class ServiceConfigCheck(BaseCheck):
    name = "software.service_config"
    description = "Running service audit — dangerous and unnecessary service detection"
    requires_root = False

    def is_available(self) -> bool:
        return self._which("systemctl")

    def run(self) -> list[CheckFinding]:
        findings: list[CheckFinding] = []
        running = _get_running_services()

        if not running:
            return findings

        running_set = set(running)

        for svc_pattern, severity, title, description, remediation in _DANGEROUS_SERVICES:
            # Match if any running service contains the pattern name
            matched = [s for s in running_set if svc_pattern in s]
            if matched:
                findings.append(CheckFinding(
                    severity=severity,
                    title=title,
                    category="Services",
                    description=description,
                    evidence=f"Running service(s): {', '.join(matched)}",
                    remediation_simple=f"Disable '{svc_pattern}' if not explicitly required.",
                    remediation_technical=remediation,
                ))

        return findings
