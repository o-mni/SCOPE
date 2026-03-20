"""
SCOPE Terminal — TerminalSessionManager

Creates and manages PTY shell sessions.

Design rules enforced here:
  - Max 3 concurrent sessions (local tool — not a server)
  - Shell runs as current user — never elevated
  - SUDO_* env vars stripped so sudo context is not inherited
  - Session output logged to /tmp/scope_terminal_logs/ (mode 0700)
  - Idle sessions auto-reaped after 30 minutes
"""
from __future__ import annotations

import fcntl
import os
import pty
import subprocess
import termios
import time
import uuid
from datetime import datetime
from pathlib import Path

from terminal.session import TerminalSession

_MAX_SESSIONS = 3
_IDLE_TIMEOUT = 1800          # 30 minutes
_LOG_DIR = Path("/tmp/scope_terminal_logs")


def _ensure_log_dir() -> None:
    _LOG_DIR.mkdir(mode=0o700, exist_ok=True)
    # Tighten permissions if directory already existed
    _LOG_DIR.chmod(0o700)


class TerminalSessionManager:

    def __init__(self) -> None:
        self._sessions: dict[str, TerminalSession] = {}
        _ensure_log_dir()

    # ── Session creation ───────────────────────────────────────────────────────

    def create(self, cols: int = 220, rows: int = 50) -> TerminalSession:
        if len(self._sessions) >= _MAX_SESSIONS:
            raise RuntimeError(
                f"Maximum {_MAX_SESSIONS} concurrent sessions already active."
            )

        master_fd, slave_fd = pty.openpty()
        sid = uuid.uuid4().hex[:12]
        log_path = str(
            _LOG_DIR / f"session_{sid}_{datetime.now():%Y%m%d_%H%M%S}.log"
        )

        # Build a clean, controlled environment
        env = os.environ.copy()
        env["TERM"] = "xterm-256color"
        env["COLORTERM"] = "truecolor"
        env["SCOPE_TERMINAL"] = "1"
        for key in ("SUDO_USER", "SUDO_UID", "SUDO_GID", "SUDO_COMMAND"):
            env.pop(key, None)

        shell = env.get("SHELL", "/bin/bash")

        # Use subprocess.Popen instead of os.fork() — fork inside asyncio is unsafe.
        # preexec_fn runs in the child before exec: create new session and acquire
        # the slave PTY as the controlling terminal.
        slave_fd_capture = slave_fd  # capture for closure

        def _child_setup() -> None:
            os.setsid()
            fcntl.ioctl(slave_fd_capture, termios.TIOCSCTTY, 0)

        proc = subprocess.Popen(
            [shell, "--login"],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            close_fds=True,
            env=env,
            preexec_fn=_child_setup,
        )
        os.close(slave_fd)

        session = TerminalSession(
            sid=sid,
            master_fd=master_fd,
            shell_pid=proc.pid,
            log_path=log_path,
            cols=cols,
            rows=rows,
        )
        session.resize(cols, rows)
        self._sessions[sid] = session
        return session

    # ── Lookup and lifecycle ───────────────────────────────────────────────────

    def get(self, sid: str) -> TerminalSession | None:
        return self._sessions.get(sid)

    def terminate(self, sid: str) -> None:
        session = self._sessions.pop(sid, None)
        if session:
            session.terminate()

    def reap_idle(self) -> None:
        """Terminate sessions that are idle or whose shell has exited."""
        now = time.time()
        for sid, session in list(self._sessions.items()):
            idle_secs = now - session.last_active
            if idle_secs > _IDLE_TIMEOUT or not session.is_alive():
                self.terminate(sid)

    def list_sessions(self) -> list[dict]:
        return [
            {
                "sid": s.sid,
                "alive": s.is_alive(),
                "cols": s.cols,
                "rows": s.rows,
                "created_at": s.created_at,
                "last_active": s.last_active,
                "log_path": s.log_path,
                "running_as_root": os.geteuid() == 0,
            }
            for s in self._sessions.values()
        ]


# Module-level singleton — one manager per FastAPI process
session_manager = TerminalSessionManager()
