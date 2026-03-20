"""
SCOPE Engine — Preflight checks.

Runs before every assessment. Detects capabilities, validates module
prerequisites, and identifies what will be skipped — before the scan starts.

The preflight result is streamed to the UI as the first SSE events so the user
knows exactly what coverage they will get before results start arriving.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from engine.capabilities import CapabilityProfile, detect_capabilities


@dataclass
class PreflightResult:
    passed:             bool
    scan_depth:         str            # "full" | "standard" | "minimal"
    warnings:           list[str]      = field(default_factory=list)
    errors:             list[str]      = field(default_factory=list)
    skipped_modules:    list[str]      = field(default_factory=list)
    capability_profile: CapabilityProfile | None = None

    def to_sse_lines(self) -> list[tuple[str, str]]:
        """
        Return a list of (event_type, message) tuples for SSE streaming.
        Event types: "preflight_info" | "preflight_warn" | "preflight_error"
        """
        lines: list[tuple[str, str]] = []
        caps = self.capability_profile

        depth_note = {
            "full":     "nmap + raw sockets — version detection enabled",
            "standard": "ss + /proc/net — port list + process names",
            "minimal":  "/proc/net only — basic port enumeration, no process names",
        }.get(self.scan_depth, self.scan_depth)

        lines.append(("preflight_info", f"Scan depth: {self.scan_depth.upper()} — {depth_note}"))

        if caps:
            priv = "root" if caps.is_root else f"UID {caps.euid} (non-root)"
            shadow = "readable" if caps.has_etc_shadow else "not readable"

            tool_status = "  ".join(
                f"{'✓' if ok else '✗'} {name}"
                for name, ok in [
                    ("nmap",      caps.has_nmap),
                    ("ss",        caps.has_ss),
                    ("iptables",  caps.has_iptables),
                    ("nft",       caps.has_nft),
                    ("ufw",       caps.has_ufw),
                    ("systemctl", caps.has_systemctl),
                ]
            )
            lines.append(("preflight_info", f"Privilege: {priv}  |  /etc/shadow: {shadow}"))
            lines.append(("preflight_info", f"Tools: {tool_status}"))

        for w in self.warnings:
            lines.append(("preflight_warn", w))

        for e in self.errors:
            lines.append(("preflight_error", e))

        for s in self.skipped_modules:
            lines.append(("preflight_info", f"Skipping {s}"))

        return lines


def run_preflight(module_names: list[str]) -> PreflightResult:
    """
    Detect capabilities and validate every module in the upcoming run.
    Returns a PreflightResult that the runner streams before executing modules.
    """
    from engine.registry import REGISTRY

    caps     = detect_capabilities()
    warnings: list[str] = []
    errors:   list[str] = []
    skipped:  list[str] = []

    # ── Privilege advisory ────────────────────────────────────────────────────
    if not caps.is_root:
        warnings.append(
            "Running as non-root — modules needing /etc/shadow, raw sockets, "
            "or privileged reads will be skipped"
        )

    # ── Kernel interface checks ───────────────────────────────────────────────
    if not caps.has_proc_net:
        errors.append(
            "/proc/net/tcp is not readable — network port scanning unavailable"
        )

    # ── Disk space for logs ───────────────────────────────────────────────────
    try:
        st = os.statvfs("/tmp")
        free_mb = (st.f_bavail * st.f_frsize) // (1024 * 1024)
        if free_mb < 10:
            errors.append(f"/tmp has only {free_mb} MB free — scan logs may fail to write")
    except OSError:
        pass

    # ── Per-module validation ─────────────────────────────────────────────────
    for mod_name in module_names:
        check_cls = REGISTRY.get(mod_name)
        if check_cls is None:
            errors.append(f"Unknown module: {mod_name}")
            continue

        check = check_cls()
        if check.requires_root and not caps.is_root:
            skipped.append(f"{mod_name} (requires root)")
        elif not check.is_available():
            skipped.append(f"{mod_name} (required tool or file not found)")

    return PreflightResult(
        passed             = len(errors) == 0,
        scan_depth         = caps.scan_depth,
        warnings           = warnings,
        errors             = errors,
        skipped_modules    = skipped,
        capability_profile = caps,
    )
