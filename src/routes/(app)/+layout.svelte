<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  const shortPubkey = $derived(`${data.pubkey.slice(0, 6)}…${data.pubkey.slice(-4)}`);

  let signingOut = $state(false);

  async function signOut() {
    if (signingOut) return;
    signingOut = true;
    try {
      await fetch('/auth/logout', { method: 'POST' });
      await goto('/login', { invalidateAll: true });
    } finally {
      signingOut = false;
    }
  }

  function current(path: string): 'page' | undefined {
    return page.url.pathname === path ? 'page' : undefined;
  }
</script>

<div class="app-frame">
  <header class="masthead">
    <div class="masthead__inner">
      <a class="wordmark" href="/account">Phostrich</a>

      <nav class="primary" aria-label="Primary">
        <a href="/account" aria-current={current('/account')}>Account</a>
        {#if data.isAdmin}
          <a href="/admin" aria-current={current('/admin')}>Admin</a>
        {/if}
      </nav>

      <div class="identity">
        {#if data.isAdmin}
          <span class="role">Admin</span>
        {/if}
        <span class="pubkey" title={data.pubkey}>{shortPubkey}</span>
        <button type="button" class="signout" onclick={signOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  </header>

  <main class="app-main">
    {@render children()}
  </main>
</div>

<style>
  .app-frame {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .masthead {
    border-bottom: 1px solid var(--color-line);
  }

  .masthead__inner {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    max-width: 64rem;
    margin: 0 auto;
    width: 100%;
    padding: var(--space-2) var(--space-3);
  }

  .wordmark {
    font-family: var(--font-ui);
    font-weight: 600;
    font-size: 1rem;
    color: var(--color-ink);
    text-decoration: none;
    transition: color 0.15s ease;
  }
  .wordmark:hover {
    color: var(--color-ink-muted);
  }

  .primary {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-right: auto;
  }

  .primary a,
  .signout {
    font-family: var(--font-ui);
    font-size: 0.7rem;
    font-weight: 400;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--color-ink-muted);
    text-decoration: none;
    padding: 0 0 2px;
    border: 0;
    border-bottom: 1px solid transparent;
    background: none;
    cursor: pointer;
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .primary a:hover,
  .signout:hover:not(:disabled) {
    color: var(--color-ink);
    border-bottom-color: var(--color-line);
  }

  .primary a[aria-current='page'] {
    color: var(--color-ink);
    border-bottom-color: var(--color-ink);
  }

  .signout:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .identity {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .role {
    font-family: var(--font-ui);
    font-size: 0.6rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-ink-muted);
    border: 1px solid var(--color-line);
    border-radius: 2px;
    padding: 1px 5px;
    align-self: center;
  }

  .pubkey {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    color: var(--color-ink-muted);
  }

  .app-main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-2);
  }

  @media (max-width: 34rem) {
    .identity {
      order: 3;
      width: 100%;
    }
  }
</style>
