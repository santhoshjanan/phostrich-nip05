---
target: traverse between routes / admin navigation
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-28T12-51-15Z
slug: src-routes-layout-svelte
---
# Design Critique — Cross-route navigation (anchored at src/routes/+layout.svelte)

Method: DEGRADED single-context (harness policy restricts sub-agent spawning to explicit user request; Assessment A + B run inline in one context).
Mode: Operate (authenticated app + admin console).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No persistent where-am-I/who-am-I; screen identity is only the card title. |
| 2 | Match System / Real World | 3 | Audience-appropriate terms and a coherent "issued credential" metaphor, but an authed app with no nav/home breaks web expectation. |
| 3 | User Control and Freedom | 1 | No sign-out anywhere. /admin, /account, /claimed are dead ends. |
| 4 | Consistency and Standards | 2 | Violates the standard that a logged-in app carries persistent nav + account/sign-out. |
| 5 | Error Prevention | 3 | Destructive actions modal-confirmed with required reason. Strong. |
| 6 | Recognition Rather Than Recall | 1 | Admins must remember /admin exists and type it. Hidden navigation. |
| 7 | Flexibility and Efficiency | 1 | Admin cannot move between own account and console without a URL round-trip. |
| 8 | Aesthetic and Minimalist Design | 4 | Uncluttered and purposeful; the problem is missing function, not noise. |
| 9 | Error Recovery | 3 | Inline role=alert errors in plain language. |
| 10 | Help and Documentation | 2 | No in-app or contextual help; new admin cannot discover /admin. |
| Total | | 22/40 | Acceptable — significant improvements needed |

Per-screen craft (focus mgmt, labeled fields, destructive-action guarding, aria-live) is well above average and keeps this out of "Poor". The score is dragged down by one axis: there is no navigation model at all.

## Design Specificity Verdict

LLM: Split. The visual world (ledger card, hairline depth, one-serif reservation, rationed pastels) is highly authored and not category-interchangeable. But there is no IA to evaluate: +layout.svelte is a bare centering flex container; zero <a> elements and zero <nav> landmarks in the entire client tree; every route is an isolated card reached by goto() after an action or by typing the path. The missing navigation is an omission, not a minimalist choice. The "issued credential" metaphor offers a distinctive answer (index tab / serial-row nav on the card) the build hasn't taken.

Deterministic scan: detect.mjs --json src/routes -> exit 0, one advisory only: design-system-font-size at src/routes/claim/+page.svelte:136 (font-size 1.1rem off the DESIGN.md type ramp). Unrelated to navigation. Detector does not model IA.

Visual overlays: not available. Playwright browsers cannot launch here (libnss3 missing, no sudo); routes past /login are gated behind a signed Nostr auth event that cannot be produced headlessly. Route behavior derived from reading the six +page.server.ts guards and the six page components.

## Overall Impression

Current route graph:
- / -> 302 /login
- /login -> on success goto('/claim') (authed user -> 302 /claim)
- /claim -> on success goto('/claimed') (already has identifier -> 302 /account)
- /claimed -> dead end (Copy button only)
- /account -> dead end (on release -> goto('/claim'))
- /admin -> dead end; reachable ONLY by typing the URL

Three of six routes are terminal, and /admin has no inbound link from anywhere. An admin signs in, lands on /account, and the console is never presented as existing. Their job means hand-editing the address bar every session. Biggest opportunity: a persistent authenticated shell (header with home, context links, identity + sign-out) that turns six floating cards into an app.

## What's Working

1. Redirect guard logic is sound — each +page.server.ts routes by auth + identifier + admin state correctly. The state machine is right; it has no UI expression.
2. Destructive actions well guarded — release / force-release / reservation-removal each require a confirm modal with typed reason, focus trap, Esc, focus restore. Reuse this pattern for nav.
3. Distinctive, coherent visual identity that survives every screen.

## Priority Issues

[P0] /admin is undiscoverable — reachable only by typing the URL.
Why: the admin persona's whole job is this page; after login they are sent to /account and nothing indicates /admin exists. Task-completion failure for the primary admin workflow.
Fix: root +layout.server.ts exposes { user: { pubkeyShort, isAdmin } } | null to a persistent authenticated header in +layout.svelte; when isAdmin, show an Admin link as a real <a href> inside a <nav> landmark.
Command: /impeccable shape then build.

[P0] No sign-out anywhere in the UI.
Why: sessions last up to 30 days via cookie; /auth/logout exists but nothing in the client calls it. On a shared machine the user cannot end their session; no identity switch without clearing cookies by hand.
Fix: sign-out control in the persistent header that POSTs /auth/logout and redirects to /login; announce the state change.
Command: /impeccable shape.

[P1] /account and /admin require URL-bar editing to switch.
Why: the two surfaces an admin uses have no mutual link; every switch is a manual URL round-trip. Extraneous load on the most frequent operator.
Fix: same persistent header — Account and Admin as sibling nav items for admins; regular users see only Account.
Command: /impeccable shape.

[P1] /claimed strands the user at the emotional peak.
Why: /claimed is the payoff of the flow and offers only a Copy button — no "Manage this identifier", no "Done", no path to /account (which the user does not know exists). Peak-end: the journey ends on a dead screen.
Fix: primary action "Go to your account" -> /account beneath the issued credential; optional secondary "Sign out".
Command: /impeccable onboard, or fold into /impeccable shape.

[P2] Nothing shows you are signed in, as whom, or with what rights.
Why: no identity indicator; user cannot confirm the session, see which pubkey they act as, or tell they hold admin rights. Recognition-over-recall failure and a trust gap.
Fix: truncated pubkey (mono, per the design system) plus a role marker in the header.
Command: /impeccable layout.

## Persona Red Flags

Alex (power user / config-listed admin): types /admin from memory every session; cannot jump between console and own account without editing the URL; no sign-out so no identity switch; inside /admin no keyboard path between the Stale and Reservations sections. The persona the app fails hardest.

Jordan (first-timer): finishes a claim, lands on /claimed, sees Copy and a credential — "is that it?" No next step; will never discover /account or relay management.

Sam (accessibility): no <nav> landmark and no skip link anywhere — cannot enumerate destinations or jump to nav because there is none; no "you are here"; per-screen a11y is otherwise strong, which makes the missing global landmark stand out.

"The config-listed admin" (project persona): arrives expecting an admin entry point like every admin tool they have used; finds a personal account page and no visible seam to the console.

## Minor Observations

- No <a> elements exist in the client at all; all movement is goto() after a button press. Real nav should use <a href> for middle/right-click, new-tab, and native keyboard semantics.
- No app home / wordmark; "Phostrich" never appears as chrome; no clickable identity to return to a known state.
- .page-center in +layout.svelte is min-height:100vh flex-centered; a persistent header means reworking this into header + main. Plan for it in the shape pass.
- / costs 2-3 redirect hops for an authed user (/ -> /login -> /claim -> /account); a direct / -> /account for authed users would be snappier.
- claim/+page.svelte:136 font-size 1.1rem off the DESIGN.md type ramp (detector advisory). Unrelated to nav; sweep when next touching that file.
- Reuse the existing focus-trapped modal pattern as the consistency anchor for any new nav affordance (e.g. a mobile nav sheet).

## Questions to Consider

- After login, should an admin land on their own account or the admin console? (The identifier-holder redirect currently forces /account regardless of role.)
- Global header or authenticated-routes-only? /login and /claimed may deserve to stay chrome-free.
- Persistent top bar, or navigation as an index tab / serial row on the card itself — closer to the document metaphor than app chrome?
- Is /claimed a distinct route at all, or a state of /account ("issued just now" banner), collapsing one dead end entirely?
