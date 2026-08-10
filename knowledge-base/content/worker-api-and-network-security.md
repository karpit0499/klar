---
title: "Worker API and Network Security"
description: "Cloudflare Worker routes, request contracts, upstream allowlists, CORS, SSRF controls, limits, secrets, observability, and failure behavior."
section: "Platform"
order: 270
audience: ["Engineering", "Security", "Operations", "Source maintainers"]
status: "current"
classification: "public"
applicable_version: "2.6.0.1"
owner: "Klar Engineering"
last_verified: "2026-08-10"
next_review: "2026-11-10"
tags: ["worker", "api", "cloudflare", "cors", "ssrf", "proxy", "security"]
---

# Worker API and Network Security

## Purpose

The `klar-proxy` Cloudflare Worker makes a small set of browser-incompatible or credential-bearing requests possible without becoming a general backend or open proxy. Its central control is reconstruction: callers choose among known Klar routes and bounded parameters, never an arbitrary upstream URL.

## Deployment baseline

The Worker entry point is `worker/src/index.ts`. Its deployment configuration pins the runtime compatibility baseline, enables the compatibility features used by the implementation, and restricts production browser origins. Operational logs must remain free of personal and secret payloads.

Secrets such as Groq or Adzuna credentials are deployment secrets, not source-controlled variables. Credential selection is atomic: incomplete credential sets are rejected rather than combined.

## Route catalog

| Route family | Method | Upstream/purpose | Principal controls |
| --- | --- | --- | --- |
| Health | GET | Worker health and capability response | No personal input; safe status only |
| BA jobs | GET | BA Jobsuche API | Fixed upstream family, reconstructed request, no-store |
| Adzuna jobs | GET | Adzuna jobs API | Fixed upstream family, atomic credential selection, incoming credential query fields removed |
| Source Fabric | GET | Allowlisted source retrieval | Fixed host/path catalog, HTTPS, redirect revalidation, type and byte bounds |
| AI model discovery | GET | Configured provider model discovery | Credential required, fixed upstream operation, bounded response |
| AI generation | POST | Structured generation | JSON contract, request and response bounds, credential required, redirects rejected |
| Any known route | OPTIONS | CORS preflight | Origin policy and allowed header/method response |

Unknown routes return 404. A non-GET method outside the Groq completion route returns 405.

## CORS and caller boundary

Production configuration uses an explicit browser-origin allowlist. CORS remains a browser-read control rather than an authentication mechanism, so independent abuse controls are required for any relay exposed to the public internet.

The Worker accepts only the headers required by each route family. Origin policy does not replace authentication, rate limiting, provider quotas, or monitoring.

## BA relay

The BA relay uses a fixed upstream family and adds the upstream's required public-client identification. Search and detail enrichment currently depend on separate upstream contracts. The Worker does not accept a caller-selected BA host.

Responses are relayed with no-store semantics and application-facing errors are content-safe. Consistent resource bounds are not yet enforced across every relay; closing that gap is a public release objective.

## Adzuna relay

The Adzuna relay removes credential fields from the incoming query before rebuilding the request. Credentials must come from one complete configured source; incomplete sets are rejected rather than combined. The upstream host and route family are fixed.

Like the BA relay, this path still needs the same independently verified resource-limit policy used by the most constrained relay paths. Worker protection should not depend only on downstream parsing.

## Source Fabric retrieval

Fabric uses a fixed hostname-to-path-prefix allowlist mirrored by tests against the client registry. It:

- requires a recognized connector/host mapping;
- rebuilds an HTTPS URL;
- bounds path length;
- manually follows a small, fixed number of redirects and revalidates each destination;
- screens destinations against private and local network ranges;
- applies a hard response-size maximum;
- validates the expected content type;
- streams with a byte bound;
- strips XML document type/entity declarations from non-JSON text; and
- never executes upstream JavaScript.

The Worker allowlist materially limits server-side request-forgery reach. Network-destination validation still needs additional defense in depth across address formats, name resolution, and redirect handling; the fixed host catalog reduces but does not eliminate that risk.

The roadmap also calls for stronger structured-data bounds, query validation, active-content sanitization, cache-key hardening, and client/session abuse controls. Not all of those are independently enforced at the Worker boundary in 2.6.0.1; downstream parsers and fixed routes provide partial defense.

## Groq relay

Only model discovery and chat completions are exposed. Both require a bearer token supplied for the request. The Worker does not persist the token and forwards it only in the upstream authorization header.

For chat completions, the Worker requires a bounded JSON object, constrains the upstream response, rejects redirects, and returns no-store responses. It does not provide a general OpenAI-compatible proxy, account store, or model-hosting service.

The current Worker does not yet provide a complete identity-aware abuse-control layer for every relay. Production operations should combine provider-side controls with privacy-safe monitoring and must never log prompts, Resume content, job descriptions, or credentials.

## Error and logging policy

Worker errors exposed to the application must communicate category and recovery without including upstream secrets, request authorization, prompt bodies, personal content, stack traces, or unsafe upstream HTML. Logs and traces should contain route, status class, latency, bounded size, connector ID, and request correlation tokens only.

Upstream source content is untrusted even after a 2xx response. Client consumers still validate required fields, content structure, URLs, provenance, and schema.

## Security review checklist

A new route, host, or path must answer:

- Why can the browser not safely perform the request directly?
- Is the upstream finite and owned/authorized for the intended public retrieval?
- Can a caller influence scheme, authority, credentials, redirect, path, query, or headers beyond the minimum contract?
- What are the method, timeout, redirect, request-size, response-size, content-type, parsing-depth, and rate limits?
- How are private-network destinations, name resolution, address formats, active content, and cache poisoning handled?
- What is logged and how is it proven content-free?
- What does the client do on partial, malformed, blocked, or stale responses?
- Which contract and security tests fail if the allowlist drifts?

Deployment and incident procedures are in [Operations Runbooks](/docs/operations-runbooks). Cross-system threats are in [Security, Privacy, and Threat Model](/docs/security-privacy-and-threat-model).
