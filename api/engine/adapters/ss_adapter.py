"""
SCOPE Adapter — ss (iproute2)

Wraps `ss -tlnup` to enumerate listening ports with process ownership.
This is the standard adapter on any modern Linux system.

Advantages over /proc/net fallback:
  - Includes process name and PID for each port
  - Handles IPv4/IPv6 uniformly
  - More reliable address parsing than manual hex decoding

Requires: iproute2 (ss binary) — present on virtually all Linux distros.
"""
from __future__ import annotations

import re
import subprocess

from engine.adapters.base import PortAdapter, ToolParseError, ToolUnavailableError
from engine.scan_models import PORT_SERVICE_HINTS, PortRecord, PortState, Protocol, ServiceInfo


# Matches the users:(("name",pid=N,fd=M)) column emitted by ss -p
_USERS_RE = re.compile(r'"([^"]+)",pid=(\d+)')


def _parse_users(users_str: str) -> tuple[str | None, int | None]:
    """Extract (process_name, pid) from ss users column, e.g. users:(("sshd",pid=1234,fd=3))"""
    m = _USERS_RE.search(users_str)
    if m:
        return m.group(1), int(m.group(2))
    return None, None


class SsAdapter(PortAdapter):
    """
    Port adapter using `ss -tlnup`.
    Preferred over ProcNetAdapter when available — provides process names.
    """

    tool_name = "ss"

    def enumerate_ports(self) -> list[PortRecord]:
        if not self.is_available():
            raise ToolUnavailableError("ss")

        result = subprocess.run(
            ["ss", "-tlnup"],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode != 0:
            raise ToolParseError(
                f"ss exited with code {result.returncode}: {result.stderr.strip()}"
            )

        return self._parse(result.stdout)

    def _parse(self, output: str) -> list[PortRecord]:
        records:  list[PortRecord]         = []
        seen:     set[tuple[int, str]]      = set()

        for line in output.splitlines():
            line = line.strip()
            if not line or line.startswith("Netid") or line.startswith("State"):
                continue

            parts = line.split()
            if len(parts) < 5:
                continue

            proto_raw       = parts[0]   # tcp | udp | tcp6 | udp6
            local_addr_port = parts[4]   # e.g. 0.0.0.0:22, *:22, [::]:22

            proto = Protocol.TCP if "tcp" in proto_raw else Protocol.UDP

            colon = local_addr_port.rfind(":")
            if colon == -1:
                continue

            raw_addr = local_addr_port[:colon]
            port_str = local_addr_port[colon + 1:]

            try:
                port = int(port_str)
            except ValueError:
                continue

            key = (port, proto.value)
            if key in seen:
                continue
            seen.add(key)

            # Normalise wildcard addresses
            addr = raw_addr if raw_addr not in ("*", "") else "0.0.0.0"

            # Process info lives in the last column when ss -p is used
            users_col = parts[-1] if parts[-1].startswith("users:") else ""
            pname, pid = _parse_users(users_col)

            svc_name = PORT_SERVICE_HINTS.get(port, "unknown")

            records.append(PortRecord(
                port         = port,
                protocol     = proto,
                state        = PortState.OPEN,
                address      = addr,
                service      = ServiceInfo(
                    name       = svc_name,
                    confidence = 40,
                    source     = "port-heuristic",
                ),
                pid          = pid,
                process_name = pname,
                source       = "ss",
            ))

        return records
