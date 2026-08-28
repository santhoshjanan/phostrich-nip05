---
name: Phostrich Claim Flow
description: Issuing a NIP-05 identifier as a quietly official, ledger-style credential.
colors:
  canvas: '#f5f3f8'
  ink: '#2e2a33'
  ink-muted: '#6b6572'
  line: '#cfc9d6'
  paper: '#ffffff'
  accent-mint: '#a8d8c9'
  accent-mint-text: '#2f6b52'
  accent-rose: '#e8b4bc'
  accent-rose-text: '#9c4a5c'
typography:
  display:
    fontFamily: 'Source Serif 4, serif'
    fontSize: '1.1rem – 1.25rem'
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: 'normal'
  title:
    fontFamily: '-apple-system, Segoe UI, system-ui, sans-serif'
    fontSize: '1.15rem – 1.5rem'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 'normal'
  body:
    fontFamily: '-apple-system, Segoe UI, system-ui, sans-serif'
    fontSize: '0.875rem – 1rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
  label:
    fontFamily: '-apple-system, Segoe UI, system-ui, sans-serif'
    fontSize: '0.7rem'
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: '0.05em'
  mono:
    fontFamily: 'JetBrains Mono, monospace'
    fontSize: '0.6rem'
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: '0.05em'
rounded:
  sharp: '0px'
  hairline: '2px'
  seal: '50%'
spacing:
  1: '0.5rem'
  2: '1rem'
  3: '1.5rem'
  4: '2.5rem'
components:
  button-primary:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.hairline}'
    padding: '0.5rem 1.25rem'
  button-primary-hover:
    backgroundColor: '{colors.ink-muted}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.hairline}'
    padding: '0.5rem 1.25rem'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.hairline}'
    padding: '0.5rem 1.25rem'
  input-text:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.hairline}'
    padding: '0.5rem 0.75rem'
  credential-card:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    rounded: '{rounded.sharp}'
    padding: '{spacing.4}'
    width: '42rem'
---

# Design System: Phostrich Claim Flow

## Overview

**Creative North Star: "The Issued Credential"**

The claim flow reads as a document being processed, not a form being filled out. A single ruled card sits centered on a pale lavender-white ground; every value on it — name, issue date, status — is presented as a row in a ledger, labeled in a small uppercase serial tag and right-aligned like an entry in a records book. The identifier itself is the one word in the whole interface set in serif, because it is the one thing being formally issued; everything that operates the interface (buttons, labels, status text, body copy) stays in a plain system-UI sans so it never competes with the credential. Color is rationed to a single restrained pastel per meaning — sage-mint for available/success, dusty rose for unavailable/void — never as a broad field, only as text, a hairline accent, or the seal ring.

Depth comes from ruling, not lighting: hairline borders and horizontal rules do the work shadows would do elsewhere, and the one moment of ornament — the rotated double-ring "Issued" seal — is reserved exclusively for the successful-claim state. Motion is minimal and fast (150–200ms, no easing drama), present only to soften a modal's arrival or a focus/hover state, never to perform.

**Key Characteristics:**

- Ledger-row layout: label left, value right, hairline rule above.
- One serif reservation: the identifier name only.
- One pastel accent per meaning, applied to text/rings, never as a fill.
- Flat, bordered surfaces; no shadows anywhere in the build.
- Near-square 2px corners everywhere except the one fully round seal.

## Colors

A near-monochrome charcoal-plum-on-lavender ground with two hue-locked pastel accents, each carrying its own deeper text-safe variant.

### Primary

- **Charcoal-Plum Ink** (`#2e2a33`): body text, primary button fill, borders on focus, modal header text. The dominant color of the system.

### Secondary

- **Sage-Mint** (`#a8d8c9` fill / `#2f6b52` text, 5.70:1 on canvas): available/success meaning. The pale swatch appears only as the focus-state outline ring; the deep pine variant carries the "available" status word and the seal's ring/text.
- **Dusty Rose** (`#e8b4bc` fill / `#9c4a5c` text, 5.37:1 on canvas): unavailable/void meaning. The deep berry variant carries "not available" (struck through) and inline error copy; the pale rose fill itself does not appear as a filled surface anywhere in the shipped screens.

### Neutral

- **Lavender-White Canvas** (`#f5f3f8`): page background, the ledger ground.
- **Paper White** (`#ffffff`): card, input, and modal surfaces — the one step lighter than canvas that gives the card its "sits on the ground" separation.
- **Hairline** (`#cfc9d6`): every rule, border, and divider — card edge, ledger-row top rule, header underline, input border at rest.
- **Muted Plum** (`#6b6572`, 5.11:1 on canvas): secondary text — field labels, ledger labels, hover state for primary button/border, helper copy.

### Named Rules

**The One Meaning, One Accent Rule.** Sage-mint means available/success and dusty rose means unavailable/void, full stop — neither pastel is reused for any other purpose (no decorative accent, no brand flourish), and neither ever fills a large surface; both live in text, rings, or a single hairline.

**The Ledger-Not-Lighting Rule.** Separation between surfaces is drawn with a 1px hairline border in `--color-line`, never a shadow. Depth is structural (ruling, ground-vs-paper contrast), not atmospheric.

## Typography

**Display Font:** Source Serif 4 (with Georgia, serif fallback) — weights 400/600 loaded, 400 used in the build.
**Body/UI Font:** -apple-system, Segoe UI, system-ui, sans-serif.
**Label/Mono Font:** JetBrains Mono (weights 400/500 loaded, 500 used) — reserved for the seal's micro-copy only; not used for pubkeys/timestamps in this build's screens (no such value is currently rendered), but the reservation holds per the token comment in `app.css`.

**Character:** A ledger voice, not a display voice. The serif appears exactly once per screen — on the identifier name — and always at a modest size (1.1–1.25rem); it is never inflated into a headline. Every other piece of text, including card and modal titles, is set in the plain system sans at 600 weight, so structural chrome never masquerades as editorial display type.

### Hierarchy

- **Title** (600, 1.5rem card header / 1.15rem modal header, 1.3 line-height): card and modal titles ("Claim your identifier", "Before you claim"). Sans, never serif.
- **Display** (400, 1.1–1.25rem, 1.3 line-height): the identifier name itself, in the name input's typed value and on the issued-credential row. The only serif usage in the system.
- **Body** (400, 0.875–1rem, 1.5 line-height): policy modal copy, helper notes, error text.
- **Label** (400, 0.7rem, letter-spacing 0.05em, uppercase): ledger serial labels (NAME / ISSUED / STATUS / IDENTIFIER NAME / POLICY) and standalone form `<label>` elements (0.875rem, not uppercased, for login's plain field label).
- **Mono micro-label** (500, 0.6rem, letter-spacing 0.05em, uppercase): the seal's "Issued" mark only.

### Named Rules

**The One-Serif Reservation Rule.** Source Serif 4 renders the identifier name and nothing else. Titles, buttons, labels, and body copy stay on the system sans even when they are bold or large.

**The Uppercase Ledger-Label Rule.** Serial-style field labels (ledger rows and the identifier-name field label) are 0.7rem, uppercase, 0.05em tracked, and set in muted plum — never the primary ink color. This is the ledger's own indexing device, native to the ruled-document world the build commits to; it is a structural label for a value that follows it, not a decorative pre-headline kicker, and it does not migrate onto marketing or narrative copy.

## Layout

Two layout contexts. Chrome-free routes (`/login`, `/claimed`) center one card both axes in `.screen-center` (`min-height: 100vh` flex). Authenticated routes (`/account`, `/claim`, `/admin`) sit under a hairline masthead in `.app-main`: a top-aligned column whose left edge lines up with the masthead wordmark — `max-width: 42rem`, widening to `64rem` on `/admin` for its table-scale card. The card (`.credential-card`) caps at `max-width: 42rem` (`64rem` in its `--wide` variant) and otherwise fills its column. The policy modal follows the centered-overlay pattern at a tighter `max-width: 24rem`. A single hairline-ruled site footer (copyright, provenance line, contact `mailto`) sits at the bottom of every route via the root layout's flex column, its inner width mirroring the masthead column (`42rem`, `64rem` on `/admin`).

Internal rhythm runs on the four-step spacing scale (`0.5rem / 1rem / 1.5rem / 2.5rem`): card padding is the largest step (2.5rem); ledger-row gaps and label-to-input gaps use the 1rem step; action button spacing above content uses the 1.5rem step; the tightest step separates a label from its value. Ledger rows stack via `margin-top` + `border-top`, so the rhythm is additive top-down, matching a document's line-by-line reading order.

## Elevation & Depth

Flat throughout — no `box-shadow` appears anywhere in the shipped CSS. Depth is conveyed by two structural devices instead: a value-contrast step between the lavender canvas and the white card/input surfaces, and 1px hairline rules (`--color-line`) marking every edge, header underline, and ledger-row divider. The modal's only concession to layering is a flat `rgba(ink, 0.5)` scrim behind it — no blur, no shadow on the modal content itself, just its own hairline border.

### Named Rules

**The No-Shadow Rule.** Surfaces separate by border and background-value contrast only. A shadow on any card, input, or modal is a deviation from the shipped system.

## Shapes

Almost every corner in the system is a hairline 2px radius (inputs, buttons) or perfectly square (cards, the modal, ledger rows) — a document, not a app-chrome, silhouette. The one deliberate exception is the seal: a 68px circle (`border-radius: 50%`) with a double ring — a 2px solid ring plus a 1px outline offset 3px outward — rotated −3deg, reserved exclusively for the successful "Issued" state. Its circularity and tilt are what mark it as a stamp rather than a UI control; no other element in the system is round or rotated.

## Components

### Buttons

- **Shape:** near-square (2px radius).
- **Primary:** ink-filled (`#2e2a33` background, canvas-colored text), `0.5rem 1.25rem` padding, 1px ink border. Hover darkens fill/border to muted plum (`#6b6572`, 0.15s ease). Disabled drops to 50% opacity with `not-allowed` cursor — the sole disabled treatment in the system (used to gate "Claim this name" until availability is confirmed).
- **Secondary/Ghost:** transparent fill, ink text, same ink border and radius; hover fills with the hairline color (`#cfc9d6`). Used for the modal's "Cancel" action only.

### Cards / Containers

- **Corner style:** square (0px radius).
- **Background:** paper white on the lavender canvas.
- **Shadow strategy:** none — see Elevation & Depth.
- **Border:** 1px hairline (`#cfc9d6`).
- **Internal padding:** 2.5rem (the largest spacing step), with a bottom-ruled header block (title + hairline) preceding a body block.

### Inputs / Fields

- **Style:** 1px hairline border, 2px radius, white fill, full width.
- **Focus:** border shifts to ink plus a 2px sage-mint outline (`outline-offset: 1px`) — the one place the pale (non-text) mint swatch is used directly, as a focus indicator rather than a status fill.
- **Placeholder:** set in muted plum, meeting contrast against the white field.
- **Error/Disabled:** no dedicated input error/disabled state exists in the build; form-level errors render as a separate `role="alert"` paragraph in rose-text below the field, not as a field border change.

### Ledger Row (signature pattern)

The recurring `label — hairline rule above — right-aligned value` row is the system's structural unit, used for every fact the app states about the identifier (name, issued date, status, availability). Label is the 0.7rem uppercase tag in muted plum; value is 0.9rem in ink, right-aligned, `overflow-wrap: anywhere` so long values (long names, pubkeys) wrap safely rather than overflow the card.

### Modal (Policy dialog)

A centered, flat white panel (`max-width: 24rem`, 1px hairline border, no radius) over a flat ink-tinted scrim. Header is its own ruled block: a ledger-style "POLICY" label above an h2 title, separated from the body by a bottom hairline. Enters with a 200ms fade (scrim) and a 200ms scale-from-0.98 (content) — the system's only compound transition. Carries `role="dialog"`, `aria-modal`, `aria-labelledby`, and `aria-describedby` wired to the header title and body copy.

### Stamped Seal (signature component)

A 68px circle, double-ringed, rotated −3deg, holding a mono uppercase micro-label ("Issued") in deep-pine sage-mint text. Appears exactly once, beside the identifier name on the `/claimed` credential. This is the system's single ornamental mark and its only circular, rotated, and mono-labeled element — reserved for the moment a credential is actually issued.

## Do's and Don'ts

### Do:

- **Do** reserve Source Serif 4 for the identifier name value alone; every other text element (including bold titles) stays on the system sans.
- **Do** express availability/unavailability through the deep text-safe accent variant (`#2f6b52` / `#9c4a5c`) plus a semantic device (strike-through for unavailable), never through a filled colored surface.
- **Do** build depth with hairline borders and canvas/paper value contrast; keep every surface shadow-free.
- **Do** keep corners at 2px or square (0px) except the seal, which is the one circle in the system.
- **Do** use the ledger-row pattern (uppercase label / hairline rule / right-aligned value) for any new fact the app states about an identifier or credential.

### Don't:

- **Don't** introduce a box-shadow anywhere; the build has none, and one would break the ruled-document read.
- **Don't** fill a surface with the pale mint or rose swatch as a background field — both accents are confirmed as text/ring/outline use only in the shipped build.
- **Don't** extend the uppercase serial-label device (0.7rem, tracked, muted plum) into a decorative pre-headline kicker on marketing or narrative copy; in this build it is strictly a value's field label inside a ledger row.
- **Don't** add a second circular or rotated mark. The stamped seal is reserved for the successful-claim state; reusing its geometry elsewhere would dilute the one moment it's meant to punctuate.
- **Don't** promote JetBrains Mono to general UI labels — the "fix" round explicitly moved mono off UI labels onto the sans face; mono is confirmed for the seal's micro-copy only.
