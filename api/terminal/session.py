"""
SCOPE Terminal — TerminalSession dataclass

Holds the state for a single PTY shell session.
One instance per live shell process.
"""
from __future__ import annotations

import fcntl
import os
import signal
import struct
import termios
import time
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class TerminalSession:
    sid: str
    master_fd: int
    shell_pid: int
    log_path: str
    created_at: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)
    cols: int = 220
    rows: int = 50

    def resize(self, cols: int, rows: int) -> None:
        """Push a SIGWINCH-equivalent resize into the PTY via TIOCSWINSZ."""
        self.cols = max(1, cols)
        self.rows = max(1, rows)
        try:
            winsize = struct.pack("HHHH", self.rows, self.cols, 0, 0)
            fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
        except OSError:
            pass

    def is_alive(self) -> bool:
        """True if the shell process still exists (not exited, not zombie)."""
        try:
            status_path = Path(f"/proc/{self.shell_pid}/status")
            if not status_path.exists():
                return False
            for line in status_path.read_text().splitlines():
                if line.startswith("State:"):
                    # Z = zombie (shell exited, not reaped), X = dead
                    return line.split()[1] not in ("Z", "X")
            return True
        except OSError:
            return False

    def terminate(self) -> None:
        """Send SIGHUP to the shell and close the master fd."""
        try:
            os.kill(self.shell_pid, signal.SIGHUP)
        except ProcessLookupError:
            pass
        # Reap the child to avoid a zombie
        try:
            os.waitpid(self.shell_pid, os.WNOHANG)
        except ChildProcessError:
            pass
        try:
            os.close(self.master_fd)
        except OSError:
            pass
