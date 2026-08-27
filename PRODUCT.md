# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

SvelteKit 2 / Svelte 5 (runes), TypeScript. Decided by the user directly, not inferred.

## Users

Nostr-native users: people who already hold a Nostr keypair, are comfortable with concepts like pubkeys, browser extensions (Alby, nos2x), and relays. Not a mainstream consumer audience — the product does not need to explain what Nostr is. Two personas: regular users claiming an identifier for themselves, and a small admin group (config-defined pubkey allowlist) who review the platform via a report page.

## Product Purpose

Phostrich is a NIP-05 identifier provider: it lets a Nostr user prove control of their public key and claim a human-readable identifier (e.g. `alice@phostrich.com`) that Nostr clients resolve back to that key via the standard `.well-known/nostr.json` endpoint. Success is a user leaving with a working, verifiable NIP-05 identifier in as few steps as the security model allows.

## Positioning

A NIP-05 provider that authenticates by cryptographic signature (NIP-07 browser extension or NIP-46 remote signer) rather than by DM-delivered one-time codes — a neighboring provider relying on relay-delivered DMs for login could not truthfully claim the same reliability, since relay delivery has no guarantee. Simplicity and adherence to Nostr standards over feature breadth.

## Operating Context

A user arrives already holding Nostr keys, typically via a browser extension implementing NIP-07, or a remote "bunker" signer implementing NIP-46. The core workflow: authenticate by signing a server-issued challenge (no password, no email) → check whether a desired identifier name is available → claim it → the identifier resolves publicly at `/.well-known/nostr.json`. An authenticated session persists via a cookie for up to 30 days.

## Capabilities and Constraints

- One identifier per pubkey in v1 (confirmed).
- An identifier is automatically eligible for release after 6 months with no lookup activity against it — communicated to the user at claim time, not via any follow-up notification (no DM channel is used for this).
- Identifier names: lowercase, restricted charset, a length range, no leading/trailing separators, no consecutive dots — enforced live during the claim flow, not only on submit.
- A curated (not exhaustive) reserved-name list blocks platform-protection terms, generic/impersonation-prone words, and a starter set of prominent government and company names — explicitly documented as extensible, not complete.
- Authentication never uses passwords or email. Two signer paths: NIP-07 (browser extension, near-instant) and NIP-46 (remote "bunker" signer, relay round-trip — can be slow, needs a visible timeout with retry rather than an indefinite spinner).
- The system never reveals *why* a name is unavailable (claimed vs. reserved vs. blocked) to the person attempting to claim it — only that it isn't available.
- No email is ever collected. No password exists anywhere in the system.

## Brand Commitments

Name: **Phostrich**. No logo, color palette, or typographic identity established yet — visual identity is undecided and belongs to the next design step (`new-work`), not this record.

## Evidence on Hand

None. No existing screens, copy, testimonials, or brand assets exist yet — this is a from-scratch build. Future work must not fabricate user testimonials, usage numbers, or press mentions.

## Product Principles

1. **Cryptographic proof over shared secrets.** Every "prove who you are" moment is a signature, never a password, OTP, or email link.
2. **Never leak more than necessary.** Availability, error, and account-existence responses are deliberately uninformative where informativeness would help an attacker or a squatter.
3. **Standards over cleverness.** Behavior follows published Nostr NIPs (NIP-05, NIP-07, NIP-46, NIP-98) rather than inventing bespoke mechanisms.
4. **State policy up front, not as a surprise later.** Consequential system behavior (like automatic inactivity release) is disclosed to the user at the moment of the decision it affects, not discovered after the fact.
5. **Serve a technical audience without cosplay.** The audience is fluent in Nostr concepts; the product should read as competent and precise, not as consumer-simplified explainer content, and not as crypto-aesthetic pastiche either.

## Accessibility & Inclusion

No product-specific requirement established beyond ordinary web accessibility standards (keyboard operability, screen-reader-usable forms and modals) — not yet confirmed as a binding requirement beyond that baseline.
