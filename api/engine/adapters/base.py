"""
SCOPE Engine — Adapter base class.

An adapter is a thin, single-responsibility wrapper around one data source
(a tool, a kernel interface, a file). It:
  1. Confirms the source is available
  2. Collects raw data
  3. Normalizes it into PortRecord objects
  4. Raises ToolUnavailableError or ToolParseError on failure

Adapters do NOT make security judgements — that is the module's job.
"""
from __future__ import annotations

import shutil
from abc import ABC, abstractmethod

from engine.scan_models import PortRecord


class ToolUnavailableError(Exception):
    """Raised when a required external tool is not installed on PATH."""
    pass


class ToolParseError(Exception):
    """Raised when a tool produces output that cannot be parsed."""
    pass


class PortAdapter(ABC):
    """Base class for all port/service enumeration adapters."""

    tool_name: str = ""   # binary name; empty string = no external tool needed

    def is_available(self) -> bool:
        """Return True if this adapter can run on the current system."""
        if not self.tool_name:
            return True   # pure-Python adapters are always available
        return shutil.which(self.tool_name) is not None

    @abstractmethod
    def enumerate_ports(self) -> list[PortRecord]:
        """
        Collect and return all detected listening ports as normalized PortRecords.
        Raise ToolUnavailableError if the tool is missing.
        Raise ToolParseError if the output cannot be parsed.
        Never return partial results silently — raise on failure.
        """
        ...
