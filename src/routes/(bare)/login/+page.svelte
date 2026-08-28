<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  import { signInWithBunker, signInWithExtension } from '$lib/client/auth';

  let hasExtension = $state(typeof window !== 'undefined' && Boolean(window.nostr));

  // NIP-07 extensions inject window.nostr from a content script, which can land
  // after this page hydrates. Re-check on mount and poll briefly for a late
  // injection so the extension option isn't hidden by a load-order race.
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
  {#if hasExtension}
    <button onclick={handleExtensionSignIn} disabled={status === 'connecting'}>
      {status === 'connecting' ? 'Signing in…' : 'Sign in with extension'}
    </button>
  {:else}
    <label for="bunker-uri">Remote signer connection</label>
    <input id="bunker-uri" bind:value={bunkerUri} placeholder="bunker://…" />
    <button onclick={handleBunkerSignIn} disabled={status === 'connecting'}>
      {status === 'connecting' ? 'Connecting…' : 'Connect'}
    </button>
  {/if}

  {#if status === 'error'}
    <p class="error" role="alert">{errorMessage}</p>
  {/if}
</CredentialCard>

<style>
  #bunker-uri {
    margin-bottom: var(--space-2);
  }
  .error {
    color: var(--color-accent-rose-text);
    font-size: 0.875rem;
  }
</style>
