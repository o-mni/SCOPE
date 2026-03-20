"""
SCOPE Module — system.kernel_params

Reads kernel sysctl parameters directly from /proc/sys/.
No external binaries required.

Checks a curated set of hardening parameters from:
  - CIS Linux Benchmark
  - kernel self-protection project recommendations
"""
from __future__ import annotations

import os
from pathlib import Path

from engine.base import BaseCheck, CheckFinding


# Each entry: (sysctl_key, expected_value, severity, title, description, remediation_simple, remediation_technical)
_CHECKS: list[tuple[str, str, str, str, str, str, str]] = [
    (
        "kernel.randomize_va_space",
        "2",
        "high",
        "ASLR disabled or partially disabled",
        "Address Space Layout Randomisation (ASLR) is not fully enabled. "
        "Without full ASLR, memory-based exploits are significantly easier to develop.",
        "Enable full ASLR by setting kernel.randomize_va_space = 2.",
        "echo 'kernel.randomize_va_space = 2' >> /etc/sysctl.d/99-hardening.conf\nsysctl -p /etc/sysctl.d/99-hardening.conf",
    ),
    (
        "net.ipv4.tcp_syncookies",
        "1",
        "high",
        "TCP SYN cookie protection disabled",
        "TCP SYN cookies are not enabled. The host is vulnerable to TCP SYN flood "
        "denial-of-service attacks which exhaust the connection backlog.",
        "Enable SYN cookies: net.ipv4.tcp_syncookies = 1.",
        "echo 'net.ipv4.tcp_syncookies = 1' >> /etc/sysctl.d/99-hardening.conf\nsysctl -p /etc/sysctl.d/99-hardening.conf",
    ),
    (
        "kernel.dmesg_restrict",
        "1",
        "medium",
        "Kernel ring buffer readable by unprivileged users",
        "kernel.dmesg_restrict is not set. Unprivileged users can read kernel log "
        "messages via dmesg, which may expose kernel addresses and driver information "
        "useful for privilege escalation.",
        "Restrict dmesg access: kernel.dmesg_restrict = 1.",
        "echo 'kernel.dmesg_restrict = 1' >> /etc/sysctl.d/99-hardening.conf\nsysctl -p /etc/sysctl.d/99-hardening.conf",
    ),
    (
        "kernel.kptr_restrict",
        None,   # expected: any value >= 1
        "medium",
        "Kernel pointer exposure not restricted",
        "kernel.kptr_restrict is 0. Kernel symbol addresses in /proc/kallsyms and "
        "similar interfaces are visible to unprivileged users, aiding kernel exploit development.",
        "Set kernel.kptr_restrict to at least 1 (or 2 for maximum restriction).",
        "echo 'kernel.kptr_restrict = 2' >> /etc/sysctl.d/99-hardening.conf\nsysctl -p /etc/sysctl.d/99-hardening.conf",
    ),
    (
        "net.ipv4.conf.all.accept_redirects",
        "0",
        "medium",
        "ICMP redirect acceptance enabled (IPv4)",
        "The host accepts ICMP redirect packets, which can be used by an attacker "
        "on the local network to redirect traffic through a malicious gateway.",
        "Disable ICMP redirect acceptance: net.ipv4.conf.all.accept_redirects = 0.",
        "echo 'net.ipv4.conf.all.accept_redirects = 0' >> /etc/sysctl.d/99-hardening.conf\n"
        "echo 'net.ipv4.conf.default.accept_redirects = 0' >> /etc/sysctl.d/99-hardening.conf\n"
        "sysctl -p /etc/sysctl.d/99-hardening.conf",
    ),
    (
        "net.ipv4.conf.all.send_redirects",
        "0",
        "medium",
        "ICMP redirect sending enabled",
        "The host will send ICMP redirect messages. This is only appropriate on routers. "
        "On servers and workstations it should be disabled.",
        "Disable ICMP redirect sending: net.ipv4.conf.all.send_redirects = 0.",
        "echo 'net.ipv4.conf.all.send_redirects = 0' >> /etc/sysctl.d/99-hardening.conf\n"
        "echo 'net.ipv4.conf.default.send_redirects = 0' >> /etc/sysctl.d/99-hardening.conf\n"
        "sysctl -p /etc/sysctl.d/99-hardening.conf",
    ),
    (
        "net.ipv4.conf.all.rp_filter",
        "1",
        "low",
        "Reverse path filtering disabled",
        "Reverse path filtering (rp_filter) is not enabled. Without it, the kernel "
        "will accept packets with spoofed source addresses, aiding in IP spoofing attacks.",
        "Enable reverse path filtering: net.ipv4.conf.all.rp_filter = 1.",
        "echo 'net.ipv4.conf.all.rp_filter = 1' >> /etc/sysctl.d/99-hardening.conf\n"
        "echo 'net.ipv4.conf.default.rp_filter = 1' >> /etc/sysctl.d/99-hardening.conf\n"
        "sysctl -p /etc/sysctl.d/99-hardening.conf",
    ),
    (
        "net.ipv4.conf.all.log_martians",
        "1",
        "low",
        "Martian packet logging disabled",
        "Packets with impossible source addresses (martians) are not being logged. "
        "Enabling this aids in detecting IP spoofing and routing anomalies.",
        "Enable martian packet logging: net.ipv4.conf.all.log_martians = 1.",
        "echo 'net.ipv4.conf.all.log_martians = 1' >> /etc/sysctl.d/99-hardening.conf\n"
        "echo 'net.ipv4.conf.default.log_martians = 1' >> /etc/sysctl.d/99-hardening.conf\n"
        "sysctl -p /etc/sysctl.d/99-hardening.conf",
    ),
    (
        "net.ipv6.conf.all.accept_redirects",
        "0",
        "medium",
        "ICMP redirect acceptance enabled (IPv6)",
        "The host accepts IPv6 ICMP redirect packets. An attacker on the local network "
        "can redirect IPv6 traffic through a malicious gateway.",
        "Disable IPv6 ICMP redirect acceptance: net.ipv6.conf.all.accept_redirects = 0.",
        "echo 'net.ipv6.conf.all.accept_redirects = 0' >> /etc/sysctl.d/99-hardening.conf\n"
        "echo 'net.ipv6.conf.default.accept_redirects = 0' >> /etc/sysctl.d/99-hardening.conf\n"
        "sysctl -p /etc/sysctl.d/99-hardening.conf",
    ),
    (
        "net.ipv4.ip_forward",
        "0",
        "medium",
        "IP forwarding enabled",
        "IP forwarding is enabled. Unless this host is intentionally acting as a router "
        "or VPN gateway, forwarding should be disabled to prevent traffic pivoting.",
        "Disable IP forwarding unless this host is a router: net.ipv4.ip_forward = 0.",
        "echo 'net.ipv4.ip_forward = 0' >> /etc/sysctl.d/99-hardening.conf\nsysctl -p /etc/sysctl.d/99-hardening.conf",
    ),
]


def _proc_path(key: str) -> Path:
    """Convert a sysctl dotted key to its /proc/sys/ path."""
    return Path("/proc/sys") / key.replace(".", "/")


def _read_param(key: str) -> str | None:
    try:
        return _proc_path(key).read_text(errors="replace").strip()
    except (FileNotFoundError, PermissionError):
        return None


class KernelParamsCheck(BaseCheck):
    name = "system.kernel_params"
    description = "Kernel sysctl hardening parameter checks"
    requires_root = False

    def run(self) -> list[CheckFinding]:
        findings: list[CheckFinding] = []

        for key, expected, severity, title, description, rem_simple, rem_technical in _CHECKS:
            current = _read_param(key)
            if current is None:
                # Parameter not available on this kernel version — skip
                continue

            fail = False
            evidence_val = f"{key} = {current}"

            if key == "kernel.kptr_restrict":
                # Any value >= 1 is acceptable
                try:
                    fail = int(current) < 1
                except ValueError:
                    fail = True
            else:
                fail = (current != expected)

            if fail:
                findings.append(CheckFinding(
                    severity=severity,
                    title=title,
                    category="System Hardening",
                    description=description,
                    evidence=f"{evidence_val}  (expected: {expected if expected else '>= 1'})",
                    remediation_simple=rem_simple,
                    remediation_technical=rem_technical,
                ))

        return findings
