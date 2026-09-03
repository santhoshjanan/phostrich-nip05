---
timestamp: 2026-08-28T01-38-53Z
slug: src-routes-account-page-svelte
---
# Account Management UI critique

Target: `src/routes/account/+page.svelte`

## Executive summary

The account page is mostly authored for Phostrich rather than a generic settings screen. It preserves the Issued Credential grammar through a ruled card, restrained evidence dates, a serif identifier, and a sober release interruption. The relay editor is less distinctive and has important feedback and accessibility gaps. Overall: acceptable, with significant improvements needed.

## Design-specificity verdict

Mostly authored for Phostrich: **7/10**. The credential shell is product-specific, while relay management falls back to a conventional settings form and the `Account` heading lacks the posture of a persistent product home.

## Nielsen heuristic scorecard

| Heuristic | Score | Finding |
|---|---:|---|
| Visibility of system status | 2/4 | Saving/Saved/Releasing are shown, but Saved can remain visible after adding an unsaved relay. |
| Match to the real world | 3/4 | Nostr terminology is apt; `Last verified` obscures that activity is driven by NIP-05 lookups. |
| User control and freedom | 2/4 | Release has Cancel, but the modal lacks Escape and focus lifecycle; relay removal has no undo. |
| Consistency and standards | 3/4 | Tokens and card grammar match existing screens; relay rows are less ledger-specific. |
| Error prevention | 2/4 | The eight-item cap and destructive confirmation help, but false Saved feedback and no immediate validation weaken prevention. |
| Recognition over recall | 3/4 | Identity and dates stay visible; relay scheme, cap, and date meaning must be inferred. |
| Flexibility and efficiency | 2/4 | Ordered editing works, but only one-at-a-time add/remove is supported and the dialog lacks keyboard Escape. |
| Aesthetic and minimalist design | 3/4 | Calm and restrained, though one card carries status, configuration, save state, and destructive management. |
| Error recognition and recovery | 2/4 | Errors appear, but are not associated with the offending relay or paired with a concrete recovery step. |
| Help and documentation | 1/4 | Helper copy exists, but public visibility, accepted scheme, cap, and inactivity policy are not explained. |

**Total: 23/40 — Acceptable; significant improvements needed.**

## Cognitive load

Five checklist failures produce high load as the relay list grows. Relay editing and irreversible release compete inside one card; at capacity users face eight Remove actions plus Save and Release; and a section-level validation error forces them to locate the bad row from memory. Grouping and progressive disclosure are otherwise sound.

## Emotional journey

Arrival feels composed and credible because identity and lifecycle evidence are visible. Confidence falls during relay editing because limits and failure location are unclear, and stale Saved feedback can create false assurance. The release interruption is appropriately sober, but incomplete keyboard containment makes it less trustworthy for assistive-technology users. Failed release ends in generic retry copy rather than a clear next step.

## Strengths

1. The display serif is reserved for the identifier while operational text stays sans, honoring the established type hierarchy.
2. Dates read as calm ledger facts rather than warning badges, matching the evidentiary product tone.
3. Release protection states the consequence and requires an explicit affirmative action without unnecessary visual drama.

## Priority issues

1. **P1 — False Saved feedback after adding a relay.** `addRelay` appends a blank row without clearing `saveStatus`, so the live region can still say Saved. Reset to dirty/idle and consider explicit `Unsaved changes` feedback. Evidence: `src/routes/account/+page.svelte:28-30,116-120`.
2. **P1 — Dialog lacks keyboard containment and emergency exit.** It has dialog semantics but no initial focus, focus trap, focus return, or Escape handler. Use a dialog primitive or implement the full focus lifecycle, disabling dismissal only while release is in flight. Evidence: `src/routes/account/+page.svelte:134-164`.
3. **P1 — Relay errors are detached from their row.** A single error follows the whole list even though the design selected separate rows for inline errors. Parse the relay index, mark the input invalid, connect help with `aria-describedby`, and retain a section summary. Evidence: `src/routes/account/+page.svelte:97-124`.
4. **P2 — Relay management forces inference.** Add a restrained `0 of 8 · public · wss:// only` section line and clearer row labels, preserving the ledger grammar. Evidence: `src/routes/account/+page.svelte:93-114`.
5. **P2 — Inactivity evidence is ambiguous.** `Last verified` sounds like authentication, while the policy is driven by NIP-05 lookup activity. Prefer `Last NIP-05 lookup` or explain the event precisely without adding alarm. Evidence: `src/routes/account/+page.svelte:84-91`.

## Persona red flags

- A Nostr power user must add and remove relays serially and cannot Escape the release dialog.
- A keyboard or screen-reader user can tab behind the modal, receives stale Saved feedback, and gets no field association for relay errors.
- A distracted mobile user gets repeated generic Remove controls with likely sub-44px targets and loses unsaved edits on reload.

## Minor observations

- Release failure always renders generic retry copy; expired-session and changed-account cases deserve specific recovery.
- The design brief's navy/cream/oxblood wording conflicts with the current lavender/plum `DESIGN.md`; the page correctly follows the current design system, but the brief should be reconciled.
- The automated Impeccable detector returned zero findings. A live browser assessment was unavailable, so responsive and interaction observations are code-based.
