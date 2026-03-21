"""
SCOPE Engine — Domain definitions.

Single source of truth for:
  - Coverage domains (grouping of modules)
  - MODULE_TO_DOMAIN reverse lookup
  - Built-in assessment templates

All modules in the registry must appear in exactly one domain.
New modules added to the registry should be added here too.
"""
from __future__ import annotations

DOMAINS: list[dict] = [
    {
        "id":          "network",
        "label":       "Network",
        "description": "Open ports, firewall posture, and exposed services",
        "icon":        "network",
        "modules":     ["network.open_ports", "network.firewall_state"],
    },
    {
        "id":          "system_hardening",
        "label":       "System Hardening",
        "description": "Kernel parameters, file permissions, and SUID binaries",
        "icon":        "shield",
        "modules":     ["system.kernel_params", "system.file_permissions"],
    },
    {
        "id":          "identity_access",
        "label":       "Identity & Access",
        "description": "User accounts, SSH configuration, and PAM policy",
        "icon":        "users",
        "modules":     ["system.user_accounts", "auth.ssh_config", "auth.pam_config"],
    },
    {
        "id":          "software_services",
        "label":       "Software & Services",
        "description": "Package update status and running service audit",
        "icon":        "layers",
        "modules":     ["software.package_versions", "software.service_config"],
    },
    {
        "id":          "secrets_keys",
        "label":       "Secrets & Keys",
        "description": "Hardcoded credentials, env files, and SSH key permissions",
        "icon":        "key",
        "modules":     ["secrets.env_files", "secrets.key_files"],
    },
]

# Flat reverse lookup: module dotted name → domain id
MODULE_TO_DOMAIN: dict[str, str] = {
    mod: d["id"]
    for d in DOMAINS
    for mod in d["modules"]
}

# Built-in assessment templates (static for MVP)
TEMPLATES: list[dict] = [
    {
        "id":          "full-baseline",
        "label":       "Full Baseline",
        "description": "All 5 domains — comprehensive CIS-aligned Linux audit",
        "modules":     [mod for d in DOMAINS for mod in d["modules"]],
    },
    {
        "id":          "web-server",
        "label":       "Web Server",
        "description": "Network exposure, credential risk, and SSH access audit",
        "modules": [
            "network.open_ports",
            "network.firewall_state",
            "auth.ssh_config",
            "secrets.env_files",
            "secrets.key_files",
        ],
    },
    {
        "id":          "ssh-hardening",
        "label":       "SSH Hardening",
        "description": "Targeted SSH configuration and key file review",
        "modules":     ["auth.ssh_config", "auth.pam_config", "secrets.key_files"],
    },
    {
        "id":          "quick-secrets",
        "label":       "Quick Secrets Scan",
        "description": "Env file and SSH key exposure only",
        "modules":     ["secrets.env_files", "secrets.key_files"],
    },
    {
        "id":          "identity-hardening",
        "label":       "Identity Hardening",
        "description": "Full identity & access domain review",
        "modules":     ["system.user_accounts", "auth.ssh_config", "auth.pam_config"],
    },
]
