<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<!--
THESIS: claiming a NIP-05 identifier reads as being issued a precise, quietly official credential — not a signup form, not a crypto dashboard.
OWN-WORLD: soft pastel ledger-card ground, soft charcoal-plum ink, one restrained pastel accent per meaning (sage-mint for available/success, dusty rose for unavailable/void — never a broad saturated field). Editorial-minimalist: generous whitespace, hairline rules, serif reserved for the identifier name itself, mono reserved for pubkeys/timestamps only, general UI chrome on a clean system-UI sans.
STORY: sign in by signature → see a name, know instantly if it's available → understand the 6-month inactivity policy up front → claim → receive a credential.
FIRST VIEWPORT: single centered card on a soft pastel ground, ruled document-style with serial labels (NAME/ISSUED/STATUS); restrained, uncluttered.
FORM: adapted Issued Credential (user-pinned) + restraint/negative-space raise (Saville factory-records catalog) + quantified-precision/single-restrained-accent raise (darkroom exposure-record zone sheets). Seed key fd81ad37, assigned index 7.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
NAVIGATION: authenticated routes (/account, /claim, /admin) carry a hairline ledger masthead — wordmark, serial-label nav, mono acting-pubkey, sign out. /login and /claimed stay chrome-free so the sign-in and issued-credential moments are undiluted.
-->

{@render children()}
