<script lang="ts">
  import { goto } from '$app/navigation';
  import { fade, scale } from 'svelte/transition';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  import {
    eligibleForReleaseDate,
    parseRelayError,
    releaseIdentifier,
    saveRelays
  } from '$lib/client/accountForm';

  let { data } = $props<{ data: { name: string; relays: string[]; lastIdentifiedAt: string } }>();

  let relays = $state<string[]>([]);
  let saveError = $state('');
  let saveStatus = $state<'idle' | 'saving' | 'saved'>('idle');
  let relayErrorIndex = $state<number | null>(null);
  let relayErrorMessage = $state('');
  let showReleaseModal = $state(false);
  let releaseStatus = $state<'idle' | 'releasing'>('idle');
  let releaseError = $state('');

  const lastVerifiedDate = $derived(
    new Date(data.lastIdentifiedAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  );
  const eligibleDate = $derived(
    eligibleForReleaseDate(data.lastIdentifiedAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  );

  $effect(() => {
    relays = [...data.relays];
  });

  function markRelaysDirty() {
    saveStatus = 'idle';
    saveError = '';
    relayErrorIndex = null;
    relayErrorMessage = '';
  }

  function addRelay() {
    markRelaysDirty();
    if (relays.length < 8) relays = [...relays, ''];
  }

  function removeRelay(index: number) {
    markRelaysDirty();
    relays = relays.filter((_, relayIndex) => relayIndex !== index);
  }

  function updateRelay(index: number, value: string) {
    markRelaysDirty();
    relays = relays.map((relay, relayIndex) => (relayIndex === index ? value : relay));
  }

  async function save() {
    if (saveStatus === 'saving') return;

    saveStatus = 'saving';
    saveError = '';
    relayErrorIndex = null;
    relayErrorMessage = '';
    try {
      const result = await saveRelays(relays.filter((relay) => relay.trim().length > 0));
      if (result.ok) {
        relays = result.relays;
        saveStatus = 'saved';
        return;
      }

      const relayError = parseRelayError(result.error);
      if (relayError && relayError.index < relays.length) {
        relayErrorIndex = relayError.index;
        relayErrorMessage = relayError.message;
        return;
      }

      saveError = result.error;
    } catch {
      saveError = 'We could not save your relays. Please try again.';
    } finally {
      if (saveStatus === 'saving') saveStatus = 'idle';
    }
  }

  function openReleaseModal() {
    releaseError = '';
    showReleaseModal = true;
  }

  async function confirmRelease() {
    if (releaseStatus === 'releasing') return;

    releaseStatus = 'releasing';
    releaseError = '';
    const result = await releaseIdentifier();
    if (result.ok) {
      await goto('/claim');
      return;
    }

    releaseError = 'We could not release this identifier. Please try again.';
    releaseStatus = 'idle';
  }
</script>

<CredentialCard title="Account">
  <div class="ledger-row account-name">
    <span class="ledger-label">Identifier</span>
    <span class="identifier">{data.name}</span>
  </div>
  <div class="ledger-row">
    <span class="ledger-label">Last verified</span>
    <span class="ledger-value">{lastVerifiedDate}</span>
  </div>
  <div class="ledger-row">
    <span class="ledger-label">Eligible for release after</span>
    <span class="ledger-value">{eligibleDate}</span>
  </div>

  <section class="relays" aria-labelledby="relays-heading">
    <h2 id="relays-heading">Relays</h2>
    <p class="relay-note">Public · wss:// only · {relays.length} of 8</p>

    {#each relays as relay, index}
      <div class="relay-row">
        <label class="sr-only" for={`relay-${index}`}>Relay {index + 1}</label>
        <input
          id={`relay-${index}`}
          class="relay-input"
          type="url"
          value={relay}
          oninput={(event) => updateRelay(index, event.currentTarget.value)}
          placeholder="wss://relay.example"
          aria-invalid={relayErrorIndex === index ? 'true' : undefined}
          aria-describedby={relayErrorIndex === index ? `relay-${index}-error` : undefined}
        />
        <button class="secondary remove-button" onclick={() => removeRelay(index)}>Remove</button>
      </div>
      {#if relayErrorIndex === index}
        <p id={`relay-${index}-error`} class="error relay-error" role="alert">
          {relayErrorMessage}
        </p>
      {/if}
    {/each}

    {#if relays.length < 8}
      <button class="secondary add-button" onclick={addRelay}>Add relay</button>
    {/if}

    <div class="relay-actions">
      <button onclick={save} disabled={saveStatus === 'saving'}>
        {saveStatus === 'saving' ? 'Saving…' : 'Save relays'}
      </button>
      <span class="save-status" aria-live="polite">{saveStatus === 'saved' ? 'Saved' : ''}</span>
    </div>
    {#if saveError}
      <p class="error" role="alert">{saveError}</p>
    {/if}
  </section>

  <section class="release" aria-labelledby="release-heading">
    <h2 id="release-heading">Release identifier</h2>
    <p>Releasing it immediately makes {data.name} available for anyone else to claim.</p>
    <button class="secondary release-button" onclick={openReleaseModal}
      >Release this identifier</button
    >
  </section>
</CredentialCard>

{#if showReleaseModal}
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="release-modal-title"
    aria-describedby="release-modal-description"
    transition:fade={{ duration: 200 }}
  >
    <div class="modal__content" transition:scale={{ duration: 200, start: 0.98 }}>
      <div class="modal__header">
        <span class="ledger-label">Release</span>
        <h2 id="release-modal-title">Release {data.name}?</h2>
      </div>
      <p id="release-modal-description">
        This cannot be undone. Once released, anyone can claim this identifier.
      </p>
      {#if releaseError}
        <p class="error" role="alert">{releaseError}</p>
      {/if}
      <div class="modal__actions">
        <button onclick={confirmRelease} disabled={releaseStatus === 'releasing'}>
          {releaseStatus === 'releasing' ? 'Releasing…' : `Release ${data.name}`}
        </button>
        <button
          class="secondary"
          onclick={() => (showReleaseModal = false)}
          disabled={releaseStatus === 'releasing'}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .account-name {
    align-items: center;
  }
  .identifier {
    font-family: var(--font-display);
    font-size: 1.25rem;
    overflow-wrap: anywhere;
    text-align: right;
  }
  .relays,
  .release {
    border-top: 1px solid var(--color-line);
    margin-top: var(--space-3);
    padding-top: var(--space-2);
  }
  h2 {
    font-family: var(--font-ui);
    font-size: 1.15rem;
    font-weight: 600;
    margin: 0;
  }
  .relay-note,
  .release p {
    color: var(--color-ink-muted);
    font-size: 0.875rem;
    line-height: 1.5;
    margin: var(--space-1) 0 var(--space-2);
  }
  .relay-row {
    align-items: center;
    display: flex;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }
  .relay-input {
    background: white;
    border: 1px solid var(--color-line);
    border-radius: 2px;
    color: var(--color-ink);
    flex: 1;
    font-family: var(--font-ui);
    font-size: 1rem;
    min-width: 0;
    padding: 0.5rem 0.75rem;
  }
  .relay-input:focus {
    border-color: var(--color-ink);
    outline: 2px solid var(--color-accent-mint);
    outline-offset: 1px;
  }
  .relay-input::placeholder {
    color: var(--color-ink-muted);
  }
  .add-button,
  .release-button {
    margin-top: var(--space-2);
  }
  .remove-button {
    flex-shrink: 0;
    padding-inline: var(--space-2);
  }
  .relay-actions {
    align-items: center;
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  .save-status {
    color: var(--color-accent-mint-text);
    font-size: 0.875rem;
    min-height: 1.5em;
  }
  .error {
    color: var(--color-accent-rose-text);
    font-size: 0.875rem;
    margin: var(--space-1) 0 0;
  }
  .modal {
    align-items: center;
    background: rgba(46, 42, 51, 0.5);
    display: flex;
    inset: 0;
    justify-content: center;
    padding: var(--space-2);
    position: fixed;
  }
  .modal__content {
    background: white;
    border: 1px solid var(--color-line);
    max-width: 24rem;
    padding: var(--space-4);
  }
  .modal__header {
    border-bottom: 1px solid var(--color-line);
    margin-bottom: var(--space-3);
    padding-bottom: var(--space-2);
  }
  .modal__header .ledger-label {
    display: block;
    margin-bottom: 0.25rem;
  }
  .modal__header h2 {
    color: var(--color-ink);
  }
  .modal__content p {
    line-height: 1.5;
  }
  .modal__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-3);
  }
  .sr-only {
    height: 1px;
    margin: -1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    width: 1px;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  @media (max-width: 32rem) {
    .relay-row {
      align-items: stretch;
      flex-direction: column;
    }
    .remove-button {
      align-self: flex-start;
    }
  }
</style>
