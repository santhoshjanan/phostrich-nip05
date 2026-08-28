<script lang="ts">
  import { goto } from '$app/navigation';
  import { fade, scale } from 'svelte/transition';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  import { checkAvailability, debounce, submitClaim, type AvailabilityState } from '$lib/client/claimForm';

  let name = $state('');
  let availability = $state<AvailabilityState>('idle');
  let showModal = $state(false);
  let submitError = $state('');
  let isSubmitting = $state(false);

  // Each debounced check compares the CURRENT `name` input against the
  // `value` it was invoked with, so an out-of-order (stale) response is
  // discarded instead of overwriting the status for whatever the user has
  // since typed.
  const debouncedCheck = debounce(async (value: string) => {
    if (value.length < 2) {
      if (name.toLowerCase() === value) availability = 'idle';
      return;
    }
    try {
      const available = await checkAvailability(value);
      if (name.toLowerCase() !== value) return; // stale response, discard
      availability = available ? 'available' : 'unavailable';
    } catch {
      if (name.toLowerCase() !== value) return; // stale response, discard
      availability = 'error';
    }
  }, 400);

  function handleInput() {
    const value = name.toLowerCase();
    availability = value.length < 2 ? 'idle' : 'checking';
    debouncedCheck(value);
  }

  function openModal() {
    if (availability === 'available') {
      showModal = true;
    }
  }

  async function confirmClaim() {
    if (isSubmitting) return;
    isSubmitting = true;
    try {
      const result = await submitClaim(name.toLowerCase());
      if (result.ok) {
        await goto('/claimed');
      } else if (result.error === 'unauthenticated') {
        await goto('/login');
      } else {
        submitError = result.error;
        showModal = false;
      }
    } catch {
      submitError = 'unknown_error';
      showModal = false;
    } finally {
      isSubmitting = false;
    }
  }
</script>

<CredentialCard title="Claim your identifier">
  <label for="name" class="ledger-label">Identifier name</label>
  <input id="name" class="identifier-input" bind:value={name} oninput={handleInput} placeholder="alice" />

  {#if availability !== 'idle'}
    <div class="ledger-row">
      <span class="ledger-label">Status</span>
      {#if availability === 'checking'}
        <span class="ledger-value status">checking…</span>
      {:else if availability === 'available'}
        <span class="ledger-value status status--available">available</span>
      {:else if availability === 'unavailable'}
        <span class="ledger-value status status--unavailable">not available</span>
      {:else if availability === 'error'}
        <span class="ledger-value status status--error">couldn't check right now</span>
      {/if}
    </div>
  {/if}

  <p class="claim-action">
    <button onclick={openModal} disabled={availability !== 'available'}>Claim this name</button>
  </p>

  {#if submitError}
    <p class="error" role="alert">
      {submitError === 'owner_cap' ? 'You already own an identifier.' : 'That name is no longer available.'}
    </p>
  {/if}
</CredentialCard>

{#if showModal}
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    aria-describedby="modal-description"
    transition:fade={{ duration: 200 }}
  >
    <div class="modal__content" transition:scale={{ duration: 200, start: 0.98 }}>
      <div class="modal__header">
        <span class="ledger-label">Policy</span>
        <h2 id="modal-title">Before you claim</h2>
      </div>
      <p id="modal-description">
        This identifier is automatically freed for someone else to claim after 6 months with no lookup
        activity against it.
      </p>
      <button onclick={confirmClaim} disabled={isSubmitting}>I understand, claim this name</button>
      <button class="secondary" onclick={() => (showModal = false)}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .identifier-input {
    font-family: var(--font-display);
    font-size: 1.1rem;
    margin-bottom: var(--space-2);
  }
  .status--available {
    color: var(--color-accent-mint-text);
  }
  .status--unavailable {
    color: var(--color-accent-rose-text);
    text-decoration: line-through;
  }
  .status--error {
    color: var(--color-accent-rose-text);
  }
  .claim-action {
    margin-top: var(--space-3);
  }
  .error {
    color: var(--color-accent-rose-text);
  }
  .modal {
    position: fixed;
    inset: 0;
    background: rgba(46, 42, 51, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .modal__content {
    background: white;
    max-width: 24rem;
    padding: var(--space-4);
    border: 1px solid var(--color-line);
  }
  .modal__header {
    border-bottom: 1px solid var(--color-line);
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .modal__header .ledger-label {
    display: block;
    margin-bottom: 0.25rem;
  }
  .modal__header h2 {
    font-family: var(--font-ui);
    font-weight: 600;
    font-size: 1.15rem;
    color: var(--color-ink);
    margin: 0;
  }
  .modal__content button {
    margin-top: var(--space-2);
    margin-right: var(--space-1);
  }
</style>
