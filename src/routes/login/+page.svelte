<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  import { signInWithBunker, signInWithExtension } from '$lib/client/auth';

  let hasExtension = $state(typeof window !== 'undefined' && Boolean(window.nostr));
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
  .error {
    color: var(--color-accent-rose);
    font-size: 0.875rem;
  }
</style>
