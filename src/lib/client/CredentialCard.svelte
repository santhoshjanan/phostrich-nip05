<script lang="ts">
  let { title, children } = $props<{ title: string; children: import('svelte').Snippet }>();
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
    margin: 4rem auto;
    background: white;
    border: 1px solid var(--color-line);
    padding: var(--space-4);
  }

  .credential-card__header {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.5rem;
    color: var(--color-ink);
    border-bottom: 2px solid var(--color-ink);
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-3);
  }
</style>
