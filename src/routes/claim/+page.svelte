<script lang="ts">
  import { goto } from '$app/navigation';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  import { checkAvailability, debounce, submitClaim, type AvailabilityState } from '$lib/client/claimForm';

  let name = $state('');
  let availability = $state<AvailabilityState>('idle');
  let showModal = $state(false);
  let submitError = $state('');

  const debouncedCheck = debounce(async (value: string) => {
    if (value.length < 2) {
      availability = 'idle';
      return;
    }
    availability = 'checking';
    const available = await checkAvailability(value);
    availability = available ? 'available' : 'unavailable';
  }, 400);

  function handleInput() {
    debouncedCheck(name.toLowerCase());
  }

  function openModal() {
    if (availability === 'available') {
      showModal = true;
    }
  }

  async function confirmClaim() {
    const result = await submitClaim(name.toLowerCase());
    if (result.ok) {
      await goto('/claimed');
    } else if (result.error === 'unauthenticated') {
      await goto('/login');
    } else {
      submitError = result.error;
      showModal = false;
    }
  }
</script>

<CredentialCard title="Claim your identifier">
  <label for="name">Identifier name</label>
  <input id="name" bind:value={name} oninput={handleInput} placeholder="alice" />

  {#if availability === 'checking'}
    <p class="status">checking…</p>
  {:else if availability === 'available'}
    <p class="status status--available">available</p>
  {:else if availability === 'unavailable'}
    <p class="status status--unavailable">not available</p>
  {/if}

  <button onclick={openModal} disabled={availability !== 'available'}>Claim this name</button>

  {#if submitError}
    <p class="error" role="alert">
      {submitError === 'owner_cap' ? 'You already own an identifier.' : 'That name is no longer available.'}
    </p>
  {/if}
</CredentialCard>

{#if showModal}
  <div class="modal" role="dialog" aria-modal="true">
    <div class="modal__content">
      <p>
        This identifier is automatically freed for someone else to claim after 6 months with no lookup
        activity against it.
      </p>
      <button onclick={confirmClaim}>I understand, claim this name</button>
      <button onclick={() => (showModal = false)}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .status--available {
    color: var(--color-accent-mint);
  }
  .status--unavailable {
    color: var(--color-accent-rose);
    text-decoration: line-through;
  }
  .error {
    color: var(--color-accent-rose);
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
  }
</style>
