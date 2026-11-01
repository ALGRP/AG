"""TEST-ONLY: run the real daemon, but SIGKILL it at a chosen point while
serving one named task. Production code has no crash hooks; this wraps the
backend from outside. Launched as the broker UID by run_s1_battery.py.

  python3 -m tests.crash_harness --crash-task T --crash-point P -- <daemon args>
"""
from __future__ import annotations

import argparse
import os
import signal
import sys

from agos_broker import daemon

POINTS = ("atomic_after_effect", "reserve_after_reserve", "reserve_after_effect")


def die() -> None:
    os.kill(os.getpid(), signal.SIGKILL)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--crash-task", required=True)
    ap.add_argument("--crash-point", choices=POINTS, required=True)
    a, rest = ap.parse_known_args()
    rest = [x for x in rest if x != "--"]

    def factory(cfg):
        services = daemon.build(cfg)
        for svc in services:
            be = svc.backend
            if a.crash_point == "atomic_after_effect" and be.mode == "atomic":
                orig = be.apply_atomic
                def wrapped(conn, claims, args, _o=orig):
                    r = _o(conn, claims, args)
                    if claims["task"] == a.crash_task:
                        die()          # effect executed, COMMIT never reached
                    return r
                be.apply_atomic = wrapped
            elif a.crash_point.startswith("reserve_") and be.mode == "reserve":
                orig = be.apply_reserved
                def wrapped(claims, args, _o=orig):
                    if claims["task"] == a.crash_task and \
                            a.crash_point == "reserve_after_reserve":
                        die()          # nonce reserved+committed, no effect
                    r = _o(claims, args)
                    if claims["task"] == a.crash_task:
                        die()          # effect committed, nonce not marked
                    return r
                be.apply_reserved = wrapped
        return services

    return daemon.main(rest, service_factory=factory)


if __name__ == "__main__":
    sys.exit(main())
