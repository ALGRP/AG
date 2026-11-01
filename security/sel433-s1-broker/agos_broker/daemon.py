"""agos-broker entry point.

  python3 -m agos_broker.daemon --config /etc/agos-broker/broker.json
  python3 -m agos_broker.daemon --config ... --check   # preflight only

Runs as the broker UID (never root). Refuses to start on any preflight
problem. SIGTERM/SIGINT: stop accepting, finish in-flight requests, remove
sockets, exit 0. Signals readiness via $NOTIFY_SOCKET when present
(systemd Type=notify) and optionally a --ready-file (lab harness).
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import socket
import sys
import threading

from agos_broker import config as cfgmod
from agos_broker.keyring import Keyring
from agos_broker.service import BoardService


def sd_notify(msg: str) -> None:
    addr = os.environ.get("NOTIFY_SOCKET")
    if not addr:
        return
    if addr.startswith("@"):
        addr = "\0" + addr[1:]
    s = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
    try:
        s.sendto(msg.encode(), addr)
    finally:
        s.close()


def build(cfg: cfgmod.Config, **service_kw) -> list[BoardService]:
    keyring = Keyring(cfg.iss, cfg.keys, cfg.revoked_kids)
    return [BoardService(b, keyring, max_inflight=cfg.max_inflight_per_board,
                         read_timeout=cfg.read_timeout, **service_kw)
            for b in cfg.boards]


def main(argv: list[str] | None = None, *, service_factory=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--ready-file")
    a = ap.parse_args(argv)
    os.umask(0o077)
    cfg = cfgmod.load(a.config)
    problems = cfgmod.preflight(cfg)
    if problems:
        print(json.dumps({"preflight": "FAIL", "problems": problems}), file=sys.stderr)
        return 3
    if a.check:
        print(json.dumps({"preflight": "OK", "boards": [b.board for b in cfg.boards]}))
        return 0
    services = (service_factory or build)(cfg)
    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    started = []
    try:
        for s in services:
            s.start()
            started.append(s)
        if a.ready_file:
            with open(a.ready_file, "w") as fh:
                fh.write(f"{os.getpid()} uid={os.geteuid()}\n")
        sd_notify("READY=1\nSTATUS=serving " + ",".join(b.board for b in cfg.boards))
        while not stop.wait(1.0):
            pass
        sd_notify("STOPPING=1")
    finally:
        for s in started:
            s.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
