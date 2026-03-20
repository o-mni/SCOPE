"""
SCOPE Module — network.open_ports

Enumerates listening ports and flags known-dangerous services.

Adapter selection (best available wins):
  1. NmapAdapter  — full version detection (requires nmap + cap_net_raw/root)
  2. SsAdapter    — port + process names (requires iproute2 ss)
  3. ProcNetAdapter — pure Python /proc/net fallback (always available on Linux)

The module's security logic is identical regardless of which adapter runs —
the adapter chain only affects how much detail is available (service versions, PIDs).
"""
from __future__ import annotations

from engine.adapters.base import ToolParseError, ToolUnavailableError
from engine.adapters.nmap_adapter import NmapAdapter
from engine.adapters.proc_net import ProcNetAdapter
from engine.adapters.ss_adapter import SsAdapter
from engine.base import BaseCheck, CheckFinding
from engine.scan_models import PortRecord, Protocol


# ── Dangerous port definitions ────────────────────────────────────────────────
# Format: {port: (service_label, severity, reason)}
_DANGEROUS_PORTS: dict[int, tuple[str, str, str]] = {
    21:    ("FTP",           "high",
            "FTP transmits credentials and data in cleartext. Replace with SFTP."),
    23:    ("Telnet",        "critical",
            "Telnet transmits all data including credentials in cleartext. Replace with SSH."),
    25:    ("SMTP",          "medium",
            "An open SMTP relay can be abused for spam. Ensure authentication is enforced."),
    53:    ("DNS",           "medium",
            "DNS listening on all interfaces may allow recursive queries from untrusted sources."),
    69:    ("TFTP",          "high",
            "TFTP has no authentication. Disable unless specifically required."),
    79:    ("Finger",        "high",
            "Finger daemon exposes user information to unauthenticated callers. Disable immediately."),
    111:   ("RPCbind",       "medium",
            "RPCbind is required for NFS/RPC services. Restrict if NFS is not intentional."),
    512:   ("rexec",         "critical",
            "rexec is a legacy r-service with no encryption or strong authentication. Disable immediately."),
    513:   ("rlogin",        "critical",
            "rlogin is a legacy r-service with no encryption. Disable immediately."),
    514:   ("rsh/syslog",   "high",
            "rsh is a legacy r-service with no encryption. If syslog, restrict to localhost."),
    515:   ("LPD",          "medium",
            "LPD print service exposed. Restrict access if not in use."),
    873:   ("rsync",        "medium",
            "rsync on all interfaces allows unauthenticated file access if misconfigured."),
    2049:  ("NFS",          "medium",
            "NFS exposed on all interfaces. Restrict exports and client access in /etc/exports."),
    3306:  ("MySQL/MariaDB","high",
            "Database port exposed on all interfaces. Bind to 127.0.0.1 unless remote access is required."),
    5432:  ("PostgreSQL",   "high",
            "Database port exposed on all interfaces. Bind to 127.0.0.1 unless remote access is required."),
    5900:  ("VNC",          "high",
            "VNC is often poorly authenticated. Restrict to localhost and tunnel over SSH."),
    6379:  ("Redis",        "critical",
            "Redis has no authentication by default. Exposed on all interfaces = trivial RCE."),
    9200:  ("Elasticsearch","high",
            "Elasticsearch has no authentication by default on older versions. Restrict access."),
    27017: ("MongoDB",      "high",
            "MongoDB listening on all interfaces. Enable authentication and bind to 127.0.0.1."),
}

_ALL_IFACE_ADDRS = {"0.0.0.0", "*", "::", ""}


def _service_label(rec: PortRecord) -> str:
    """Human-readable service label from a PortRecord, with version if available."""
    if rec.service and rec.service.version and rec.service.product:
        return f"{rec.service.product} {rec.service.version}"
    if rec.service and rec.service.name != "unknown":
        return rec.service.name
    return f"port {rec.port}"


def _process_label(rec: PortRecord) -> str:
    """Human-readable process info if available."""
    parts = []
    if rec.process_name:
        parts.append(rec.process_name)
    if rec.pid:
        parts.append(f"pid={rec.pid}")
    return f"  [{', '.join(parts)}]" if parts else ""


class OpenPortsCheck(BaseCheck):
    name        = "network.open_ports"
    description = "Listening port enumeration and dangerous service detection"
    requires_root = False

    # Adapter preference order: best → fallback
    _ADAPTERS = [NmapAdapter, SsAdapter, ProcNetAdapter]

    def is_available(self) -> bool:
        # ProcNetAdapter is pure Python and always available on Linux —
        # so this module is always available.
        return ProcNetAdapter().is_available()

    def _select_adapter(self):
        """
        Pick the best available adapter based on current capability profile.
        Respects the CapabilityProfile injected by AuditRunner if present.
        """
        caps = self.capabilities

        for AdapterClass in self._ADAPTERS:
            adapter = AdapterClass()

            # Skip nmap if we know we don't have raw socket access
            if AdapterClass is NmapAdapter:
                if caps and not caps.has_nmap_net_raw:
                    continue

            if adapter.is_available():
                return adapter

        return ProcNetAdapter()   # guaranteed fallback

    def run(self) -> list[CheckFinding]:
        adapter  = self._select_adapter()
        findings: list[CheckFinding] = []

        try:
            ports = adapter.enumerate_ports()
        except (ToolUnavailableError, ToolParseError, OSError):
            # Adapter failed — try the next one down
            for AdapterClass in [SsAdapter, ProcNetAdapter]:
                try:
                    ports = AdapterClass().enumerate_ports()
                    adapter = AdapterClass()
                    break
                except Exception:
                    continue
            else:
                return []   # all adapters failed — emit nothing

        if not ports:
            return []

        source_note = f"(via {adapter.__class__.__name__.replace('Adapter', '').lower()})"

        # ── Build inventory for informational finding ─────────────────────────
        tcp_ports = sorted(
            (r for r in ports if r.protocol == Protocol.TCP),
            key=lambda r: r.port,
        )
        udp_ports = sorted(
            (r for r in ports if r.protocol == Protocol.UDP),
            key=lambda r: r.port,
        )

        inventory_lines: list[str] = []
        for rec in tcp_ports + udp_ports:
            svc   = _service_label(rec)
            proc  = _process_label(rec)
            inventory_lines.append(
                f"  {rec.protocol.value:4}  {rec.address:<22}  :{rec.port:<6}  {svc}{proc}"
            )

        # ── Flag dangerous services ───────────────────────────────────────────
        flagged: set[int] = set()

        for rec in ports:
            if rec.port in _DANGEROUS_PORTS and rec.port not in flagged:
                label, base_severity, reason = _DANGEROUS_PORTS[rec.port]
                is_all   = rec.address in _ALL_IFACE_ADDRS
                severity = base_severity if is_all else "low"
                addr_desc = (
                    "all interfaces (0.0.0.0)" if is_all else rec.address
                )
                svc_ver = _service_label(rec)
                proc    = _process_label(rec)

                findings.append(CheckFinding(
                    severity   = severity,
                    title      = f"{label} detected on port {rec.port}/{rec.protocol.value}",
                    category   = "Network",
                    description= reason,
                    evidence   = (
                        f"Port {rec.port}/{rec.protocol.value} — {svc_ver} — "
                        f"listening on {addr_desc}{proc}  {source_note}"
                    ),
                    remediation_simple=(
                        f"Disable the {label} service if not required, "
                        "or restrict it to localhost."
                    ),
                    remediation_technical=(
                        "# Stop and disable the service:\n"
                        "systemctl stop <service> && systemctl disable <service>\n\n"
                        "# Or restrict to loopback in the service config:\n"
                        "# bind-address = 127.0.0.1   (MySQL/Redis/etc.)\n"
                        "# ListenAddress 127.0.0.1    (OpenSSH)"
                    ),
                ))
                flagged.add(rec.port)

        # ── Port inventory (always emit even if no dangerous ports) ───────────
        findings.append(CheckFinding(
            severity   = "info",
            title      = f"Listening port inventory ({len(ports)} port(s) detected)",
            category   = "Network",
            description= (
                "Complete list of listening ports detected on this host. "
                "Review and confirm all services are expected. "
                + ("No known-dangerous services found. " if not flagged else "")
                + f"Scan source: {source_note}"
            ),
            evidence   = "\n".join(inventory_lines) if inventory_lines else "No listening ports found.",
            remediation_simple=(
                "Disable any service that is not intentionally running."
            ),
            remediation_technical=(
                "# List all listening services:\n"
                "ss -tlnup\n\n"
                "# Disable a service:\n"
                "systemctl stop <service> && systemctl disable <service>"
            ),
        ))

        return findings
