"""
SCOPE Adapter — nmap (optional, high-quality)

Uses nmap -sV for service version detection. This is the highest-fidelity
adapter but requires nmap to be installed, and ideally cap_net_raw or root
for SYN scanning (otherwise nmap falls back to connect-scan which is slower
and detectable).

Output is parsed from nmap's stable XML format (-oX -) rather than text output,
making it resilient to nmap version differences.

This adapter is automatically selected by modules when has_nmap_net_raw is True
in the CapabilityProfile. It is never invoked on its own — the module's adapter
chain controls selection.
"""
from __future__ import annotations

import subprocess
import xml.etree.ElementTree as ET

from engine.adapters.base import PortAdapter, ToolParseError, ToolUnavailableError
from engine.scan_models import PortRecord, PortState, Protocol, ServiceInfo


class NmapAdapter(PortAdapter):
    """
    Nmap adapter for service version detection on localhost.
    Produces ServiceInfo with product, version, and high confidence scores.
    """

    tool_name = "nmap"

    def enumerate_ports(self) -> list[PortRecord]:
        if not self.is_available():
            raise ToolUnavailableError("nmap")

        # Scan localhost only — SCOPE is a local assessment tool, not a network scanner.
        # -sV   : service/version detection
        # --open: only report open ports
        # -oX - : machine-readable XML to stdout (stable across nmap versions)
        # -T4   : aggressive timing (safe for loopback)
        result = subprocess.run(
            ["nmap", "-sV", "--open", "-oX", "-", "-T4", "127.0.0.1"],
            capture_output=True, text=True, timeout=120,
        )

        # nmap exits 1 on partial results (e.g. host down for some targets)
        # We accept both 0 and 1 since we're scanning loopback which is always up
        if result.returncode not in (0, 1):
            raise ToolParseError(
                f"nmap exited {result.returncode}: {result.stderr[:300]}"
            )

        if not result.stdout.strip():
            raise ToolParseError("nmap produced no output")

        return self._parse_xml(result.stdout)

    def _parse_xml(self, xml_str: str) -> list[PortRecord]:
        try:
            root = ET.fromstring(xml_str)
        except ET.ParseError as exc:
            raise ToolParseError(f"nmap XML parse error: {exc}")

        records: list[PortRecord] = []

        for host in root.findall("host"):
            ports_elem = host.find("ports")
            if ports_elem is None:
                continue

            for port_elem in ports_elem.findall("port"):
                proto_str = port_elem.get("protocol", "tcp")
                portid    = int(port_elem.get("portid", "0"))

                state_elem = port_elem.find("state")
                if state_elem is None or state_elem.get("state") != "open":
                    continue

                proto   = Protocol.TCP if proto_str == "tcp" else Protocol.UDP
                service = None

                svc_elem = port_elem.find("service")
                if svc_elem is not None:
                    # nmap confidence is 0–10; scale to 0–100
                    nmap_conf = int(svc_elem.get("conf", "0"))
                    service = ServiceInfo(
                        name       = svc_elem.get("name", "unknown"),
                        product    = svc_elem.get("product") or None,
                        version    = svc_elem.get("version") or None,
                        extra_info = svc_elem.get("extrainfo") or None,
                        confidence = nmap_conf * 10,
                        source     = "nmap",
                    )

                records.append(PortRecord(
                    port     = portid,
                    protocol = proto,
                    state    = PortState.OPEN,
                    address  = "127.0.0.1",
                    service  = service,
                    source   = "nmap",
                ))

        return records
