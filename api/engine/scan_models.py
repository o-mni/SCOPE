"""
SCOPE Engine — Normalized scan data models.

These types are the canonical representation of observed system state.
All adapters produce these. All assessment modules consume these.
Never mix raw tool output with these types — normalize at the adapter boundary.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class PortState(str, Enum):
    OPEN     = "open"
    CLOSED   = "closed"
    FILTERED = "filtered"
    UNKNOWN  = "unknown"


class Protocol(str, Enum):
    TCP = "tcp"
    UDP = "udp"


@dataclass
class ServiceInfo:
    name: str                         # "ssh", "http", "unknown"
    product:    Optional[str] = None  # "OpenSSH", "nginx"
    version:    Optional[str] = None  # "8.9p1", "1.24.0"
    extra_info: Optional[str] = None  # "protocol 2.0", "Ubuntu"
    confidence: int = 0               # 0–100; higher = more certain
    source: str = "inferred"          # "nmap", "banner", "port-heuristic", "proc_net"


@dataclass
class PortRecord:
    port:         int
    protocol:     Protocol
    state:        PortState
    address:      str = "0.0.0.0"    # listening address
    service:      Optional[ServiceInfo] = None
    pid:          Optional[int] = None
    process_name: Optional[str] = None
    source:       str = "unknown"    # which adapter produced this record


@dataclass
class HostRecord:
    address:      str
    hostname:     Optional[str] = None
    os_guess:     Optional[str] = None
    is_localhost: bool = False
    ports:        list[PortRecord] = field(default_factory=list)
    source:       str = "unknown"


# ── Well-known port → service name heuristic ──────────────────────────────────
# Used by adapters that lack service-detection capability (proc_net, ss).
# Confidence is intentionally low (30–40) — these are guesses based on port number.

PORT_SERVICE_HINTS: dict[int, str] = {
    21:    "ftp",
    22:    "ssh",
    23:    "telnet",
    25:    "smtp",
    53:    "dns",
    69:    "tftp",
    79:    "finger",
    80:    "http",
    110:   "pop3",
    111:   "rpcbind",
    143:   "imap",
    389:   "ldap",
    443:   "https",
    445:   "smb",
    512:   "rexec",
    513:   "rlogin",
    514:   "rsh",
    515:   "lpd",
    587:   "smtp-submission",
    636:   "ldaps",
    873:   "rsync",
    993:   "imaps",
    995:   "pop3s",
    2049:  "nfs",
    3306:  "mysql",
    5432:  "postgresql",
    5900:  "vnc",
    6379:  "redis",
    8080:  "http-alt",
    8443:  "https-alt",
    9200:  "elasticsearch",
    27017: "mongodb",
}
