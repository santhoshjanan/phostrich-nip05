<script lang="ts">
  import '../app.css';
  let { children } = $props();

  const year = new Date().getFullYear();
</script>

<!--
THESIS: claiming a NIP-05 identifier reads as being issued a precise, quietly official credential — not a signup form, not a crypto dashboard.
OWN-WORLD: soft pastel ledger-card ground, soft charcoal-plum ink, one restrained pastel accent per meaning (sage-mint for available/success, dusty rose for unavailable/void — never a broad saturated field). Editorial-minimalist: generous whitespace, hairline rules, serif reserved for the identifier name itself, mono reserved for pubkeys/timestamps only, general UI chrome on a clean system-UI sans.
STORY: sign in by signature → see a name, know instantly if it's available → understand the 6-month inactivity policy up front → claim → receive a credential.
FIRST VIEWPORT: single centered card on a soft pastel ground, ruled document-style with serial labels (NAME/ISSUED/STATUS); restrained, uncluttered.
FORM: adapted Issued Credential (user-pinned) + restraint/negative-space raise (Saville factory-records catalog) + quantified-precision/single-restrained-accent raise (darkroom exposure-record zone sheets). Seed key fd81ad37, assigned index 7.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
NAVIGATION: authenticated routes (/account, /claim, /admin) carry a hairline ledger masthead — wordmark, serial-label nav, mono acting-pubkey, sign out. /login and /claimed stay chrome-free so the sign-in and issued-credential moments are undiluted.
FOOTER: a thin fixed status bar on every route — copyright, provenance line, contact mailto — segmented by hairline dividers on a paper strip; the app's persistent baseline.
-->

<div class="root-frame">
  <div class="root-content">
    {@render children()}
  </div>
  <footer class="statusbar">
    <span>© {year} Phostrich</span>
    <span class="statusbar__sep" aria-hidden="true"></span>
    <span class="statusbar__mid">Built in NJ with ❤️</span>
    <span class="statusbar__sep" aria-hidden="true"></span>
    <a href="mailto:nostr@phostrich.com">nostr[at]phostrich[dot]com</a>
  </footer>
</div>

<style>
  .root-frame {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    /* clearance so content never hides behind the fixed status bar */
    padding-bottom: 1.75rem;
  }
  .root-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .statusbar {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 5;
    height: 1.75rem;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-2);
    border-top: 1px solid var(--color-line);
    background: var(--color-paper);
    font-size: 0.7rem;
    line-height: 1;
    color: var(--color-ink-muted);
    white-space: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .statusbar::-webkit-scrollbar {
    display: none;
  }
  .statusbar > * {
    flex-shrink: 0;
  }

  .statusbar__sep {
    width: 1px;
    align-self: stretch;
    margin: 0.375rem 0;
    background: var(--color-line);
  }

  .statusbar a {
    color: var(--color-ink-muted);
    text-decoration: none;
  }
  .statusbar a:hover {
    color: var(--color-ink);
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }

  @media (max-width: 34rem) {
    .statusbar__mid,
    .statusbar__mid + .statusbar__sep {
      display: none;
    }
  }
</style>
