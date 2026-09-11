<!-- src/routes/(bare)/login/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  import GuillocheGround from '$lib/client/GuillocheGround.svelte';
  import { signInWithBunker, signInWithExtension } from '$lib/client/auth';

  type Method = 'extension' | 'bunker';

  const initialHasExtension = typeof window !== 'undefined' && Boolean(window.nostr);
  let hasExtension = $state(initialHasExtension);
  let methodTouched = false;
  let method = $state<Method>(initialHasExtension ? 'extension' : 'bunker');

  // NIP-07 extensions inject window.nostr from a content script, which can land
  // after this page hydrates. Re-check on mount and poll briefly for a late
  // injection so the extension option isn't wrongly reported as unavailable.
  onMount(() => {
    if (window.nostr) {
      hasExtension = true;
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      if (window.nostr) {
        hasExtension = true;
        clearInterval(timer);
      } else if (++tries >= 30) {
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  });

  // Only auto-select the extension tab on late detection if the visitor
  // hasn't already picked a method themselves.
  $effect(() => {
    if (hasExtension && !methodTouched) {
      method = 'extension';
    }
  });

  function selectMethod(next: Method) {
    methodTouched = true;
    method = next;
    status = 'idle';
    errorMessage = '';
  }

  let bunkerUri = $state('');
  let status = $state<'idle' | 'connecting' | 'error'>('idle');
  let errorMessage = $state('');

  async function handleExtensionSignIn() {
    status = 'connecting';
    errorMessage = '';
    try {
      await signInWithExtension();
      await goto('/claim');
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : 'Sign-in failed.';
    }
  }

  async function handleBunkerSignIn() {
    status = 'connecting';
    errorMessage = '';
    try {
      await signInWithBunker(bunkerUri);
      await goto('/claim');
    } catch (err) {
      status = 'error';
      errorMessage = err instanceof Error ? err.message : 'Sign-in failed.';
    }
  }

  // --- Challenge preview -----------------------------------------------------
  // A representative NIP-98 (kind 27235) auth event — the exact shape your
  // signer signs at sign-in (see buildAuthEventTemplate). The challenge value
  // is a fresh 32-byte sample that streams in character by character each time
  // a method is chosen, so "sign a challenge" is something you can see rather
  // than a phrase. Not the real challenge — that's issued when you sign in.
  const CHALLENGE_LEN = 64;
  // One span per character, always present — revealing a character only ever
  // toggles a class on its own span, never changes text content or adds/
  // removes DOM nodes. Splitting the reveal into two variable-length runs
  // (an earlier version of this) measurably shifted Chromium's line-wrap at
  // certain split ratios, which read as the whole panel jumping mid-stream.
  // Placeholder chars are SSR-safe (known before any JS runs) and reserve the
  // full width from the very first paint; the real sample overwrites them
  // once per stream start, never per frame.
  let challengeChars = $state<string[]>(Array.from({ length: CHALLENGE_LEN }, () => 'f'));
  let revealedCount = $state(0);
  let streaming = $state(false);

  // The blinking caret is positioned in pixels, not by moving it through the
  // character list in the DOM — an earlier version inserted/removed it at the
  // reveal boundary every frame, and that DOM churn (destroying and
  // recreating a conditional block 60x/sec) measurably perturbed Chromium's
  // line-wrap for a frame at a time, which read as the panel twitching
  // vertically mid-stream. `position: absolute` takes it out of flow so it
  // can never affect the text's own wrapping, however it moves.
  let chalEl = $state<HTMLElement>();
  let caretEl = $state<HTMLElement>();
  let caretIdle = $state(true);
  $effect(() => {
    if (!chalEl || !caretEl) return;
    if (!streaming) {
      caretIdle = true;
      return;
    }
    const chars = chalEl.querySelectorAll<HTMLElement>('.chal-char');
    const target = chars[revealedCount] ?? chars[chars.length - 1];
    if (!target) return;
    const wrapRect = chalEl.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    caretEl.style.left = `${targetRect.left - wrapRect.left}px`;
    caretEl.style.top = `${targetRect.top - wrapRect.top}px`;
    caretIdle = false;
  });

  function sampleHex(len: number): string {
    const bytes = new Uint8Array(len / 2);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Split around the challenge value so the caret can sit at the live typing
  // point rather than after the closing brace.
  const EVENT_HEAD = [
    '{',
    '  "kind": 27235,',
    '  "tags": [',
    '    ["u", "https://phostrich.com/auth/verify"],',
    '    ["method", "POST"],',
    '    ["challenge", "'
  ].join('\n');
  const EVENT_TAIL = ['"]', '  ],', '  "content": ""', '}'].join('\n');

  // Re-arm the streaming sample whenever the selected method changes. Runs
  // client-only (effects don't run during SSR). Time-based rather than a
  // fixed per-tick step, so it always resolves in ~900ms of wall clock
  // regardless of frame rate, and cleans up its own frame request.
  const STREAM_MS = 900;
  $effect(() => {
    void method;
    const full = sampleHex(CHALLENGE_LEN);
    challengeChars = full.split('');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      revealedCount = CHALLENGE_LEN;
      streaming = false;
      return;
    }

    revealedCount = 0;
    streaming = true;
    const started = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const p = Math.min(1, (now - started) / STREAM_MS);
      revealedCount = Math.floor(p * CHALLENGE_LEN);
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        revealedCount = CHALLENGE_LEN;
        streaming = false;
      }
    });

    return () => cancelAnimationFrame(raf);
  });
</script>

<GuillocheGround />

<div class="login-desk">
  <section class="brief">
    <header class="brand">
      <h1 class="wordmark">Phostrich<span aria-hidden="true">.com</span></h1>
      <p class="tagline">NIP-05 identifiers for Nostr, issued by signature.</p>
    </header>

    <div class="prose">
      <p>
        <strong>Nostr</strong> is an open protocol for publishing and social messaging where your
        identity is a keypair you hold — not an account on a company's server. Nothing can lock you
        out, but your public identity is a long, unreadable
        <code>npub1…</code> string that no one can recall or say aloud.
      </p>
      <p>
        <strong>NIP-05</strong> is the piece of the protocol that gives that key a human-readable
        address. Phostrich issues you one — <code>you@phostrich.com</code> — and serves the mapping
        at <code>/.well-known/nostr.json</code>, so any Nostr client shows a verified name in place
        of the raw key.
      </p>
    </div>

    <dl class="facts">
      <div class="def-row">
        <dt class="ledger-label">What you get</dt>
        <dd>
          One identifier per key, resolvable by every NIP-05-aware client. One key, one name, in v1.
        </dd>
      </div>
      <div class="def-row">
        <dt class="ledger-label">Sign-in</dt>
        <dd>
          No email, no password. You prove the key is yours by signing a one-time challenge — with a
          browser extension (NIP-07) or a remote bunker signer (NIP-46).
        </dd>
      </div>
      <div class="def-row">
        <dt class="ledger-label">Release policy</dt>
        <dd>
          An identifier with no lookups for six months becomes eligible for release. Stated here, at
          claim time — never delivered as a later surprise.
        </dd>
      </div>
    </dl>
  </section>

  <section class="signin">
    <CredentialCard title="Sign in">
      <p class="lede">Authenticate by signing a challenge with your key — no password, no email.</p>

      <div class="method-tabs" role="tablist" aria-label="Sign-in method">
        <button
          type="button"
          role="tab"
          id="tab-extension"
          aria-selected={method === 'extension'}
          aria-controls="panel-extension"
          class="method-tab"
          class:active={method === 'extension'}
          onclick={() => selectMethod('extension')}
        >
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path
              d="M6.5 4.75h2.25a1.25 1.25 0 1 1 2.5 0h2.25a1 1 0 0 1 1 1v2.25a1.25 1.25 0 1 0 0 2.5v2.25a1 1 0 0 1-1 1h-2.25a1.25 1.25 0 1 0-2.5 0H6.5a1 1 0 0 1-1-1v-2.25a1.25 1.25 0 1 0 0-2.5V5.75a1 1 0 0 1 1-1Z"
            />
          </svg>
          Browser extension
        </button>
        <button
          type="button"
          role="tab"
          id="tab-bunker"
          aria-selected={method === 'bunker'}
          aria-controls="panel-bunker"
          class="method-tab"
          class:active={method === 'bunker'}
          onclick={() => selectMethod('bunker')}
        >
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path d="M10 12.1h.01" />
            <path d="M7.8 9.9a3.2 3.2 0 0 1 4.4 0" />
            <path d="M5.9 8a6 6 0 0 1 8.2 0" />
          </svg>
          Remote signer
        </button>
      </div>

      <div class="panel-wrap">
        <div
          id="panel-extension"
          role="tabpanel"
          aria-labelledby="tab-extension"
          class:panel--inactive={method !== 'extension'}
          inert={method !== 'extension'}
        >
          <div class="note-stack">
            <p class="method-note" class:panel--inactive={!hasExtension} inert={!hasExtension}>
              Signs the challenge locally through your installed extension (e.g. Alby, nos2x).
            </p>
            <p class="method-note" class:panel--inactive={hasExtension} inert={hasExtension}>
              No browser extension was detected. Install one such as
              <a href="https://getalby.com" target="_blank" rel="noreferrer">Alby</a>
              or
              <a href="https://github.com/fiatjaf/nos2x" target="_blank" rel="noreferrer">nos2x</a>,
              or sign in with a remote signer instead.
            </p>
          </div>
          <button
            onclick={handleExtensionSignIn}
            disabled={!hasExtension || status === 'connecting'}
          >
            {status === 'connecting' ? 'Signing in…' : 'Sign in with extension'}
          </button>
        </div>

        <div
          id="panel-bunker"
          role="tabpanel"
          aria-labelledby="tab-bunker"
          class:panel--inactive={method !== 'bunker'}
          inert={method !== 'bunker'}
        >
          <p class="method-note">
            Connect a remote "bunker" signer. This round-trips over relays, so it can take a moment.
          </p>
          <label for="bunker-uri">Remote signer connection</label>
          <input id="bunker-uri" bind:value={bunkerUri} placeholder="bunker://…" />
          <button onclick={handleBunkerSignIn} disabled={status === 'connecting' || !bunkerUri}>
            {status === 'connecting' ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>

      {#if status === 'error'}
        <p class="error" role="alert">{errorMessage}</p>
      {/if}

      <div class="challenge" aria-hidden="true">
        <span class="ledger-label">Challenge · sample</span>
        <pre class="challenge__event"><code
            >{EVENT_HEAD}<span class="chal" bind:this={chalEl}>{#each challengeChars as c, i (i)}<span
                  class="chal-char"
                  class:chal-char--hidden={i >= revealedCount}>{c}</span
                >{/each}<span
                class="caret"
                class:caret--idle={caretIdle}
                bind:this={caretEl}></span></span>{EVENT_TAIL}</code
          ></pre>
        <p class="challenge__note">
          Your signer signs this NIP-98 event. Phostrich checks the signature against your public
          key; the challenge is single-use and expires within minutes.
        </p>
      </div>
    </CredentialCard>
  </section>
</div>

<style>
  .login-desk {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-4);
    width: 100%;
    max-width: 64rem;
    /* auto block margins center vertically without clipping tall content */
    margin: auto;
    position: relative;
    z-index: 1;
  }

  @media (min-width: 62rem) {
    .login-desk {
      grid-template-columns: minmax(0, 1fr) minmax(23rem, 27rem);
      gap: var(--space-4);
      align-items: start;
    }
  }

  /* --- Brief column ------------------------------------------------------- */
  .brief {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 34rem;
  }

  .brand {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-line);
  }

  .wordmark {
    font-family: var(--font-ui);
    font-weight: 600;
    font-size: 1.75rem;
    line-height: 1.1;
    letter-spacing: -0.01em;
    color: var(--color-ink);
    margin: 0;
  }
  .wordmark span {
    color: var(--color-ink-muted);
    font-weight: 400;
  }

  .tagline {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
    letter-spacing: 0.01em;
    color: var(--color-ink-muted);
  }

  .prose {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .prose p {
    margin: 0;
    font-size: 1rem;
    line-height: 1.6;
    color: var(--color-ink);
  }
  .prose strong {
    font-weight: 600;
  }
  .prose code,
  .challenge__event code {
    font-family: var(--font-mono);
    font-size: 0.82em;
    color: var(--color-ink);
  }
  .prose code {
    background: var(--color-paper);
    border: 1px solid var(--color-line);
    border-radius: 2px;
    padding: 0.05em 0.3em;
    /* Keep each token intact — a wrapped, double-bordered fragment reads as broken. */
    white-space: nowrap;
  }

  .facts {
    margin: 0;
    display: flex;
    flex-direction: column;
  }
  .def-row {
    display: grid;
    grid-template-columns: 8rem 1fr;
    gap: var(--space-2);
    border-top: 1px solid var(--color-line);
    padding-top: var(--space-1);
    margin-top: var(--space-2);
  }
  .def-row dd {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.55;
    color: var(--color-ink-muted);
  }
  .def-row .ledger-label {
    padding-top: 0.1rem;
  }

  @media (max-width: 30rem) {
    .def-row {
      grid-template-columns: 1fr;
      gap: var(--space-1);
    }
  }

  /* --- Sign-in column -------------------------------------------------------- */
  .signin :global(.credential-card) {
    max-width: none;
  }

  .lede {
    margin: 0 0 var(--space-3);
    color: var(--color-ink-muted);
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.5;
  }

  .method-tabs {
    display: flex;
    border: 1px solid var(--color-line);
    border-radius: 2px;
    margin-bottom: var(--space-3);
    overflow: hidden;
  }

  .method-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.6rem 0.5rem;
    background: var(--color-paper);
    color: var(--color-ink-muted);
    border: none;
    border-radius: 0;
    font-size: 0.875rem;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .method-tab:not(:first-child) {
    border-left: 1px solid var(--color-line);
  }

  .method-tab svg {
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .method-tab:hover:not(.active) {
    background: var(--color-canvas);
    color: var(--color-ink);
  }

  .method-tab.active {
    background: var(--color-ink);
    color: var(--color-canvas);
  }

  /* Both tab panels occupy the same grid cell, so the wrapper is always as
     tall as the tallest one and switching tabs cannot move anything — the
     card, and the copy centered alongside it, hold their position. The same
     stacking handles the two extension notes, whose height differs and which
     swap on their own when a late-injecting extension is detected. */
  .panel-wrap,
  .note-stack {
    display: grid;
  }
  .panel-wrap > [role='tabpanel'],
  .note-stack > .method-note {
    grid-area: 1 / 1;
  }
  /* Held in layout (so it keeps reserving its height) but unpainted,
     unfocusable, and out of the accessibility tree. */
  .panel--inactive {
    visibility: hidden;
  }

  .method-note {
    margin: 0 0 var(--space-2);
    color: var(--color-ink-muted);
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.5;
  }

  .method-note a {
    color: var(--color-ink);
  }

  #bunker-uri {
    margin-bottom: var(--space-2);
  }

  .error {
    margin-top: var(--space-2);
    color: var(--color-accent-rose-text);
    font-size: 0.875rem;
  }

  /* --- Challenge preview ------------------------------------------------- */
  .challenge {
    margin-top: var(--space-3);
    border-top: 1px solid var(--color-line);
    padding-top: var(--space-2);
  }
  .challenge .ledger-label {
    display: block;
    margin-bottom: var(--space-1);
  }
  .challenge__event {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    line-height: 1.7;
    color: var(--color-ink);
    background: var(--color-canvas);
    border: 1px solid var(--color-line);
    border-radius: 2px;
    padding: var(--space-2);
    /* Wrap long lines (the challenge hex, the verify URL) in place rather than
       forcing a horizontal scrollbar inside the card; indentation is kept. */
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .challenge__event code {
    font-size: inherit;
  }
  .chal {
    position: relative;
    overflow-wrap: anywhere;
  }
  /* Every character keeps its own permanent span from the moment a sample is
     drawn — revealing it only ever toggles this class. Content and DOM
     structure never change mid-stream, so the block's wrap can't shift. */
  .chal-char--hidden {
    visibility: hidden;
  }
  /* Positioned in pixels (via the script's effect), not by living inside the
     character list — `position: absolute` takes it fully out of flow so its
     movement can never itself affect how the text wraps. */
  .caret {
    position: absolute;
    width: 0.5ch;
    height: 1.05em;
    background: var(--color-ink);
    translate: 0 0.15em;
    animation: caret-blink 1.1s steps(1) infinite;
  }
  .caret--idle {
    visibility: hidden;
    animation: none;
  }
  @keyframes caret-blink {
    0%,
    45% {
      opacity: 1;
    }
    50%,
    95% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .caret {
      display: none;
    }
  }
  .challenge__note {
    margin: var(--space-1) 0 0;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.5;
    color: var(--color-ink-muted);
  }

  /* Soft, in-system arrival for the sign-in panel (fast, no easing drama, per
     the design system's motion rule); the streaming challenge is the one
     authored moment that performs. */
  @media (prefers-reduced-motion: no-preference) {
    .signin {
      animation: panel-in 0.18s ease-out both;
    }
    @keyframes panel-in {
      from {
        opacity: 0;
        translate: 0 0.25rem;
      }
      to {
        opacity: 1;
        translate: 0 0;
      }
    }
  }
</style>
