"""Broker entry point. Launched as the REAL broker UID via setpriv.

argv[1] is a JSON config:
  {"boards": [{"board","db_path","sock_path","bound_uid","worker_gid",
               "ledger_path" (legacy config field; ledger now in db_path)}],
   "public_key_hex": "...", "ready_file": "...", "stop_file": "..."}

It holds only the issuer PUBLIC key -- never the signing key.
"""
from __future__ import annotations

import json
import os
import sys
import time

from lab.approach_c_broker import BoardBroker
from lab.capability import Verifier
from lab.nonce_ledger import NonceLedger


def main() -> None:
    cfg = json.loads(sys.argv[1])
    verifier = Verifier(bytes.fromhex(cfg["public_key_hex"]))
    brokers = []
    for b in cfg["boards"]:
        broker = BoardBroker(
            board=b["board"], db_path=b["db_path"], sock_path=b["sock_path"],
            bound_uid=b["bound_uid"], verifier=verifier,
            ledger=NonceLedger(b["db_path"]), worker_gid=b["worker_gid"],
            manage_dir=False,
        )
        broker.start()
        brokers.append(broker)

    with open(cfg["ready_file"], "w") as fh:
        fh.write(f"{os.getpid()} uid={os.getuid()}\n")

    try:
        while not os.path.exists(cfg["stop_file"]):
            time.sleep(0.1)
    finally:
        for broker in brokers:
            broker.stop()


if __name__ == "__main__":
    main()
