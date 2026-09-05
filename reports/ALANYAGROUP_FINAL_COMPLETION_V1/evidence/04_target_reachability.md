# Evidence 04 — Live target reachability (AlanyaGroup.com)

Captured: 2026-08-25T06:43:48Z

The MANDATORY TEST MATRIX (DOM instance counts, console errors, horizontal
overflow, raw shortcode/CSS leakage, Chrome/Safari checks) and WORKSTREAM E10
("her kayıttan sonra raw HTML doğrulaması") all require fetching the live or
staging target. Reachability was tested read-only (GET only, no mutation).

## curl probes
```
$ curl -sS -o /dev/null -w '%{http_code}' --max-time 25 https://www.alanyagroup.com/
curl: (56) CONNECT tunnel failed, response 403
http_code=000

$ curl -sS -o /dev/null -w '%{http_code}' --max-time 25 https://www.alanyagroup.com/wp-json/
curl: (56) CONNECT tunnel failed, response 403
http_code=000

```

## Agent proxy status (recentRelayFailures)
```json
  "recentRelayFailures": [
    {
      "ts": "2026-08-25T06:42:06.223Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.alanyagroup.com:443"
    },
    {
      "ts": "2026-08-25T06:42:07.269Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.alanyagroup.com:443"
    },
    {
      "ts": "2026-08-25T06:43:48.988Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.alanyagroup.com:443"
    },
    {
      "ts": "2026-08-25T06:43:49.279Z",
      "kind": "connect_rejected",
      "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
      "host": "www.alanyagroup.com:443"
    }
  ]
}
```

**Result: UNREACHABLE.** The environment network policy denies CONNECT to
`www.alanyagroup.com:443` (gateway 403). This is an environment egress denial,
and it stacks on top of the already-documented constraint in
MASTER_PROJECT_STATUS §4/Risk 3: *"Cloudflare blocks external/automated fetches
and rendered-HTML reads; only logged-in same-origin REST and public /wp-json
GETs work."*

Consequence: **no test in the MANDATORY TEST MATRIX can be executed from this
container** — not one. Any matrix result reported from here would be fabricated.
