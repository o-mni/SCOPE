"""
SCOPE Module — network.open_ports

Enumerates listening TCP/UDP ports using `ss` (iproute2).
Flags ports associated with known-dangerous legacy services.

Requires: iproute2 (ss) — standard on all modern Linux distributions.
"""
from __future__ import annotations

import re
import shutil
import subprocess

from engine.base import BaseCheck, CheckFinding


# Services that should virtually never be intentionally exposed
# Format: {port: (service_name, severity, reason)}
_DANGEROUS_PORTS: dict[int, tuple[str, str, str]] = {
    21:   ("FTP", "high",
           "FTP transmits credentials in cleartext. Replace with SFTP (SSH file transfer)."),
    23:   ("Telnet", "critical",
           "Telnet transmits all data including credentials in cleartext. Replace with SSH."),
    25:   ("SMTP", "medium",
           "An open SMTP relay can be abused for spam. Ensure authentication is enforced."),
    53:   ("DNS", "medium",
           "DNS listening on all interfaces may allow recursive queries from untrusted sources."),
    69:   ("TFTP", "high",
           "TFTP has no authentication. Disable unless specifically required."),
    79:   ("Finger", "high",
           "Finger daemon exposes user information. Disable immediately."),
    111:  ("RPCbind", "medium",
           "RPCbind/portmapper is required for NFS and other RPC services. "
           "Restrict access if NFS is not intentional."),
    512:  ("rexec", "critical",
           "rexec is a legacy r-service with no encryption or strong authentication. Disable immediately."),
    513:  ("rlogin", "critical",
           "rlogin is a legacy r-service with no encryption. Disable immediately."),
    514:  ("rsh/syslog", "high",
           "rsh is a legacy r-service with no encryption. If this is syslog, restrict to localhost."),
    515:  ("LPD (print)", "medium",
           "LPD print service. Restrict access if not in use."),
    873:  ("rsync", "medium",
           "rsync listening on all interfaces allows unauthenticated file read/write if misconfigured."),
    2049: ("NFS", "medium",
           "NFS exposed on all interfaces. Restrict exports and client access in /etc/exports."),
    3306: ("MySQL/MariaDB", "high",
           "Database port exposed on all interfaces. Bind to 127.0.0.1 unless remote access is required."),
    5432: ("PostgreSQL", "high",
           "Database port exposed on all interfaces. Bind to 127.0.0.1 unless remote access is required."),
    6379: ("Redis", "critical",
           "Redis has no authentication by default. If exposed on all interfaces, "
           "it is trivially exploitable for RCE and data exfiltration."),
    27017:("MongoDB", "high",
           "MongoDB listening on all interfaces. Enable authentication and bind to 127.0.0.1."),
}


def _parse_ss_output(output: str) -> list[dict]:
    """
    Parse `ss -tlnup` output into a list of port dicts.
    Returns: list of {proto, local_addr, local_port, process}
    """
    entries = []
    for line in output.splitlines():
        line = line.strip()
        # Skip header line
        if line.startswith("Netid") or line.startswith("State") or not line:
            continue
        parts = line.split()
        if len(parts) < 5:
            continue
        proto = parts[0]            # tcp / udp / tcp6 / udp6
        local_addr_port = parts[4]  # e.g. 0.0.0.0:22 or *:22 or [::]:22

        # Extract port from last colon
        colon_idx = local_addr_port.rfind(":")
        if colon_idx == -1:
            continue
        addr = local_addr_port[:colon_idx]
        port_str = local_addr_port[colon_idx + 1:]

        try:
            port = int(port_str)
        except ValueError:
            continue

        # Process info is the last column if present (users:(...))
        process = parts[-1] if parts[-1].startswith("users:") else ""

        entries.append({
            "proto": proto,
            "addr": addr,
            "port": port,
            "process": process,
        })
    return entries


class OpenPortsCheck(BaseCheck):
    name = "network.open_ports"
    description = "Listening port enumeration and dangerous service detection"
    requires_root = False

    def is_available(self) -> bool:
        return self._which("ss")

    def run(self) -> list[CheckFinding]:
        findings: list[CheckFinding] = []

        result = subprocess.run(
            ["ss", "-tlnup"],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            return findings

        ports = _parse_ss_output(result.stdout)
        if not ports:
            return findings

        # Build an inventory string for informational context
        inventory_lines = [
            f"  {e['proto']:6}  {e['addr']:20}  port {e['port']:<6}  {e['process']}"
            for e in ports
        ]

        # Check for dangerous services
        all_interfaces_addrs = {"0.0.0.0", "*", "::"}
        flagged_ports: set[int] = set()

        for entry in ports:
            port = entry["port"]
            if port in _DANGEROUS_PORTS and port not in flagged_ports:
                service, severity, reason = _DANGEROUS_PORTS[port]
                is_all_ifaces = entry["addr"] in all_interfaces_addrs

                addr_note = (
                    "listening on all interfaces (0.0.0.0)" if is_all_ifaces
                    else f"listening on {entry['addr']}"
                )

                findings.append(CheckFinding(
                    severity=severity if is_all_ifaces else "low",
                    title=f"{service} service detected on port {port}",
                    category="Network",
                    description=reason,
                    evidence=f"Port {port}/{entry['proto']}  {addr_note}  {entry['process']}",
                    remediation_simple=f"Disable the {service} service if not required, "
                                       "or restrict it to localhost.",
                    remediation_technical=f"# Disable service:\nsystemctl stop <service> && systemctl disable <service>\n"
                                          f"# Or restrict to loopback only in the service configuration.",
                ))
                flagged_ports.add(port)

        # If ports exist but nothing dangerous, still expose the inventory as info
        if not findings and ports:
            findings.append(CheckFinding(
                severity="info",
                title="Listening port inventory",
                category="Network",
                description="No known-dangerous listening services detected. "
                            "Review the port inventory below and confirm all services are expected.",
                evidence="\n".join(inventory_lines),
                remediation_simple="Disable any services that are not intentionally running.",
                remediation_technical="# Disable a service:\nsystemctl stop <service>\nsystemctl disable <service>",
            ))

        return findings
