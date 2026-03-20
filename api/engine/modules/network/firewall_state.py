"""
SCOPE Module — network.firewall_state

Checks whether a host-based firewall is active and configured.
Supports: ufw, iptables, nftables.

Does NOT modify any firewall state — read-only inspection only.
"""
from __future__ import annotations

import subprocess

from engine.base import BaseCheck, CheckFinding


def _run(cmd: list[str], timeout: int = 10) -> tuple[int, str, str]:
    """Run a command and return (returncode, stdout, stderr)."""
    try:
        r = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
        )
        return r.returncode, r.stdout, r.stderr
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return -1, "", ""


def _check_ufw() -> tuple[bool, str]:
    """Return (is_active, status_line)."""
    rc, stdout, _ = _run(["ufw", "status"])
    if rc == -1:
        return False, "ufw not found"
    first_line = stdout.strip().splitlines()[0] if stdout.strip() else ""
    active = "active" in first_line.lower() and "inactive" not in first_line.lower()
    return active, first_line


def _check_iptables() -> tuple[bool, int]:
    """Return (has_rules, rule_count). has_rules = True if non-default rules exist."""
    rc, stdout, _ = _run(["iptables", "-L", "-n", "--line-numbers"])
    if rc != 0:
        return False, 0
    lines = stdout.splitlines()
    # Count non-chain-header, non-empty, non-"policy ACCEPT" lines
    rule_lines = [
        l for l in lines
        if l.strip()
        and not l.startswith("Chain")
        and not l.startswith("target")
        and not l.startswith("num")
    ]
    return len(rule_lines) > 0, len(rule_lines)


def _check_nftables() -> tuple[bool, int]:
    """Return (has_rules, rule_count)."""
    rc, stdout, _ = _run(["nft", "list", "ruleset"])
    if rc != 0:
        return False, 0
    rule_lines = [l for l in stdout.splitlines() if l.strip() and not l.strip().startswith("#")]
    # A minimal nftables config has at least a table + chain definition
    return len(rule_lines) > 3, len(rule_lines)


class FirewallStateCheck(BaseCheck):
    name = "network.firewall_state"
    description = "Host-based firewall status check (ufw, iptables, nftables)"
    requires_root = False   # ufw status works as user; iptables -L needs root on some distros

    def run(self) -> list[CheckFinding]:
        findings: list[CheckFinding] = []

        has_ufw = self._which("ufw")
        has_iptables = self._which("iptables")
        has_nft = self._which("nft")

        ufw_active = False
        iptables_has_rules = False
        nft_has_rules = False

        ufw_status_line = ""
        iptables_rule_count = 0
        nft_rule_count = 0

        if has_ufw:
            ufw_active, ufw_status_line = _check_ufw()

        if has_iptables:
            iptables_has_rules, iptables_rule_count = _check_iptables()

        if has_nft:
            nft_has_rules, nft_rule_count = _check_nftables()

        any_active = ufw_active or iptables_has_rules or nft_has_rules

        # ── No active firewall ─────────────────────────────────────────────────
        if not any_active:
            tools_present = []
            if has_ufw:
                tools_present.append(f"ufw: {ufw_status_line}")
            if has_iptables:
                tools_present.append(f"iptables: no rules beyond defaults ({iptables_rule_count} non-default rules)")
            if has_nft:
                tools_present.append(f"nftables: no ruleset ({nft_rule_count} lines)")
            if not tools_present:
                tools_present.append("No firewall tools (ufw, iptables, nftables) found on PATH")

            findings.append(CheckFinding(
                severity="critical",
                title="No active host-based firewall detected",
                category="Network",
                description="No host-based firewall is active. All listening services are "
                            "directly reachable from the network without any filtering. "
                            "A firewall provides a critical layer of defence-in-depth.",
                evidence="\n".join(tools_present),
                remediation_simple="Enable ufw (simplest) or configure iptables/nftables rules.",
                remediation_technical="# Using ufw (recommended for most servers):\n"
                                      "ufw default deny incoming\n"
                                      "ufw default allow outgoing\n"
                                      "ufw allow 22/tcp    # SSH — adjust as needed\n"
                                      "ufw enable\n\n"
                                      "# Persist iptables rules (alternative):\n"
                                      "# pacman -S iptables  (Arch)\n"
                                      "# systemctl enable --now iptables",
            ))
            return findings

        # ── UFW active but rules not persistent ───────────────────────────────
        if ufw_active:
            # Check if ufw is enabled to start on boot
            rc, stdout, _ = _run(["systemctl", "is-enabled", "ufw"])
            ufw_enabled_boot = (rc == 0 and "enabled" in stdout)
            if not ufw_enabled_boot:
                findings.append(CheckFinding(
                    severity="medium",
                    title="UFW firewall active but not enabled at boot",
                    category="Network",
                    description="UFW is currently active but is not configured to start automatically "
                                "at boot. The firewall will not be active after a system restart.",
                    evidence=f"ufw status: {ufw_status_line}\n"
                             f"systemctl is-enabled ufw: {stdout.strip() or 'disabled'}",
                    remediation_simple="Enable ufw to start at boot.",
                    remediation_technical="systemctl enable ufw",
                ))

        # ── iptables has rules but may not be persistent ───────────────────────
        if iptables_has_rules and not ufw_active:
            # Check if iptables service is enabled or iptables-restore file exists
            rc, stdout, _ = _run(["systemctl", "is-enabled", "iptables"])
            iptables_persistent = (rc == 0 and "enabled" in stdout)
            rules_file_exists = any([
                __import__("os").path.exists(p) for p in [
                    "/etc/iptables/rules.v4",
                    "/etc/iptables/iptables.rules",
                    "/etc/sysconfig/iptables",
                ]
            ])
            if not iptables_persistent and not rules_file_exists:
                findings.append(CheckFinding(
                    severity="medium",
                    title="iptables rules active but not persisted across reboots",
                    category="Network",
                    description=f"iptables has {iptables_rule_count} active rule(s) but no persistence "
                                "mechanism was detected. Rules will be lost on next reboot.",
                    evidence=f"iptables: {iptables_rule_count} non-default rule(s) loaded\n"
                             "No rules.v4 / iptables.rules file found\n"
                             f"systemctl is-enabled iptables: {stdout.strip() or 'not found'}",
                    remediation_simple="Save current iptables rules and enable persistence at boot.",
                    remediation_technical="# Arch Linux:\npacman -S iptables\n"
                                          "iptables-save > /etc/iptables/iptables.rules\n"
                                          "systemctl enable --now iptables\n\n"
                                          "# Debian/Ubuntu:\napt install iptables-persistent\n"
                                          "iptables-save > /etc/iptables/rules.v4",
                ))

        return findings
