---
target: navigation shell / (app) masthead
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-08-28T16-34-12Z
slug: src-routes-app-layout-svelte
---
# Design Critique — Navigation shell (src/routes/(app)/+layout.svelte)

Method: DEGRADED single-context (harness restricts sub-agent spawning to explicit user request). Mode: Operate.
Follow-up to the 2026-08-28 navigation critique (src-routes-layout-svelte, 22/40) — the shell it asked for now exists.

## Design Health Score

| # | Heuristic | Score | Prev | Key Issue |
|---|-----------|-------|------|-----------|
| 1 | Visibility of System Status | 3 | 2 | aria-current underline + persistent identity answer where/who am I. |
| 2 | Match System / Real World | 4 | 3 | Conventional authed-app header; meets expectation. |
| 3 | User Control and Freedom | 4 | 1 | Sign-out on every authed surface incl. /claimed; Account<->Admin one click; wordmark home. |
| 4 | Consistency and Standards | 3 | 2 | Internally consistent; loses a point for masthead 64rem vs 28rem card on 2 of 3 routes. |
| 5 | Error Prevention | 3 | 3 | Destructive actions still modal+reason gated. Sign-out no confirm (low stakes). |
| 6 | Recognition Rather Than Recall | 4 | 1 | /admin visible to admins; identity on screen; no URL-typing. |
| 7 | Flexibility and Efficiency | 3 | 1 | Cross-nav one click, instant via preload-on-hover. No shortcuts (ok for 3 views). |
| 8 | Aesthetic and Minimalist Design | 3 | 4 | Restrained + on-world, but flat masthead hierarchy and a marooned card below it on /account + /claim. |
| 9 | Error Recovery | 3 | 3 | Unchanged. signOut fetch has no failure branch. |
| 10 | Help and Documentation | 2 | 2 | No in-app help; acceptable for the audience. |
| Total | | 32/40 | 22/40 | Good (top of band) |

Every P0/P1 from the last critique is resolved. What remains is P2/P3 polish plus one a11y regression the shell introduced.

## Design Specificity Verdict

The masthead is this system's own: ledger serial-label device (0.7rem uppercase, 0.05em tracked, muted plum) for nav items, mono for the pubkey per the type reservation, hairline-only depth, no shadow, 2px chip radius. Not a generic app bar. Weaknesses are compositional:
1. Masthead inner caps at 64rem while /account and /claim show a 28rem card -> the wordmark floats ~270px left of its content. /admin (64rem card) aligns, which makes the mismatch look unfinished elsewhere.
2. Everything in the masthead except the wordmark is one ~0.7rem size -> primary nav and utility chrome read at the same weight.
3. Centered card sits in a wide empty band under a full-width header on the two shorter routes.

Deterministic scan: detect.mjs on src/routes and src/app.css -> exit 0, zero findings. Detector does not model layout composition or focus contrast; issues below are Assessment-A only.

Visual overlays: not injected (degraded). Reviewed from fresh screenshots of /account, /admin, /claimed at 1280 + 390, a keyboard-focus capture, and a masthead close-up, signed in as the fixed admin with a claimed identifier.

## Overall Impression

Navigation problem solved (22 -> 32). Admin lands, sees Account/Admin with the active one underlined, pubkey + ADMIN tag on the right, Sign out always one click away; /claimed has a forward path. What remains: the full-width shell and the small centered card do not fit each other yet on 2 of 3 routes (wordmark detached, whitespace below), and the pale-mint focus ring extended to links/buttons is below the WCAG non-text contrast floor.

## What's Working

1. The shell is on-world (serial-label nav, mono pubkey, hairline rule, no shadow).
2. /claimed completes the arc: "Go to your account" primary + "Sign out" under a hairline rule, matching the masthead treatment.
3. Real landmarks/states: nav[aria-label=Primary], aria-current=page, sign-out as a true button with a pending label.

## Priority Issues

[P2] Focus ring fails non-text contrast (introduced by the shell).
a:focus-visible / button:focus-visible now use 2px solid var(--color-accent-mint) (#a8d8c9) globally; vs #f5f3f8 canvas that is ~1.3:1, below the 3:1 WCAG 2.4.11 / 1.4.11 minimum. Inputs escape it via a paired ink border shift; a bare link/button has only the pale ring.
Fix: use var(--color-accent-mint-text) (#2f6b52, ~4.6:1) or var(--color-ink) for the :focus-visible outline; keep pale mint only where paired with an ink border.
Command: /impeccable audit (or a one-line app.css fix).

[P2] Masthead width != card width on /account and /claim.
The 64rem masthead heads empty space, not the 28rem card; header looks detached. /admin aligns, so the inconsistency shows when moving between routes.
Fix: cap the masthead inner width to the active route's card, or adopt one modest column (~40-44rem) for masthead + non-wide cards left-aligned, /admin staying the wide exception.
Command: /impeccable layout.

[P2] Flat type hierarchy inside the masthead.
Wordmark aside, nav links, ADMIN chip, pubkey and Sign out are all ~0.7rem muted; primary nav carries no more weight than utility chrome.
Fix: lift the nav links (ink at rest, or 0.8rem) and/or set the identity cluster apart with a hairline divider or a size step.
Command: /impeccable layout or /impeccable typeset.

[P2] Card marooned below the masthead on /account and /claim.
.app-main vertically centers a 28rem card in flex:1 under a full-width header -> wide dead band below. /admin fills the space and looks fine.
Fix: top-align the card (align-items: flex-start + padding-top), or use the narrower shared column.
Command: /impeccable layout.

[P3] /claimed: seal collides with a wrapped long identifier; action pairing awkward.
A long name wraps to two lines and the vertically-centered seal overlaps the second; a tiny "Sign out" link sits beside a large filled "Go to your account".
Fix: top-align the seal to the first line of the value; give the two actions a clearer relationship (more separation, or stack on narrow).
Command: /impeccable layout.

## Persona Red Flags

Alex (power user / config-listed admin): daily-driver friction gone (Account<->Admin one click, /admin discoverable, sign-out present). Residual: no keyboard shortcut to swap views (fine at this scale); flat masthead means a beat's hunt for nav vs identity.

Sam (accessibility): nav landmark, aria-current, real sign-out button, themed ring — all new and correct. But the ring's ~1.3:1 contrast (P2) risks low-vision keyboard users losing focus in the masthead. Fix the colour and this persona is well served.

Jordan (first-timer): /claimed now offers "Go to your account" instead of a dead note — a real next step. Seal/long-name overlap is cosmetic.

## Minor Observations

- Focus ring on small uppercase nav links renders as a chunky 2px box; tighten outline-offset to 1px for the masthead once colour is fixed.
- Pubkey truncation asymmetric (6 + ... + 4); 4+4 or 6+6 balances better.
- signOut() has no failure branch — failed POST still runs goto('/login'); if the session survived, hooks bounce the user back silently. A catch that surfaces a line closes it.
- data-sveltekit-preload-data="hover" is on — cross-nav is instant, no loading state needed.
- Full-width masthead hairline under a 28rem card is correct for a masthead; don't "fix" it.
- Redundant ADMIN on /admin (active nav item + role chip). Consider dropping the chip on /admin or making the role a dot/icon.

## Questions to Consider

- One narrower centered column shared by masthead + /account + /claim (wordmark heads the card), with /admin the wide exception — or masthead shrinks per route?
- Keep the centered card under a header, or top-align authenticated content like a normal app?
- Does the identity cluster want a visual divider from the primary nav, or is position enough?
- Is /claimed a route at all, or a just-issued state of /account — deleting the seal/masthead special-casing?
