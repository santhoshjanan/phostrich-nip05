<script lang="ts">
  interface Props {
    title: string;
    children: import('svelte').Snippet;
  }
  let { title, children }: Props = $props();
</script>

<div class="credential-card">
  <div class="credential-card__header">{title}</div>
  <div class="credential-card__body">
    {@render children()}
  </div>
</div>

<style>
  .credential-card {
    max-width: 28rem;
    width: 100%;
    background: white;
    border: 1px solid var(--color-line);
    padding: var(--space-4);
  }

  .credential-card__header {
    font-family: var(--font-ui);
    font-weight: 600;
    font-size: 1.5rem;
    color: var(--color-ink);
    border-bottom: 1px solid var(--color-line);
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-3);
  }
</style>
