<script lang="ts">
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  interface Props {
    data: { identifier: string; issuedAt: string | Date };
  }
  let { data }: Props = $props();
  let copied = $state(false);

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
  <p class="note">Account and relay management are coming in a future update.</p>
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
    align-items: center;
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
  .note {
    font-size: 0.875rem;
    color: var(--color-ink-muted);
  }
</style>
