// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import AccountPage from './+page.svelte';

const { goto } = vi.hoisted(() => ({ goto: vi.fn() }));

vi.mock('$app/navigation', () => ({ goto }));

const accountData = {
  name: 'alice',
  relays: ['wss://relay.example'],
  lastIdentifiedAt: '2026-01-15T00:00:00.000Z'
};

let component: ReturnType<typeof mount> | undefined;

function renderAccount() {
  component = mount(AccountPage, { target: document.body, props: { data: accountData } });
}

function button(label: string): HTMLButtonElement {
  const result = [...document.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label
  );
  if (!result) throw new Error(`Could not find button: ${label}`);
  return result;
}

function relayInput(index: number): HTMLInputElement {
  const label = [...document.querySelectorAll('label')].find(
    (element) => element.textContent?.trim() === `Relay ${index + 1}`
  );
  if (!label?.htmlFor) throw new Error(`Could not find label for relay ${index + 1}`);

  const input = document.getElementById(label.htmlFor);
  if (!(input instanceof HTMLInputElement))
    throw new Error(`Could not find input for relay ${index + 1}`);
  return input;
}

async function editRelay(index: number, value: string) {
  const input = relayInput(index);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
}

async function saveSuccessfully() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ relays: ['wss://relay.example/'] }), { status: 200 })
    )
  );
  button('Save relays').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('Saved'));
}

async function saveWithIndexedError() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'relay 1: not a valid URL' }), { status: 400 })
    )
  );
  button('Save relays').click();
  await vi.waitFor(() => expect(document.getElementById('relay-0-error')).not.toBeNull());
}

afterEach(() => {
  if (component) unmount(component);
  component = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('account relay editor', () => {
  it('removes the saved confirmation after adding a relay', async () => {
    renderAccount();

    await saveSuccessfully();
    button('Add relay').click();
    await tick();

    expect(document.body.textContent).not.toContain('Saved');
  });

  it('recovers from a rejected save with a safe error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('network detail')))
    );
    renderAccount();

    button('Save relays').click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Could not reach the server. Check your connection and try again.'
      )
    );
    expect(button('Save relays').disabled).toBe(false);
    expect(document.body.textContent).not.toContain('Saving…');
  });

  it('associates indexed relay errors with the invalid relay input', async () => {
    renderAccount();

    await saveWithIndexedError();

    const input = relayInput(0);
    const error = document.getElementById('relay-0-error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('relay-0-error');
    expect(error?.textContent).toContain('not a valid URL');
  });

  it('clears saved state when editing a relay', async () => {
    renderAccount();

    await saveSuccessfully();
    await editRelay(0, 'wss://next.example');

    expect(document.body.textContent).not.toContain('Saved');
  });

  it('clears a row error when editing its relay', async () => {
    renderAccount();

    await saveWithIndexedError();
    await editRelay(0, 'wss://next.example');

    expect(document.getElementById('relay-0-error')).toBeNull();
  });

  it('clears a row error when adding a relay', async () => {
    renderAccount();

    await saveWithIndexedError();
    button('Add relay').click();
    await tick();

    expect(document.getElementById('relay-0-error')).toBeNull();
  });

  it('clears a row error when removing a relay', async () => {
    renderAccount();

    await saveWithIndexedError();
    button('Remove').click();
    await tick();

    expect(document.getElementById('relay-0-error')).toBeNull();
  });
});
