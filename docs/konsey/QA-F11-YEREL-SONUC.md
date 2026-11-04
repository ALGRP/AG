# QA-F11 — Site-bound sales attribution and challenge verification, LOCAL_ONLY

**Date:** 04.11.2026. **Scope:** one isolated development commit; no live/CRS/payment/Ads operations.
**Acceptance:** local TypeScript and tests only. Claude peer review and independent human review NOT DONE.

## Implemented
- Public booking requires a human token; absent/oversized tokens fail 403. A verified challenge must report `action=booking` and a hostname belonging to the **requested registered site**. `Origin` still supplies browser CORS/source consistency, but cannot prove authority on its own.
- Remote provider: Cloudflare Siteverify POST with secret and client IP, 5-second `AbortSignal.timeout`, fail-closed on errors/status/invalid payload. Only `success=true` plus required hostname/action is accepted.
- Client-controlled `Host`, `X-Forwarded-Host`, `Referer`, `utm`, `gclid`, `sellingSiteId` do not determine the site or its 20% channel attribution.
- Local/test-only **synthetic and forgeable** verifier uses `local:<hostname>[:nonce]`; it is NOT protection and must NEVER be enabled in a live process. Unique nonce supports multiple local bookings; `main.ts` refuses non-local runtime before server startup.
- Successful verification consumes a hash of the challenge for 10 minutes in transaction-scoped MemoryStore; a wrong-site/action attempt also consumes a verified token. Cloudflare itself uses five-minute, single-use tokens. Local caching supplements but cannot replace real Siteverify.
- The existing site generator already has a per-site optional Turnstile site key. Booking widget now declares `data-action="booking"`. The browser form refuses to submit without a challenge token and resets the widget after a failed submission.
- Development CORS origins default to localhost ONLY for `NODE_ENV=development/test`; all other environments receive no dev origins.

## Acceptance cases
- A10.1 (browser Origin consistency), A10.2 (forged Origin cannot credit arbitrary site), A10.8 (marketing data cannot reattribute).
- A10.9–A10.11 (wrong-site token denied, correct-site accepted, Host/X-Forwarded-Host/Referer spoofing ignored).
- A10.12 (provider failure returns 403 with no booking), A10.13 (replay returns 403), A10.14 (no dev origins in non-local environments), A10.15 (wrong action or missing hostname denied), A10.16 (eight concurrent token replays produce only one booking), A10.17 (verified wrong-site token consumed).
- All existing successful booking fixtures were converted from `verifyHuman: async () => true` to a deterministic local verifier and unique site-bound tokens. **This fixture migration is intentional; old assertions were not relaxed.**

## Still NOT proven
- No real Cloudflare secret, production Turnstile sitekey, external Siteverify request or real browser end-to-end integration tested. Production would continue to reject startup (SEL-332/331, G0 HOLD). Existing sample sites without a widget key require configuration; absent tokens now correctly fail closed.
- The local challenge is forgeable. It is not a replacement for live authorization, IdP, 2FA, CRS tenant isolation, or finance approval.
- MemoryStore replay hash is NOT persistent across restarts and NOT a PostgreSQL uniqueness guarantee. Production needs durable single-use record and correct concurrent transactions if provider-side checks are insufficient.
- An HTTP reverse-proxy header is trusted only when a separate authenticated reverse proxy explicitly configures it; this phase does not change the proxy trust boundary.
- The older A10.7 LOCAL-origin wildcard test still remains TODO; development preview origins cannot be treated as proof of site ownership. The stronger runtime-bound origin test A10.14 and token hostname checks passed.

## Official provider basis
- Cloudflare: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Cloudflare: https://developers.cloudflare.com/turnstile/get-started/
