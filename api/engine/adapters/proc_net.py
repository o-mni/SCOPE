"""
SCOPE Adapter — /proc/net (pure Python fallback)

Reads /proc/net/tcp, /proc/net/tcp6, /proc/net/udp, /proc/net/udp6
directly from the Linux kernel's virtual filesystem.

This adapter:
  - Requires no external tools
  - Does not require root
  - Always works on any Linux system
  - Cannot determine process names (no /proc/*/fd correlation)
  - Cannot do service version detection
  - Assigns service names from port-number heuristics only (low confidence)

Used as the last-resort fallback when ss and nmap are unavailable.
"""
from __future__ import annotations

import socket
import struct
from pathlib import Path

from engine.adapters.base import PortAdapter
from engine.scan_models import PORT_SERVICE_HINTS, PortRecord, PortState, Protocol, ServiceInfo


# TCP state codes used in /proc/net/tcp
_LISTEN_STATES_TCP = {"0A"}          # LISTEN
_LISTEN_STATES_UDP = {"07", "01"}    # UNCONN, ESTABLISHED (UDP has no real "listen")


def _ip4_from_hex(hex_str: str) -> str:
    """
    Convert a little-endian 32-bit hex string to dotted IPv4.
    '0100007F' → '127.0.0.1'
    """
    try:
        return socket.inet_ntoa(struct.pack("<I", int(hex_str, 16)))
    except Exception:
        return "0.0.0.0"


def _ip6_from_hex(hex_str: str) -> str:
    """
    Convert a /proc/net/tcp6 hex address (4 little-endian 32-bit words) to IPv6.
    """
    try:
        raw = bytes.fromhex(hex_str)
        # Each 4-byte word is stored little-endian; reverse each chunk
        chunks = [raw[i : i + 4][::-1] for i in range(0, 16, 4)]
        return socket.inet_ntop(socket.AF_INET6, b"".join(chunks))
    except Exception:
        return "::"


def _parse_proc_file(
    path: str,
    is_v6: bool,
    proto: Protocol,
    listen_states: set[str],
) -> list[PortRecord]:
    p = Path(path)
    if not p.exists():
        return []

    try:
        lines = p.read_text().splitlines()[1:]  # skip header row
    except OSError:
        return []

    records: list[PortRecord] = []
    for line in lines:
        parts = line.split()
        if len(parts) < 4:
            continue

        local   = parts[1]   # "hex_ip:hex_port"
        state   = parts[3]

        if state not in listen_states:
            continue

        colon = local.rfind(":")
        if colon == -1:
            continue

        addr_hex = local[:colon]
        try:
            port = int(local[colon + 1:], 16)
        except ValueError:
            continue

        if port == 0:
            continue

        if is_v6:
            addr = _ip6_from_hex(addr_hex)
        else:
            addr = _ip4_from_hex(addr_hex)

        svc_name = PORT_SERVICE_HINTS.get(port, "unknown")
        records.append(PortRecord(
            port         = port,
            protocol     = proto,
            state        = PortState.OPEN,
            address      = addr,
            service      = ServiceInfo(
                name       = svc_name,
                confidence = 30,
                source     = "port-heuristic",
            ),
            source = "proc_net",
        ))

    return records


class ProcNetAdapter(PortAdapter):
    """
    Pure-Python /proc/net adapter — the adapter of last resort.
    Always available on Linux. No root required for basic port enumeration.
    """

    tool_name = ""   # no external binary needed

    def is_available(self) -> bool:
        return Path("/proc/net/tcp").exists()

    def enumerate_ports(self) -> list[PortRecord]:
        seen: set[tuple[int, str]] = set()
        all_records: list[PortRecord] = []

        sources = [
            ("/proc/net/tcp",  False, Protocol.TCP, _LISTEN_STATES_TCP),
            ("/proc/net/tcp6", True,  Protocol.TCP, _LISTEN_STATES_TCP),
            ("/proc/net/udp",  False, Protocol.UDP, _LISTEN_STATES_UDP),
            ("/proc/net/udp6", True,  Protocol.UDP, _LISTEN_STATES_UDP),
        ]

        for path, is_v6, proto, states in sources:
            for rec in _parse_proc_file(path, is_v6, proto, states):
                key = (rec.port, rec.protocol.value)
                if key not in seen:
                    seen.add(key)
                    all_records.append(rec)

        return all_records
