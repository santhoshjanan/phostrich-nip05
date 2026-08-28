<script lang="ts">
  import { goto } from '$app/navigation';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  interface Props {
    data: { identifier: string; issuedAt: string | Date };
  }
  let { data }: Props = $props();
  let copied = $state(false);
  let signingOut = $state(false);

  const issuedOn = $derived(
    new Date(data.issuedAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  );

  async function copy() {
    await navigator.clipboard.writeText(data.identifier);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

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
</script>

<CredentialCard title="Identifier issued">
  <div class="ledger-row name-row">
    <span class="ledger-label">Name</span>
    <div class="issued-row">
      <p class="identifier">{data.identifier}</p>
      <div class="seal" aria-hidden="true">Issued</div>
    </div>
  </div>
  <div class="ledger-row">
    <span class="ledger-label">Issued</span>
    <span class="ledger-value">{issuedOn}</span>
  </div>
  <div class="ledger-row">
    <span class="ledger-label">Status</span>
    <span class="ledger-value">Active</span>
  </div>

  <p class="copy-action"><button onclick={copy}>{copied ? 'Copied' : 'Copy'}</button></p>

  <div class="next-actions">
    <a class="go-account" href="/account">Go to your account</a>
    <button type="button" class="linkish" onclick={signOut} disabled={signingOut}>
      {signingOut ? 'Signing out…' : 'Sign out'}
    </button>
  </div>
  <p class="note">Manage relays or release this identifier from your account.</p>
</CredentialCard>

<style>
  .name-row {
    flex-direction: column;
    align-items: stretch;
    border-top: none;
    margin-top: 0;
    gap: var(--space-1);
  }
  .issued-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .identifier {
    font-family: var(--font-display);
    font-size: 1.25rem;
    color: var(--color-ink);
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .copy-action {
    margin-top: var(--space-3);
  }
  .next-actions {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    border-top: 1px solid var(--color-line);
    margin-top: var(--space-3);
    padding-top: var(--space-3);
  }
  @media (max-width: 30rem) {
    .next-actions {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }
  }
  .go-account {
    display: inline-block;
    padding: 0.5rem 1.25rem;
    border: 1px solid var(--color-ink);
    background: var(--color-ink);
    color: var(--color-canvas);
    border-radius: 2px;
    font-family: var(--font-ui);
    font-size: 0.95rem;
    text-decoration: none;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease;
  }
  .go-account:hover {
    background: var(--color-ink-muted);
    border-color: var(--color-ink-muted);
  }
  .linkish {
    padding: 0;
    border: 0;
    border-bottom: 1px solid transparent;
    background: none;
    color: var(--color-ink-muted);
    font-family: var(--font-ui);
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    cursor: pointer;
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
  }
  .linkish:hover:not(:disabled) {
    color: var(--color-ink);
    border-bottom-color: var(--color-line);
  }
  .linkish:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .note {
    font-size: 0.875rem;
    color: var(--color-ink-muted);
    margin-top: var(--space-2);
  }
</style>
