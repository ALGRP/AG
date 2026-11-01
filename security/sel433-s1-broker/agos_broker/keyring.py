"""Issuer keyring: public keys only, selected by `kid`, with revocation.

The broker never holds a signing key. `kid` is read from the (still
unauthenticated) payload ONLY to choose which public key to try; every claim,
including `kid` itself, is then re-checked by the byte-identical lab Verifier
after the signature over the exact payload bytes verifies.
"""
from __future__ import annotations

import json
import re
from typing import Any

from agos_broker.capability import (CapabilityError, Verifier,
                                    _no_duplicate_members)

_RUN_ID_RE = re.compile(r"^[1-9][0-9]{0,18}$")
_SCOPE_RE = re.compile(r"^[A-Za-z0-9._:\-]{1,128}$")


class Keyring:
    def __init__(self, iss: str, keys: dict[str, str],
                 revoked: list[str] | tuple[str, ...] = ()) -> None:
        if not keys:
            raise ValueError("keyring needs at least one public key")
        self.iss = iss
        self.revoked = frozenset(revoked)
        self._verifiers = {kid: Verifier(bytes.fromhex(pub), iss=iss, kid=kid)
                           for kid, pub in keys.items()}

    def verify(self, token: str, *, peer_uid: int, board: str,
               now: int | None = None) -> dict[str, Any]:
        try:
            env = json.loads(token, object_pairs_hook=_no_duplicate_members)
            payload = env["payload"] if isinstance(env, dict) else None
            if not isinstance(payload, str):
                raise CapabilityError("envelope missing payload")
            kid = json.loads(payload,
                             object_pairs_hook=_no_duplicate_members).get("kid")
        except CapabilityError:
            raise
        except Exception as exc:
            raise CapabilityError(f"malformed envelope: {type(exc).__name__}") from exc
        if not isinstance(kid, str):
            raise CapabilityError("kid missing")
        if kid in self.revoked:
            raise CapabilityError(f"key id revoked: {kid}")
        verifier = self._verifiers.get(kid)
        if verifier is None:
            raise CapabilityError(f"unknown key id: {kid}")
        claims = verifier.verify(token, peer_uid=peer_uid, board=board, now=now)
        for field in ("tenant", "project", "task", "action"):
            if not isinstance(claims[field], str) or not _SCOPE_RE.match(claims[field]):
                raise CapabilityError(f"{field} has invalid shape")
        if not isinstance(claims["run_id"], str) or not _RUN_ID_RE.match(claims["run_id"]):
            # Hermes task_runs.id is an INTEGER; refuse anything that is not a
            # canonical positive decimal so "01" and "1" cannot alias.
            raise CapabilityError("run_id must be a canonical positive integer string")
        return claims
