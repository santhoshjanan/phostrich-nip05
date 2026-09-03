<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
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
</script>

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

  {#if method === 'extension'}
    <div id="panel-extension" role="tabpanel" aria-labelledby="tab-extension">
      {#if hasExtension}
        <p class="method-note">
          Signs the challenge locally through your installed extension (e.g. Alby, nos2x).
        </p>
        <button onclick={handleExtensionSignIn} disabled={status === 'connecting'}>
          {status === 'connecting' ? 'Signing in…' : 'Sign in with extension'}
        </button>
      {:else}
        <p class="method-note">
          No browser extension was detected. Install one such as
          <a href="https://getalby.com" target="_blank" rel="noreferrer">Alby</a>
          or
          <a href="https://github.com/fiatjaf/nos2x" target="_blank" rel="noreferrer">nos2x</a>,
          or sign in with a remote signer instead.
        </p>
        <button disabled>Sign in with extension</button>
      {/if}
    </div>
  {:else}
    <div id="panel-bunker" role="tabpanel" aria-labelledby="tab-bunker">
      <p class="method-note">
        Connect a remote "bunker" signer. This round-trips over relays, so it can take a moment.
      </p>
      <label for="bunker-uri">Remote signer connection</label>
      <input id="bunker-uri" bind:value={bunkerUri} placeholder="bunker://…" />
      <button onclick={handleBunkerSignIn} disabled={status === 'connecting' || !bunkerUri}>
        {status === 'connecting' ? 'Connecting…' : 'Connect'}
      </button>
    </div>
  {/if}

  {#if status === 'error'}
    <p class="error" role="alert">{errorMessage}</p>
  {/if}
</CredentialCard>

<style>
  .lede {
    margin: 0 0 var(--space-3);
    color: var(--color-ink-muted);
    font-size: 0.875rem;
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

  .method-note {
    margin: 0 0 var(--space-2);
    color: var(--color-ink-muted);
    font-size: 0.875rem;
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
</style>
