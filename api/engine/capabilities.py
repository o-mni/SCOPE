"""
SCOPE Engine — Capability detection.

Detects what tools and kernel interfaces are available on the current system.
Run once at assessment start; pass the resulting CapabilityProfile to every module.

This is how SCOPE knows whether to use nmap, ss, or /proc/net — and whether
to skip root-only checks instead of failing with cryptic errors.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass


@dataclass
class CapabilityProfile:
    # ── Privilege ─────────────────────────────────────────────────────────────
    is_root: bool
    euid:    int

    # ── External tools ────────────────────────────────────────────────────────
    has_nmap:         bool   # nmap binary present
    has_nmap_net_raw: bool   # nmap can do raw-socket scans (root or cap_net_raw)
    has_ss:           bool
    has_ip:           bool
    has_iptables:     bool
    has_nft:          bool
    has_ufw:          bool
    has_systemctl:    bool
    has_pacman:       bool
    has_apt:          bool
    has_rpm:          bool
    has_journalctl:   bool

    # ── Kernel/filesystem interfaces (pure Linux, no external tools) ──────────
    has_proc_net:     bool   # /proc/net/tcp readable
    has_proc_sys:     bool   # /proc/sys/ readable (sysctl values)
    has_etc_shadow:   bool   # /etc/shadow readable (root only normally)
    has_etc_sudoers:  bool   # /etc/sudoers readable

    # ── Derived quality level ─────────────────────────────────────────────────
    scan_depth: str          # "full" | "standard" | "minimal"


def detect_capabilities() -> CapabilityProfile:
    """
    Inspect the current runtime environment and return a CapabilityProfile.
    Fast: pure filesystem/process checks, no network I/O, completes in < 200ms.
    """
    euid     = os.geteuid()
    is_root  = euid == 0

    def cmd(name: str) -> bool:
        return shutil.which(name) is not None

    def readable(path: str) -> bool:
        return os.access(path, os.R_OK)

    has_nmap         = cmd("nmap")
    has_nmap_net_raw = has_nmap and (is_root or _has_cap_net_raw("nmap"))

    # Scan depth:
    #   full     — nmap with raw sockets: SYN scan + version detection
    #   standard — ss or /proc/net: port list + process names, no version detection
    #   minimal  — /proc/net only: port list, no process names, no version detection
    if has_nmap_net_raw:
        scan_depth = "full"
    elif cmd("ss") or readable("/proc/net/tcp"):
        scan_depth = "standard"
    else:
        scan_depth = "minimal"

    return CapabilityProfile(
        is_root          = is_root,
        euid             = euid,
        has_nmap         = has_nmap,
        has_nmap_net_raw = has_nmap_net_raw,
        has_ss           = cmd("ss"),
        has_ip           = cmd("ip"),
        has_iptables     = cmd("iptables"),
        has_nft          = cmd("nft"),
        has_ufw          = cmd("ufw"),
        has_systemctl    = cmd("systemctl"),
        has_pacman       = cmd("pacman"),
        has_apt          = cmd("apt"),
        has_rpm          = cmd("rpm"),
        has_journalctl   = cmd("journalctl"),
        has_proc_net     = readable("/proc/net/tcp"),
        has_proc_sys     = readable("/proc/sys/kernel/randomize_va_space"),
        has_etc_shadow   = readable("/etc/shadow"),
        has_etc_sudoers  = readable("/etc/sudoers"),
        scan_depth       = scan_depth,
    )


def _has_cap_net_raw(binary: str) -> bool:
    """Check if a binary has the cap_net_raw Linux capability set."""
    path = shutil.which(binary)
    if not path or not shutil.which("getcap"):
        return False
    try:
        result = subprocess.run(
            ["getcap", path],
            capture_output=True, text=True, timeout=3,
        )
        return "cap_net_raw" in result.stdout
    except Exception:
        return False
