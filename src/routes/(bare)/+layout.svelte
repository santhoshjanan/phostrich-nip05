<script lang="ts">
  let { children } = $props();
</script>

<!--
Chrome-free routes: /login (sign-in moment) and /claimed (issued-credential
moment). A single centered card on the ledger ground, no masthead — the
authenticated app shell lives in (app)/+layout.svelte.
-->

<div class="screen-center">
  {@render children()}
</div>

<style>
  .screen-center {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-2);
  }
</style>
