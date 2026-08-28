<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  let { children } = $props();

  // Footer tracks the masthead's per-route column width.
  const wideFooter = $derived(page.url.pathname === '/admin');
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
FOOTER: a single hairline-ruled site footer on every route — copyright, provenance line, contact — mirroring the masthead's column width and hairline-only depth.
-->

<div class="root-frame">
  <div class="root-content">
    {@render children()}
  </div>
  <footer class="site-footer">
    <div class="site-footer__inner" class:site-footer__inner--wide={wideFooter}>
      <span>© {year} Phostrich</span>
      <span>Built in NJ with ❤️</span>
      <a href="mailto:nostr@phostrich.com">nostr[at]phostrich[dot]com</a>
    </div>
  </footer>
</div>

<style>
  .root-frame {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  .root-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .site-footer {
    border-top: 1px solid var(--color-line);
  }
  .site-footer__inner {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-1) var(--space-3);
    max-width: 42rem;
    margin: 0 auto;
    width: 100%;
    padding: var(--space-3);
    font-size: 0.7rem;
    line-height: 1.4;
    color: var(--color-ink-muted);
  }
  .site-footer__inner--wide {
    max-width: 64rem;
  }
  @media (max-width: 30rem) {
    .site-footer__inner {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-1);
    }
  }
  .site-footer a {
    color: var(--color-ink-muted);
    text-decoration: underline;
    text-decoration-color: var(--color-line);
    text-underline-offset: 0.15em;
    transition:
      color 0.15s ease,
      text-decoration-color 0.15s ease;
  }
  .site-footer a:hover {
    color: var(--color-ink);
    text-decoration-color: currentColor;
  }
</style>
