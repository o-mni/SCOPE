"""
SCOPE Engine — Base classes for all audit check modules.

Every module inherits BaseCheck and implements run().
No module may write to the filesystem, open network connections,
or perform any action beyond reading local system state.
"""
from __future__ import annotations

import shutil
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class CheckFinding:
    """A single security finding produced by a check module."""

    severity: str           # critical | high | medium | low | info
    title: str
    category: str
    description: str
    evidence: str
    remediation_simple: str
    remediation_technical: str


class BaseCheck(ABC):
    """Abstract base class for all SCOPE audit modules."""

    # Subclasses must define these class attributes
    name: str           # dotted module name, e.g. "system.kernel_params"
    description: str    # one-line human description
    requires_root: bool = False

    @abstractmethod
    def run(self) -> list[CheckFinding]:
        """Execute the check and return a list of findings (empty = passed)."""
        ...

    def is_available(self) -> bool:
        """
        Return False if required system tools or files are missing.
        The runner will emit a 'skipped' event instead of calling run().
        Override in subclasses that need external binaries.
        """
        return True

    def _which(self, cmd: str) -> bool:
        """Return True if `cmd` is available on PATH."""
        return shutil.which(cmd) is not None
