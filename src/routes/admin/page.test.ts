// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import AdminPage from './+page.svelte';

const adminData = {
  stale: [
    {
      name: 'alice',
      ownerPubkey: 'a'.repeat(64),
      lastIdentifiedAt: '2026-01-15T00:00:00.000Z'
    }
  ],
  reservations: [
    {
      name: 'support',
      reason: 'Platform operations',
      actorPubkey: 'b'.repeat(64),
      createdAt: '2026-08-01T00:00:00.000Z'
    }
  ]
};

let component: ReturnType<typeof mount> | undefined;

function renderAdmin() {
  component = mount(AdminPage, {
    target: document.body,
    props: { data: structuredClone(adminData) }
  });
}

function button(label: string): HTMLButtonElement {
  const result = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === label
  );
  if (!result) throw new Error(`Could not find button: ${label}`);
  return result;
}

function input(label: string): HTMLInputElement {
  const labelElement = [...document.querySelectorAll<HTMLLabelElement>('label')].find(
    (element) => element.textContent?.trim() === label
  );
  const result = labelElement?.htmlFor ? document.getElementById(labelElement.htmlFor) : null;
  if (!(result instanceof HTMLInputElement)) throw new Error(`Could not find input: ${label}`);
  return result;
}

async function type(label: string, value: string) {
  const field = input(label);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
}

function dialog(): HTMLElement {
  const result = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!result) throw new Error('Could not find destructive dialog');
  return result;
}

function pressKey(target: Element, key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, shiftKey });
  target.dispatchEvent(event);
  return event;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status
  });
}

function deferredResponse() {
  let resolve: ((response: Response) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve(response: Response) {
      if (!resolve) throw new Error('Deferred response resolver was not initialized');
      resolve(response);
    },
    reject(reason: unknown) {
      if (!reject) throw new Error('Deferred response rejecter was not initialized');
      reject(reason);
    }
  };
}

async function openForceRelease() {
  button('Force release').click();
  await tick();
}

async function openRemoval() {
  button('Remove').click();
  await tick();
}

afterEach(() => {
  if (component) unmount(component);
  component = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('admin reservation creation', () => {
  it('requires nonblank trimmed values before Add reservation is enabled', async () => {
    renderAdmin();

    await type('Name', 'new-name');
    await type('Reason', '   ');

    expect(button('Add reservation').disabled).toBe(true);

    await type('Reason', '  Staff use  ');
    expect(button('Add reservation').disabled).toBe(false);
  });

  it('guards a pending create against double submit and finalizes malformed responses', async () => {
    const request = deferredResponse();
    const fetcher = vi.fn(() => request.promise);
    vi.stubGlobal('fetch', fetcher);
    renderAdmin();
    await type('Name', 'new-name');
    await type('Reason', '  Staff use  ');

    button('Add reservation').click();
    await tick();

    expect(button('Adding…').disabled).toBe(true);
    button('Adding…').click();
    expect(fetcher).toHaveBeenCalledTimes(1);

    request.resolve(new Response('not json', { status: 201 }));
    await vi.waitFor(() => expect(document.body.textContent).toContain('We could not add'));

    expect(button('Add reservation').disabled).toBe(false);
    expect(document.body.textContent).toContain(
      'We could not add this reservation. Please try again.'
    );
  });

  it('recovers from a rejected create request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('private network detail')))
    );
    renderAdmin();
    await type('Name', 'new-name');
    await type('Reason', 'Staff use');

    button('Add reservation').click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'We could not add this reservation. Please try again.'
      )
    );
    expect(button('Add reservation').disabled).toBe(false);
  });

  it('submits trimmed values and appends the complete server-normalized reservation', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          name: 'normalized-name',
          reason: 'Normalized by server',
          actorPubkey: 'c'.repeat(64),
          createdAt: '2026-08-28T12:00:00.000Z'
        },
        201
      )
    );
    vi.stubGlobal('fetch', fetcher);
    renderAdmin();
    await type('Name', '  draft-name  ');
    await type('Reason', '  Staff use  ');

    button('Add reservation').click();

    await vi.waitFor(() => expect(document.body.textContent).toContain('normalized-name'));
    expect(document.body.textContent).toContain('Normalized by server');
    expect(document.body.textContent).toContain('c'.repeat(64));
    expect(fetcher).toHaveBeenCalledWith('/api/admin/reservations', {
      method: 'POST',
      body: JSON.stringify({ name: 'draft-name', reason: 'Staff use' })
    });
    expect(input('Name').value).toBe('');
    expect(input('Reason').value).toBe('');
  });
});

describe('force-release dialog', () => {
  it('has a visible accessible name and consequence description and focuses Cancel safely', async () => {
    renderAdmin();

    const launcher = button('Force release');
    launcher.focus();
    launcher.click();
    await tick();

    const modal = dialog();
    const title = document.getElementById('force-release-title');
    const description = document.getElementById('force-release-description');
    expect(title?.tagName).toBe('H2');
    expect(title?.textContent?.trim()).toBe('Force release alice?');
    expect(description?.textContent).toContain('available for anyone else to claim');
    expect(modal.getAttribute('aria-labelledby')).toBe('force-release-title');
    expect(modal.getAttribute('aria-describedby')).toBe('force-release-description');
    expect(document.activeElement).toBe(button('Cancel'));
  });

  it('wraps forward and backward through reason, destructive action, and Cancel', async () => {
    renderAdmin();
    await openForceRelease();

    const cancel = button('Cancel');
    const reason = input('Reason (required)');
    await type('Reason (required)', 'Inactive');
    const action = button('Force release alice');

    pressKey(cancel, 'Tab');
    expect(document.activeElement).toBe(reason);
    pressKey(reason, 'Tab');
    expect(document.activeElement).toBe(action);
    pressKey(action, 'Tab');
    expect(document.activeElement).toBe(cancel);
    pressKey(cancel, 'Tab', true);
    expect(document.activeElement).toBe(action);
    pressKey(action, 'Tab', true);
    expect(document.activeElement).toBe(reason);
    pressKey(reason, 'Tab', true);
    expect(document.activeElement).toBe(cancel);
  });

  it('requires a nonblank reason and sends its trimmed value', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }, 200));
    vi.stubGlobal('fetch', fetcher);
    renderAdmin();
    await openForceRelease();

    await type('Reason (required)', '   ');
    expect(button('Force release alice').disabled).toBe(true);
    await type('Reason (required)', '  Policy violation  ');
    button('Force release alice').click();

    await vi.waitFor(() => expect(document.body.textContent).not.toContain('alice'));
    expect(fetcher).toHaveBeenCalledWith('/api/admin/force-release', {
      method: 'POST',
      body: JSON.stringify({ name: 'alice', reason: 'Policy violation' })
    });
  });

  it('guards pending release, contains focus, and recovers after request rejection', async () => {
    const request = deferredResponse();
    const fetcher = vi.fn(() => request.promise);
    vi.stubGlobal('fetch', fetcher);
    renderAdmin();
    await openForceRelease();
    await type('Reason (required)', 'Inactive');

    button('Force release alice').click();
    await tick();

    expect(document.activeElement).toBe(dialog());
    expect(button('Releasing…').disabled).toBe(true);
    expect(button('Cancel').disabled).toBe(true);
    button('Releasing…').click();
    pressKey(dialog(), 'Tab');
    expect(document.activeElement).toBe(dialog());
    pressKey(dialog(), 'Escape');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);

    request.reject(new TypeError('private network detail'));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'We could not force-release this identifier. Please try again.'
      )
    );
    expect(button('Force release alice').disabled).toBe(false);
    expect(button('Cancel').disabled).toBe(false);
    expect(document.activeElement).toBe(button('Cancel'));
    expect(document.body.textContent).toContain('alice');
  });

  it('closes by idle Escape or Cancel, restores launcher focus, and ignores backdrop clicks', async () => {
    renderAdmin();
    const launcher = button('Force release');
    launcher.focus();
    launcher.click();
    await tick();

    dialog().click();
    await tick();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    const escape = pressKey(button('Cancel'), 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(document.activeElement).toBe(launcher);

    launcher.click();
    await tick();
    button('Cancel').click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(document.activeElement).toBe(launcher);
  });
});

describe('reservation-removal dialog', () => {
  it('has a visible accessible name and consequence description and focuses Cancel safely', async () => {
    renderAdmin();

    const launcher = button('Remove');
    launcher.focus();
    launcher.click();
    await tick();

    const modal = dialog();
    const title = document.getElementById('reservation-removal-title');
    const description = document.getElementById('reservation-removal-description');
    expect(title?.tagName).toBe('H2');
    expect(title?.textContent?.trim()).toBe('Remove reservation for support?');
    expect(description?.textContent).toContain('available for anyone else to claim');
    expect(modal.getAttribute('aria-labelledby')).toBe('reservation-removal-title');
    expect(modal.getAttribute('aria-describedby')).toBe('reservation-removal-description');
    expect(document.activeElement).toBe(button('Cancel'));
  });

  it('wraps forward and backward between the destructive action and Cancel', async () => {
    renderAdmin();
    await openRemoval();

    const cancel = button('Cancel');
    const action = button('Remove reservation');
    pressKey(cancel, 'Tab');
    expect(document.activeElement).toBe(action);
    pressKey(action, 'Tab');
    expect(document.activeElement).toBe(cancel);
    pressKey(cancel, 'Tab', true);
    expect(document.activeElement).toBe(action);
    pressKey(action, 'Tab', true);
    expect(document.activeElement).toBe(cancel);
  });

  it('guards pending removal, contains focus, and recovers after request rejection', async () => {
    const request = deferredResponse();
    const fetcher = vi.fn(() => request.promise);
    vi.stubGlobal('fetch', fetcher);
    renderAdmin();
    await openRemoval();

    button('Remove reservation').click();
    await tick();

    expect(document.activeElement).toBe(dialog());
    expect(button('Removing…').disabled).toBe(true);
    expect(button('Cancel').disabled).toBe(true);
    button('Removing…').click();
    pressKey(dialog(), 'Tab', true);
    expect(document.activeElement).toBe(dialog());
    pressKey(dialog(), 'Escape');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);

    request.reject(new TypeError('private network detail'));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'We could not remove the reservation. Please try again.'
      )
    );
    expect(button('Remove reservation').disabled).toBe(false);
    expect(button('Cancel').disabled).toBe(false);
    expect(document.activeElement).toBe(button('Cancel'));
    expect(document.body.textContent).toContain('support');
  });

  it('removes a reservation only after success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ok: true }, 200))
    );
    renderAdmin();
    await openRemoval();

    button('Remove reservation').click();

    await vi.waitFor(() => expect(document.body.textContent).not.toContain('support'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('closes by idle Escape or Cancel, restores launcher focus, and ignores backdrop clicks', async () => {
    renderAdmin();
    const launcher = button('Remove');
    launcher.focus();
    launcher.click();
    await tick();

    dialog().click();
    await tick();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    pressKey(button('Cancel'), 'Escape');
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(document.activeElement).toBe(launcher);

    launcher.click();
    await tick();
    button('Cancel').click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(document.activeElement).toBe(launcher);
  });
});
