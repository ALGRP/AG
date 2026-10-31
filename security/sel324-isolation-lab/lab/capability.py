"""Ed25519-signed, peer-UID-bound, single-use capability token.

Shape follows the SEL-433 broker contract:
  iss, kid, sub_uid, tenant, project, board, task, run_id, action,
  nonce, iat, exp (<= 600s)

Design notes relevant to the SEC-01 findings:
  * The token is signed over the CANONICAL BYTES, and verification re-parses
    with a duplicate-member-rejecting hook, so a payload carrying
    {"board":"A","board":"B"} cannot mean one board to the signer and another
    to the verifier.
  * `sub_uid` binds the token to one kernel-reported peer UID. A leaked token
    is useless to a different UID because the broker compares against
    SO_PEERCRED, not against anything the caller sends.
  * Keys here are EPHEMERAL, generated per lab run. No key material is
    committed or persisted beyond the throwaway run directory.
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, asdict
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

MAX_TTL_SECONDS = 600


class CapabilityError(Exception):
    """Fail-closed rejection. The message is the control-relevant reason."""


def _no_duplicate_members(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    seen: set[str] = set()
    for k, _ in pairs:
        if k in seen:
            raise CapabilityError(f"duplicate JSON member: {k}")
        seen.add(k)
    return dict(pairs)


def canonical_bytes(claims: dict[str, Any]) -> bytes:
    return json.dumps(claims, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True).encode("ascii")


@dataclass(frozen=True)
class Claims:
    iss: str
    kid: str
    sub_uid: int
    tenant: str
    project: str
    board: str
    task: str
    run_id: str
    action: str
    nonce: str
    iat: int
    exp: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class Issuer:
    """Holds the private key. In production this lives only in the broker's
    trust domain; the broker itself needs the PUBLIC key only."""

    def __init__(self, iss: str = "agos-broker", kid: str = "k1") -> None:
        self._sk = Ed25519PrivateKey.generate()
        self.iss = iss
        self.kid = kid

    def public_bytes(self) -> bytes:
        return self._sk.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )

    def mint(self, *, sub_uid: int, board: str, task: str, run_id: str,
             action: str, tenant: str = "AGOS_SYNTHETIC",
             project: str = "p_synthetic", ttl: int = 60,
             nonce: str | None = None, iat: int | None = None) -> str:
        if ttl > MAX_TTL_SECONDS:
            raise CapabilityError(f"ttl {ttl} exceeds max {MAX_TTL_SECONDS}")
        now = int(time.time()) if iat is None else iat
        claims = Claims(
            iss=self.iss, kid=self.kid, sub_uid=sub_uid, tenant=tenant,
            project=project, board=board, task=task, run_id=run_id,
            action=action, nonce=nonce or uuid.uuid4().hex,
            iat=now, exp=now + ttl,
        ).to_dict()
        payload = canonical_bytes(claims)
        sig = self._sk.sign(payload)
        return json.dumps({"payload": payload.decode("ascii"),
                           "sig": sig.hex()}, separators=(",", ":"))

    def mint_raw(self, payload: str) -> str:
        """Sign an arbitrary payload string verbatim -- used only to build the
        duplicate-JSON-member attack token."""
        sig = self._sk.sign(payload.encode("ascii"))
        return json.dumps({"payload": payload, "sig": sig.hex()},
                          separators=(",", ":"))


class Verifier:
    """Broker-side verification. Public key only."""

    def __init__(self, public_key: bytes, iss: str = "agos-broker",
                 kid: str = "k1") -> None:
        self._pk: Ed25519PublicKey = Ed25519PublicKey.from_public_bytes(
            public_key)
        self.iss = iss
        self.kid = kid

    def verify(self, token: str, *, peer_uid: int, board: str,
               now: int | None = None) -> dict[str, Any]:
        """Fail closed. Returns claims only when EVERY check passes."""
        now = int(time.time()) if now is None else now
        try:
            env = json.loads(token, object_pairs_hook=_no_duplicate_members)
        except CapabilityError:
            raise
        except Exception as exc:
            raise CapabilityError(f"malformed envelope: {exc}") from exc
        if not isinstance(env, dict) or "payload" not in env or "sig" not in env:
            raise CapabilityError("envelope missing payload/sig")

        payload = env["payload"]
        if not isinstance(payload, str):
            raise CapabilityError("payload must be a string")
        try:
            sig = bytes.fromhex(env["sig"])
        except Exception as exc:
            raise CapabilityError(f"signature not hex: {exc}") from exc

        # Signature FIRST, over the exact bytes, before any claim is trusted.
        try:
            self._pk.verify(sig, payload.encode("ascii"))
        except InvalidSignature as exc:
            raise CapabilityError("invalid signature") from exc
        except Exception as exc:
            raise CapabilityError(f"signature check failed: {exc}") from exc

        claims = json.loads(payload, object_pairs_hook=_no_duplicate_members)
        required = {"iss", "kid", "sub_uid", "tenant", "project", "board",
                    "task", "run_id", "action", "nonce", "iat", "exp"}
        missing = required - set(claims)
        if missing:
            raise CapabilityError(f"missing claims: {sorted(missing)}")

        if claims["iss"] != self.iss:
            raise CapabilityError("issuer mismatch")
        if claims["kid"] != self.kid:
            raise CapabilityError("key id mismatch")
        if not isinstance(claims["sub_uid"], int) or isinstance(
                claims["sub_uid"], bool):
            raise CapabilityError("sub_uid must be an integer")
        if claims["sub_uid"] != peer_uid:
            raise CapabilityError(
                f"peer uid mismatch: token binds {claims['sub_uid']}, "
                f"kernel reports {peer_uid}")
        if claims["board"] != board:
            raise CapabilityError(
                f"board mismatch: token binds {claims['board']}, "
                f"socket serves {board}")
        for field in ("iat", "exp"):
            if not isinstance(claims[field], int) or isinstance(
                    claims[field], bool):
                raise CapabilityError(f"{field} must be an integer")
        if claims["exp"] <= claims["iat"]:
            raise CapabilityError("exp not after iat")
        if claims["exp"] - claims["iat"] > MAX_TTL_SECONDS:
            raise CapabilityError("ttl exceeds policy maximum")
        if now >= claims["exp"]:
            raise CapabilityError("capability expired")
        if now + 5 < claims["iat"]:
            raise CapabilityError("capability not yet valid")
        if not isinstance(claims["nonce"], str) or len(claims["nonce"]) < 16:
            raise CapabilityError("nonce too short")
        return claims
