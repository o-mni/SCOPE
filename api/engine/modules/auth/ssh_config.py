"""
SCOPE Module — auth.ssh_config

Parses /etc/ssh/sshd_config and audits SSH daemon settings against
CIS Benchmark and OpenSSH hardening guidance.

No external binaries — direct file parsing only.
"""
from __future__ import annotations

import re
from pathlib import Path

from engine.base import BaseCheck, CheckFinding


_SSHD_CONFIG = Path("/etc/ssh/sshd_config")
_SSHD_CONFIG_D = Path("/etc/ssh/sshd_config.d")

# Ciphers / MACs / KexAlgorithms considered weak
_WEAK_CIPHERS = {
    "3des-cbc", "aes128-cbc", "aes192-cbc", "aes256-cbc",
    "arcfour", "arcfour128", "arcfour256", "blowfish-cbc",
    "cast128-cbc", "rijndael-cbc@lysator.liu.se",
}
_WEAK_MACS = {
    "hmac-md5", "hmac-md5-96", "hmac-sha1", "hmac-sha1-96",
    "umac-64@openssh.com", "hmac-md5-etm@openssh.com",
    "hmac-md5-96-etm@openssh.com", "hmac-sha1-etm@openssh.com",
    "hmac-sha1-96-etm@openssh.com", "umac-64-etm@openssh.com",
}


def _parse_config(path: Path) -> dict[str, str]:
    """
    Parse an sshd_config-style file.
    Returns a dict of lowercase_key → last_seen_value.
    Handles Include directives by reading referenced files.
    """
    result: dict[str, str] = {}
    if not path.exists():
        return result
    try:
        text = path.read_text(errors="replace")
    except PermissionError:
        return result

    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            continue
        key, value = parts[0].lower(), parts[1].strip()
        if key == "include":
            # Handle Include glob
            import glob
            for inc_path in sorted(glob.glob(value)):
                inc = _parse_config(Path(inc_path))
                result.update(inc)
        else:
            result[key] = value

    return result


def _load_full_config() -> dict[str, str]:
    cfg = _parse_config(_SSHD_CONFIG)
    # Also read sshd_config.d/ drop-ins
    if _SSHD_CONFIG_D.is_dir():
        for drop_in in sorted(_SSHD_CONFIG_D.glob("*.conf")):
            cfg.update(_parse_config(drop_in))
    return cfg


class SshConfigCheck(BaseCheck):
    name = "auth.ssh_config"
    description = "SSH daemon configuration audit"
    requires_root = False

    def is_available(self) -> bool:
        return _SSHD_CONFIG.exists()

    def run(self) -> list[CheckFinding]:
        findings: list[CheckFinding] = []
        cfg = _load_full_config()

        if not cfg:
            return findings

        # ── 1. PermitRootLogin ────────────────────────────────────────────────
        root_login = cfg.get("permitrootlogin", "yes")  # default is yes in old versions
        if root_login.lower() not in ("no", "prohibit-password", "forced-commands-only"):
            findings.append(CheckFinding(
                severity="critical",
                title="SSH permits direct root login",
                category="Authentication",
                description="PermitRootLogin is set to 'yes' or not restricted. "
                            "Direct root SSH access bypasses audit trails and reduces "
                            "the work an attacker needs to do after gaining SSH access.",
                evidence=f"/etc/ssh/sshd_config — PermitRootLogin {root_login}",
                remediation_simple="Disable direct root login. Use a normal user account with sudo.",
                remediation_technical="/etc/ssh/sshd_config: PermitRootLogin no\nsystemctl restart sshd",
            ))

        # ── 2. PasswordAuthentication ─────────────────────────────────────────
        passwd_auth = cfg.get("passwordauthentication", "yes")
        if passwd_auth.lower() != "no":
            findings.append(CheckFinding(
                severity="high",
                title="SSH password authentication enabled",
                category="Authentication",
                description="PasswordAuthentication is not disabled. Password-based SSH logins "
                            "are vulnerable to brute-force and credential-stuffing attacks. "
                            "Public-key authentication is significantly more secure.",
                evidence=f"/etc/ssh/sshd_config — PasswordAuthentication {passwd_auth}",
                remediation_simple="Disable password auth and use SSH key pairs exclusively.",
                remediation_technical="/etc/ssh/sshd_config: PasswordAuthentication no\n"
                                      "# Ensure all users have authorized_keys configured first!\n"
                                      "systemctl restart sshd",
            ))

        # ── 3. PermitEmptyPasswords ───────────────────────────────────────────
        empty_pw = cfg.get("permitemptypasswords", "no")
        if empty_pw.lower() == "yes":
            findings.append(CheckFinding(
                severity="critical",
                title="SSH permits empty passwords",
                category="Authentication",
                description="PermitEmptyPasswords is enabled. Accounts with no password set "
                            "can authenticate via SSH without any credential.",
                evidence=f"/etc/ssh/sshd_config — PermitEmptyPasswords {empty_pw}",
                remediation_simple="Disable empty password authentication immediately.",
                remediation_technical="/etc/ssh/sshd_config: PermitEmptyPasswords no\nsystemctl restart sshd",
            ))

        # ── 4. MaxAuthTries ───────────────────────────────────────────────────
        try:
            max_auth = int(cfg.get("maxauthtries", "6"))
        except ValueError:
            max_auth = 6
        if max_auth > 4:
            findings.append(CheckFinding(
                severity="medium",
                title="SSH MaxAuthTries is too high",
                category="Configuration",
                description=f"MaxAuthTries is set to {max_auth}. A high value allows more "
                            "authentication attempts per connection, making brute-force attacks easier.",
                evidence=f"/etc/ssh/sshd_config — MaxAuthTries {max_auth}",
                remediation_simple="Reduce MaxAuthTries to 3 or 4.",
                remediation_technical="/etc/ssh/sshd_config: MaxAuthTries 3\nsystemctl restart sshd",
            ))

        # ── 5. ClientAliveInterval (idle timeout) ─────────────────────────────
        try:
            idle_interval = int(cfg.get("clientaliveinterval", "0"))
        except ValueError:
            idle_interval = 0
        if idle_interval == 0:
            findings.append(CheckFinding(
                severity="medium",
                title="SSH has no idle session timeout",
                category="Configuration",
                description="ClientAliveInterval is 0 (disabled). Idle SSH sessions are never "
                            "terminated, leaving unattended sessions open indefinitely.",
                evidence="/etc/ssh/sshd_config — ClientAliveInterval 0 (no timeout)",
                remediation_simple="Set an idle timeout to automatically disconnect inactive sessions.",
                remediation_technical="/etc/ssh/sshd_config:\n"
                                      "ClientAliveInterval 300\n"
                                      "ClientAliveCountMax 2\n"
                                      "systemctl restart sshd",
            ))

        # ── 6. X11Forwarding ──────────────────────────────────────────────────
        x11 = cfg.get("x11forwarding", "no")
        if x11.lower() == "yes":
            findings.append(CheckFinding(
                severity="low",
                title="SSH X11 forwarding enabled",
                category="Configuration",
                description="X11Forwarding is enabled. X11 forwarding can be used to "
                            "conduct attacks against X display servers. Disable unless required.",
                evidence=f"/etc/ssh/sshd_config — X11Forwarding {x11}",
                remediation_simple="Disable X11 forwarding if not explicitly required.",
                remediation_technical="/etc/ssh/sshd_config: X11Forwarding no\nsystemctl restart sshd",
            ))

        # ── 7. Banner ─────────────────────────────────────────────────────────
        banner = cfg.get("banner", "none")
        if banner.lower() in ("none", ""):
            findings.append(CheckFinding(
                severity="low",
                title="SSH login banner not configured",
                category="Configuration",
                description="No SSH warning banner is displayed to connecting users. "
                            "A legal notice banner establishes that access is authorised only "
                            "and provides a basis for prosecution.",
                evidence="/etc/ssh/sshd_config — Banner not set",
                remediation_simple="Configure a legal warning banner shown before login.",
                remediation_technical="echo 'Authorised access only. All activity is monitored.' > /etc/ssh/banner\n"
                                      "/etc/ssh/sshd_config: Banner /etc/ssh/banner\n"
                                      "systemctl restart sshd",
            ))

        # ── 8. Weak ciphers ───────────────────────────────────────────────────
        ciphers_val = cfg.get("ciphers", "")
        if ciphers_val:
            configured_ciphers = {c.strip().lower() for c in ciphers_val.split(",")}
            weak_found = configured_ciphers & _WEAK_CIPHERS
            if weak_found:
                findings.append(CheckFinding(
                    severity="high",
                    title="SSH configured with weak cipher suites",
                    category="Cryptography",
                    description="The SSH daemon is configured to advertise deprecated or broken "
                                "cipher algorithms. These can be exploited to decrypt SSH sessions.",
                    evidence=f"Weak ciphers in use: {', '.join(sorted(weak_found))}",
                    remediation_simple="Restrict SSH ciphers to modern, approved algorithms.",
                    remediation_technical="/etc/ssh/sshd_config:\n"
                                          "Ciphers chacha20-poly1305@openssh.com,"
                                          "aes256-gcm@openssh.com,aes128-gcm@openssh.com,"
                                          "aes256-ctr,aes192-ctr,aes128-ctr\n"
                                          "systemctl restart sshd",
                ))

        # ── 9. Weak MACs ──────────────────────────────────────────────────────
        macs_val = cfg.get("macs", "")
        if macs_val:
            configured_macs = {m.strip().lower() for m in macs_val.split(",")}
            weak_macs_found = configured_macs & _WEAK_MACS
            if weak_macs_found:
                findings.append(CheckFinding(
                    severity="medium",
                    title="SSH configured with weak MAC algorithms",
                    category="Cryptography",
                    description="The SSH daemon accepts deprecated MAC algorithms including MD5 or SHA-1 "
                                "based MACs, which are cryptographically weak.",
                    evidence=f"Weak MACs in use: {', '.join(sorted(weak_macs_found))}",
                    remediation_simple="Restrict SSH MACs to modern, approved algorithms.",
                    remediation_technical="/etc/ssh/sshd_config:\n"
                                          "MACs hmac-sha2-512-etm@openssh.com,"
                                          "hmac-sha2-256-etm@openssh.com,"
                                          "umac-128-etm@openssh.com\n"
                                          "systemctl restart sshd",
                ))

        # ── 10. AllowAgentForwarding ──────────────────────────────────────────
        agent_fwd = cfg.get("allowagentforwarding", "yes")
        if agent_fwd.lower() == "yes":
            findings.append(CheckFinding(
                severity="low",
                title="SSH agent forwarding enabled",
                category="Configuration",
                description="AllowAgentForwarding is enabled. If users forward their SSH agent "
                            "to a compromised intermediate host, an attacker on that host can use "
                            "the forwarded agent to authenticate to other systems.",
                evidence=f"/etc/ssh/sshd_config — AllowAgentForwarding {agent_fwd}",
                remediation_simple="Disable agent forwarding unless specifically needed.",
                remediation_technical="/etc/ssh/sshd_config: AllowAgentForwarding no\nsystemctl restart sshd",
            ))

        return findings
