"""
SCOPE Engine — Module registry.

All audit check classes are registered here.
Import order determines nothing; the registry is keyed by check.name.
"""
from __future__ import annotations

from engine.base import BaseCheck
from engine.modules.system.kernel_params import KernelParamsCheck
from engine.modules.system.user_accounts import UserAccountsCheck
from engine.modules.system.file_permissions import FilePermissionsCheck
from engine.modules.network.open_ports import OpenPortsCheck
from engine.modules.network.firewall_state import FirewallStateCheck
from engine.modules.auth.ssh_config import SshConfigCheck
from engine.modules.auth.pam_config import PamConfigCheck
from engine.modules.software.package_versions import PackageVersionsCheck
from engine.modules.software.service_config import ServiceConfigCheck
from engine.modules.secrets.env_files import EnvFilesCheck
from engine.modules.secrets.key_files import KeyFilesCheck

_ALL_CHECKS: list[type[BaseCheck]] = [
    KernelParamsCheck,
    UserAccountsCheck,
    FilePermissionsCheck,
    OpenPortsCheck,
    FirewallStateCheck,
    SshConfigCheck,
    PamConfigCheck,
    PackageVersionsCheck,
    ServiceConfigCheck,
    EnvFilesCheck,
    KeyFilesCheck,
]

# Map dotted name → check class
REGISTRY: dict[str, type[BaseCheck]] = {cls.name: cls for cls in _ALL_CHECKS}
