"""Length-prefixed JSON framing and kernel peer credentials.

Same wire contract as the lab broker (lab/approach_c_broker.py): 4-byte
big-endian length, JSON body, hard maximum, EOF mid-frame is an error.
The request body is parsed with duplicate-member rejection so a request
cannot carry two different `capability` or `args` members.
"""
from __future__ import annotations

import json
import socket
import struct
from typing import Any

MAX_FRAME = 64 * 1024


class FramingError(ValueError):
    pass


def _no_dup(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    seen: set[str] = set()
    for k, _ in pairs:
        if k in seen:
            raise FramingError(f"duplicate JSON member in request: {k}")
        seen.add(k)
    return dict(pairs)


def send_frame(sock: socket.socket, obj: dict) -> None:
    body = json.dumps(obj, separators=(",", ":")).encode()
    if len(body) > MAX_FRAME:
        raise FramingError("reply exceeds frame limit")
    sock.sendall(struct.pack(">I", len(body)) + body)


def _recv_exact(sock: socket.socket, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise FramingError("unexpected EOF mid-frame")
        buf += chunk
    return bytes(buf)


def recv_frame(sock: socket.socket) -> dict:
    (length,) = struct.unpack(">I", _recv_exact(sock, 4))
    if length == 0 or length > MAX_FRAME:
        raise FramingError(f"frame length out of policy: {length}")
    try:
        obj = json.loads(_recv_exact(sock, length), object_pairs_hook=_no_dup)
    except FramingError:
        raise
    except Exception as exc:
        raise FramingError(f"malformed JSON frame: {type(exc).__name__}") from exc
    if not isinstance(obj, dict):
        raise FramingError("frame must be a JSON object")
    return obj


def peer_cred(conn: socket.socket) -> tuple[int, int, int]:
    """(pid, uid, gid) as reported by the kernel (Linux SO_PEERCRED)."""
    raw = conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED,
                          struct.calcsize("3i"))
    return struct.unpack("3i", raw)


def call(sock_path: str, request: dict, timeout: float = 10.0) -> dict:
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect(sock_path)
        send_frame(s, request)
        return recv_frame(s)
    finally:
        s.close()
