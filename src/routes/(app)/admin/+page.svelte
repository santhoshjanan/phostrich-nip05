<script lang="ts">
  import { tick } from 'svelte';
  import CredentialCard from '$lib/client/CredentialCard.svelte';
  import PageMeta from '$lib/client/PageMeta.svelte';
  import {
    createReservation,
    forceReleaseIdentifier,
    removeReservation
  } from '$lib/client/adminForm';

  let { data } = $props<{
    data: {
      stale: { name: string; ownerPubkey: string | null; lastIdentifiedAt: string }[];
      reservations: {
        name: string;
        reason: string | null;
        actorPubkey: string | null;
        createdAt: string;
      }[];
    };
  }>();

  let stale = $derived([...data.stale]);
  let reservations = $derived([...data.reservations]);

  let releaseTarget = $state<string | null>(null);
  let releaseReason = $state('');
  let releaseError = $state('');
  let releasePending = $state(false);
  let reservationRemovalTarget = $state<string | null>(null);
  let removalError = $state('');
  let removalPending = $state(false);
  let destructiveLauncher = $state<HTMLButtonElement>();
  let destructiveSafeAction = $state<HTMLButtonElement>();
  let destructiveDialog = $state<HTMLDivElement>();
  let staleHeading = $state<HTMLHeadingElement>();
  let reservationsHeading = $state<HTMLHeadingElement>();
  let adminStatus = $state('');

  let newReservationName = $state('');
  let newReservationReason = $state('');
  let reservationError = $state('');
  let reservationPending = $state(false);

  function formatDate(value: string): string {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function openReleaseModal(name: string, launcher: HTMLButtonElement) {
    destructiveLauncher = launcher;
    releaseTarget = name;
    releaseReason = '';
    releaseError = '';
    void tick().then(() => destructiveSafeAction?.focus());
  }

  function openReservationRemoval(name: string, launcher: HTMLButtonElement) {
    destructiveLauncher = launcher;
    reservationRemovalTarget = name;
    removalError = '';
    void tick().then(() => destructiveSafeAction?.focus());
  }

  function closeDestructiveDialog(kind: 'release' | 'reservation') {
    if (releasePending || removalPending) return;
    if (kind === 'release') {
      releaseTarget = null;
      releaseError = '';
    } else {
      reservationRemovalTarget = null;
      removalError = '';
    }
    void tick().then(() => destructiveLauncher?.focus());
  }

  function handleDestructiveKeydown(event: KeyboardEvent, pending: boolean) {
    if (event.key === 'Escape') {
      if (!pending) {
        event.preventDefault();
        closeDestructiveDialog(releaseTarget ? 'release' : 'reservation');
      }
      return;
    }

    if (event.key !== 'Tab') return;
    event.preventDefault();
    if (pending) {
      destructiveDialog?.focus();
      return;
    }

    const focusable = [
      ...(destructiveDialog?.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled])'
      ) ?? [])
    ];
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      index < 0
        ? event.shiftKey
          ? focusable.length - 1
          : 0
        : (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
    focusable[nextIndex]?.focus();
  }

  async function confirmForceRelease() {
    if (!releaseTarget || !releaseReason.trim() || releasePending) return;
    const target = releaseTarget;
    const reason = releaseReason.trim();
    releasePending = true;
    releaseError = '';
    void tick().then(() => destructiveDialog?.focus());
    try {
      const result = await forceReleaseIdentifier(target, reason);
      if (result.ok) {
        stale = stale.filter((row) => row.name !== target);
        releaseTarget = null;
        adminStatus = `Force-released ${target}.`;
        void tick().then(() => staleHeading?.focus());
      } else {
        releaseError = result.error;
      }
    } finally {
      releasePending = false;
      if (releaseError) void tick().then(() => destructiveSafeAction?.focus());
    }
  }

  async function addReservation(event: SubmitEvent) {
    event.preventDefault();
    if (!newReservationName.trim() || !newReservationReason.trim() || reservationPending) return;
    reservationPending = true;
    reservationError = '';
    try {
      const result = await createReservation(
        newReservationName.trim(),
        newReservationReason.trim()
      );
      if (result.ok) {
        reservations = [...reservations, result.value];
        adminStatus = `Reserved ${result.value.name}.`;
        newReservationName = '';
        newReservationReason = '';
      } else {
        reservationError = result.error;
      }
    } finally {
      reservationPending = false;
    }
  }

  async function confirmReservationRemoval() {
    if (!reservationRemovalTarget || removalPending) return;
    const target = reservationRemovalTarget;
    removalPending = true;
    removalError = '';
    void tick().then(() => destructiveDialog?.focus());
    try {
      const result = await removeReservation(target);
      if (result.ok) {
        reservations = reservations.filter((row) => row.name !== target);
        reservationRemovalTarget = null;
        adminStatus = `Removed reservation for ${target}.`;
        void tick().then(() => reservationsHeading?.focus());
      } else {
        removalError = result.error;
      }
    } finally {
      removalPending = false;
      if (removalError) void tick().then(() => destructiveSafeAction?.focus());
    }
  }
</script>

<PageMeta
  title="Admin"
  description="Reserved names and identifiers eligible for release."
  noindex
/>

<CredentialCard title="Admin" wide>
  <section aria-labelledby="stale-heading">
    <div class="section-heading">
      <h2 id="stale-heading" bind:this={staleHeading} tabindex="-1">Stale identifiers</h2>
      <span class="section-count">{stale.length}</span>
    </div>
    <p class="section-note">Identifiers eligible for administrative release.</p>

    {#if stale.length === 0}
      <p class="empty-state">No identifiers are currently eligible.</p>
    {:else}
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Owner</th>
              <th>Last NIP-05 lookup</th>
              <th><span class="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {#each stale as row (row.name)}
              <tr>
                <td data-label="Name" class="identifier">{row.name}</td>
                <td data-label="Owner" class="technical">{row.ownerPubkey ?? 'Unassigned'}</td>
                <td data-label="Last lookup" class="date">{formatDate(row.lastIdentifiedAt)}</td>
                <td class="row-action">
                  <button
                    class="secondary compact"
                    aria-label={`Force release ${row.name}`}
                    onclick={(event) => openReleaseModal(row.name, event.currentTarget)}
                    >Force release</button
                  >
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="admin-section" aria-labelledby="reservations-heading">
    <div class="section-heading">
      <h2 id="reservations-heading" bind:this={reservationsHeading} tabindex="-1">Reservations</h2>
      <span class="section-count">{reservations.length}</span>
    </div>
    <p class="section-note">Protected names that cannot be claimed.</p>

    {#if reservations.length === 0}
      <p class="empty-state">No reservations have been added.</p>
    {:else}
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Reason</th>
              <th>Set by</th>
              <th><span class="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {#each reservations as row (row.name)}
              <tr>
                <td data-label="Name" class="identifier">{row.name}</td>
                <td data-label="Reason">{row.reason ?? 'No reason recorded'}</td>
                <td data-label="Set by" class="technical">{row.actorPubkey ?? 'System'}</td>
                <td class="row-action">
                  <button
                    class="secondary compact"
                    aria-label={`Remove reservation for ${row.name}`}
                    onclick={(event) => openReservationRemoval(row.name, event.currentTarget)}
                    >Remove</button
                  >
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <form class="reservation-form" onsubmit={addReservation}>
      <h3>Add reservation</h3>
      <div class="field">
        <label for="reservation-name">Name</label>
        <input id="reservation-name" bind:value={newReservationName} autocomplete="off" required />
      </div>
      <div class="field">
        <label for="reservation-reason">Reason</label>
        <input
          id="reservation-reason"
          bind:value={newReservationReason}
          autocomplete="off"
          required
        />
      </div>
      <button
        type="submit"
        disabled={!newReservationName.trim() || !newReservationReason.trim() || reservationPending}
        aria-busy={reservationPending}
      >
        {reservationPending ? 'Adding…' : 'Add reservation'}
      </button>
      {#if reservationError}
        <p class="error" role="alert">{reservationError}</p>
      {/if}
    </form>
  </section>
  <p class="sr-only" aria-live="polite">{adminStatus}</p>
</CredentialCard>

{#if releaseTarget}
  <div
    bind:this={destructiveDialog}
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="force-release-title"
    aria-describedby="force-release-description"
    aria-busy={releasePending}
    tabindex="-1"
    onkeydown={(event) => handleDestructiveKeydown(event, releasePending)}
  >
    <div class="modal__content">
      <div class="modal__header">
        <h2 id="force-release-title">Force release {releaseTarget}?</h2>
      </div>
      <p id="force-release-description">
        This makes the identifier available for anyone else to claim and cannot be undone.
      </p>
      <div class="field">
        <label for="release-reason">Reason (required)</label>
        <input id="release-reason" bind:value={releaseReason} autocomplete="off" />
      </div>
      {#if releaseError}
        <p class="error" role="alert">{releaseError}</p>
      {/if}
      <div class="modal__actions">
        <button
          type="button"
          onclick={confirmForceRelease}
          disabled={!releaseReason.trim() || releasePending}
          aria-busy={releasePending}
          aria-label={`Force release ${releaseTarget}`}
        >
          {releasePending ? 'Releasing…' : `Force release ${releaseTarget}`}
        </button>
        <button
          type="button"
          class="secondary"
          bind:this={destructiveSafeAction}
          onclick={() => closeDestructiveDialog('release')}
          disabled={releasePending}>Cancel</button
        >
      </div>
    </div>
  </div>
{/if}

{#if reservationRemovalTarget}
  <div
    bind:this={destructiveDialog}
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="reservation-removal-title"
    aria-describedby="reservation-removal-description"
    aria-busy={removalPending}
    tabindex="-1"
    onkeydown={(event) => handleDestructiveKeydown(event, removalPending)}
  >
    <div class="modal__content">
      <div class="modal__header">
        <h2 id="reservation-removal-title">
          Remove reservation for {reservationRemovalTarget}?
        </h2>
      </div>
      <p id="reservation-removal-description">
        This makes the name available for anyone else to claim.
      </p>
      {#if removalError}
        <p class="error" role="alert">{removalError}</p>
      {/if}
      <div class="modal__actions">
        <button
          type="button"
          onclick={confirmReservationRemoval}
          disabled={removalPending}
          aria-busy={removalPending}
          aria-label="Remove reservation"
        >
          {removalPending ? 'Removing…' : 'Remove reservation'}
        </button>
        <button
          type="button"
          class="secondary"
          bind:this={destructiveSafeAction}
          onclick={() => closeDestructiveDialog('reservation')}
          disabled={removalPending}>Cancel</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  section + .admin-section {
    border-top: 1px solid var(--color-line);
    margin-top: var(--space-4);
    padding-top: var(--space-3);
  }
  .section-heading {
    align-items: baseline;
    display: flex;
    gap: var(--space-1);
    justify-content: space-between;
  }
  h2,
  h3 {
    font-family: var(--font-ui);
    font-weight: 600;
    margin: 0;
  }
  h2 {
    font-size: 1.15rem;
  }
  h3 {
    font-size: 1rem;
  }
  .section-count {
    color: var(--color-ink-muted);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }
  .section-note,
  .empty-state {
    color: var(--color-ink-muted);
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 0.25rem 0 var(--space-2);
  }
  .empty-state {
    border-top: 1px solid var(--color-line);
    padding-top: var(--space-2);
  }
  .table-scroll {
    overflow-x: auto;
    scrollbar-color: var(--color-line) var(--color-paper);
    scrollbar-width: thin;
  }
  table {
    border-collapse: collapse;
    font-family: var(--font-ui);
    font-size: 0.875rem;
    min-width: 48rem;
    width: 100%;
  }
  th,
  td {
    border-bottom: 1px solid var(--color-line);
    padding: var(--space-1);
    text-align: left;
    vertical-align: top;
  }
  th {
    color: var(--color-ink-muted);
    font-size: 0.7rem;
    font-weight: 400;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  td {
    overflow-wrap: anywhere;
  }
  .identifier {
    font-family: var(--font-display);
    font-size: 1rem;
  }
  .technical {
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }
  .date {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .row-action {
    text-align: right;
  }
  .compact {
    font-size: 0.875rem;
    padding: 0.375rem var(--space-1);
    white-space: nowrap;
  }
  .reservation-form {
    border-top: 1px solid var(--color-line);
    margin-top: var(--space-3);
    padding-top: var(--space-2);
  }
  .field {
    margin: var(--space-2) 0;
  }
  .error {
    color: var(--color-accent-rose-text);
    font-size: 0.875rem;
    line-height: 1.5;
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
    z-index: 10;
  }
  .modal:focus {
    outline: none;
  }
  .modal:focus-visible .modal__content {
    outline: 2px solid var(--color-accent-mint);
    outline-offset: 2px;
  }
  .modal__content {
    background: var(--color-paper);
    border: 1px solid var(--color-line);
    max-height: calc(100dvh - var(--space-2) - var(--space-2));
    max-width: 24rem;
    overflow-y: auto;
    padding: var(--space-4);
    width: 100%;
  }
  .modal__header {
    border-bottom: 1px solid var(--color-line);
    margin-bottom: var(--space-3);
    padding-bottom: var(--space-2);
  }
  .modal__content > p:not(.error) {
    color: var(--color-ink-muted);
    font-size: 0.9rem;
    line-height: 1.5;
    margin: 0;
  }
  .modal__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-3);
  }
  .sr-only {
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    height: 1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    white-space: nowrap;
    width: 1px;
  }
  @media (max-width: 32rem) {
    table,
    tbody,
    tr,
    td {
      display: block;
    }
    table {
      min-width: 0;
    }
    thead {
      clip: rect(0, 0, 0, 0);
      clip-path: inset(50%);
      height: 1px;
      overflow: hidden;
      position: absolute;
      white-space: nowrap;
      width: 1px;
    }
    tr {
      border-top: 1px solid var(--color-line);
      padding: var(--space-1) 0;
    }
    td {
      align-items: baseline;
      border: 0;
      display: grid;
      gap: var(--space-2);
      grid-template-columns: minmax(5rem, 0.7fr) minmax(0, 1.3fr);
      padding: 0.375rem 0;
      text-align: right;
    }
    td[data-label]::before {
      color: var(--color-ink-muted);
      content: attr(data-label);
      font-family: var(--font-ui);
      font-size: 0.7rem;
      letter-spacing: 0.05em;
      text-align: left;
      text-transform: uppercase;
    }
    .row-action {
      display: block;
      padding-top: var(--space-1);
    }
    .modal__content {
      padding: var(--space-3);
    }
  }
  @media (max-height: 32rem) {
    .modal {
      align-items: flex-start;
    }
  }
  @media (pointer: coarse) {
    .compact {
      min-height: 44px;
      min-width: 44px;
    }
  }
</style>
