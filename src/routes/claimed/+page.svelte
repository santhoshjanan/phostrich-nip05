<script lang="ts">
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  interface Props {
    data: { identifier: string };
  }
  let { data }: Props = $props();
  let copied = $state(false);

  async function copy() {
    await navigator.clipboard.writeText(data.identifier);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<CredentialCard title="Identifier issued">
  <p class="identifier">{data.identifier}</p>
  <button onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
  <p class="note">Account and relay management are coming in a future update.</p>
</CredentialCard>

<style>
  .identifier {
    font-family: var(--font-display);
    font-size: 1.25rem;
    color: var(--color-ink);
  }
  .note {
    font-size: 0.875rem;
    color: var(--color-line);
  }
</style>
