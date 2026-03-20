"""
SCOPE Terminal — FastAPI router

Endpoints:
  POST   /api/terminal/sessions          create a new PTY session
  DELETE /api/terminal/sessions/{sid}    terminate a session
  GET    /api/terminal/sessions          list active sessions
  WS     /api/ws/terminal/{sid}          bidirectional PTY bridge

Wire protocol (WebSocket, binary frames):
  Browser → backend:
    Regular input:  raw bytes (keystrokes, paste)
    Resize command: 0xFF prefix + JSON {"type":"resize","cols":N,"rows":N}

  Backend → browser:
    Raw PTY output bytes (ANSI sequences, text, etc.)

Security:
  - Origin checked against localhost allowlist
  - Sessions are local-only (uvicorn binds to 127.0.0.1)
  - Max 3 concurrent sessions enforced in manager
"""
from __future__ import annotations

import asyncio
import json
import os
import select
import time

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from terminal.manager import session_manager

router = APIRouter()

_ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
}

_RECONNECT_WINDOW = 60   # seconds — WS can reconnect to live session within this window


# ── REST endpoints ─────────────────────────────────────────────────────────────

class CreateSessionBody(BaseModel):
    cols: int = 220
    rows: int = 50


@router.post("/terminal/sessions", status_code=201)
async def create_session(body: CreateSessionBody):
    try:
        session = session_manager.create(cols=body.cols, rows=body.rows)
    except RuntimeError as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    return {
        "sid": session.sid,
        "cols": session.cols,
        "rows": session.rows,
        "log_path": session.log_path,
        "running_as_root": os.geteuid() == 0,
    }


@router.delete("/terminal/sessions/{sid}", status_code=204)
async def terminate_session(sid: str):
    session_manager.terminate(sid)


@router.get("/terminal/sessions")
async def list_sessions():
    return session_manager.list_sessions()


# ── WebSocket PTY bridge ───────────────────────────────────────────────────────

@router.websocket("/ws/terminal/{sid}")
async def terminal_ws(websocket: WebSocket, sid: str):
    # Origin check — reject non-localhost connections
    origin = websocket.headers.get("origin", "")
    if origin and origin not in _ALLOWED_ORIGINS:
        await websocket.close(code=4403)
        return

    session = session_manager.get(sid)
    if not session:
        await websocket.close(code=4404)
        return
    if not session.is_alive():
        session_manager.terminate(sid)
        await websocket.close(code=4410)
        return

    await websocket.accept()

    log_fh = open(session.log_path, "ab")

    async def pty_to_ws() -> None:
        """Read PTY master output → send to browser as binary frames."""
        loop = asyncio.get_running_loop()
        try:
            while True:
                readable, _, _ = await loop.run_in_executor(
                    None, select.select, [session.master_fd], [], [], 0.04
                )
                if readable:
                    try:
                        data = os.read(session.master_fd, 4096)
                    except OSError:
                        break
                    if not data:
                        break
                    log_fh.write(data)
                    log_fh.flush()
                    await websocket.send_bytes(data)
                    session.last_active = time.time()
        except Exception:
            pass

    async def ws_to_pty() -> None:
        """Read browser input → write to PTY master."""
        try:
            async for message in websocket.iter_bytes():
                if not session.is_alive():
                    break

                # Resize frame: 0xFF prefix + JSON body
                if len(message) > 1 and message[0] == 0xFF:
                    try:
                        cmd = json.loads(message[1:].decode("utf-8", errors="replace"))
                        if cmd.get("type") == "resize":
                            session.resize(
                                int(cmd.get("cols", session.cols)),
                                int(cmd.get("rows", session.rows)),
                            )
                    except Exception:
                        pass
                    continue

                try:
                    os.write(session.master_fd, message)
                    session.last_active = time.time()
                except OSError:
                    break
        except (WebSocketDisconnect, Exception):
            pass

    task_read = asyncio.create_task(pty_to_ws())
    task_write = asyncio.create_task(ws_to_pty())

    try:
        _done, pending = await asyncio.wait(
            [task_read, task_write],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    finally:
        log_fh.close()
        try:
            await websocket.close()
        except Exception:
            pass

        # If shell has exited, clean up the session entirely
        if not session.is_alive():
            session_manager.terminate(sid)
