// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import AccountPage from './+page.svelte';

if (!HTMLElement.prototype.animate) {
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: () => {
      const animation = {
        cancel: () => {},
        currentTime: 0,
        effect: null,
        onfinish: null as (() => void) | null,
        playState: 'finished'
      };
      queueMicrotask(() => animation.onfinish?.());
      return animation;
    }
  });
}

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

function button(label: string, occurrence = 0): HTMLButtonElement {
  const result = [...document.querySelectorAll('button')].filter(
    (element) => element.textContent?.trim() === label
  )[occurrence];
  if (!result) throw new Error(`Could not find button: ${label}`);
  return result;
}

function dialog(): HTMLElement {
  const result = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!result) throw new Error('Could not find release dialog');
  return result;
}

function pressKey(target: Element, key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, shiftKey });
  target.dispatchEvent(event);
  return event;
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
  await tick();
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

  it('associates a submitted relay error with its visible row after a blank row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'relay 1: not a valid URL' }), { status: 400 })
      )
    );
    renderAccount();
    await tick();

    await editRelay(0, '');
    button('Add relay').click();
    await tick();
    await editRelay(1, 'not-a-url');
    button('Save relays').click();
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull());

    expect(relayInput(0).getAttribute('aria-invalid')).toBeNull();
    expect(relayInput(1).getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('relay-1-error')?.textContent).toContain('not a valid URL');
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

  it('keeps a mutated relay draft when an earlier save resolves', async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    let responseBodyRead = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          })
      )
    );
    renderAccount();

    button('Save relays').click();
    await tick();
    await editRelay(0, 'wss://edited.example');
    button('Add relay').click();
    await tick();
    button('Remove', 1).click();
    await tick();

    if (!resolveFetch) throw new Error('Save request did not start');
    resolveFetch({
      status: 200,
      json: async () => {
        responseBodyRead = true;
        return { relays: ['wss://normalized.example/'] };
      }
    } as Response);
    await vi.waitFor(() => expect(responseBodyRead).toBe(true));
    await tick();

    expect(relayInput(0).value).toBe('wss://edited.example');
    expect(document.body.textContent).not.toContain('Saved');
  });

  it('keeps Save disabled until a stale save settles after editing', async () => {
    let resolveFirstFetch: ((response: Response) => void) | undefined;
    let firstResponseBodyRead = false;
    let requestCount = 0;
    const fetchMock = vi.fn(() => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Promise<Response>((resolve) => {
          resolveFirstFetch = resolve;
        });
      }

      return Promise.resolve(
        new Response(JSON.stringify({ relays: ['wss://edited.example/'] }), { status: 200 })
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAccount();

    button('Save relays').click();
    await tick();
    await editRelay(0, 'wss://edited.example');

    expect(button('Saving…').disabled).toBe(true);
    if (!resolveFirstFetch) throw new Error('First save request did not start');
    resolveFirstFetch({
      status: 200,
      json: async () => {
        firstResponseBodyRead = true;
        return { relays: ['wss://normalized.example/'] };
      }
    } as Response);
    await vi.waitFor(() => expect(firstResponseBodyRead).toBe(true));
    await tick();

    expect(relayInput(0).value).toBe('wss://edited.example');
    expect(document.body.textContent).not.toContain('Saved');
    expect(button('Save relays').disabled).toBe(false);

    button('Save relays').click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

describe('account release dialog', () => {
  it('focuses Cancel when the dialog opens', async () => {
    renderAccount();

    const launcher = button('Release this identifier');
    launcher.focus();
    launcher.click();
    await tick();

    expect(document.activeElement).toBe(button('Cancel'));
  });

  it('traps dialog Tab and Shift+Tab navigation between its actions', async () => {
    renderAccount();

    button('Release this identifier').click();
    await tick();
    const cancel = button('Cancel');
    const release = button('Release alice');

    pressKey(cancel, 'Tab');
    expect(document.activeElement).toBe(release);
    pressKey(release, 'Tab');
    expect(document.activeElement).toBe(cancel);
    pressKey(cancel, 'Tab', true);
    expect(document.activeElement).toBe(release);
  });

  it('closes on idle Escape and restores focus to the release launcher', async () => {
    renderAccount();

    const launcher = button('Release this identifier');
    launcher.focus();
    launcher.click();
    await tick();
    pressKey(button('Cancel'), 'Escape');
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());

    expect(document.activeElement).toBe(launcher);
  });

  it('does not close the dialog when its backdrop is clicked', async () => {
    renderAccount();

    button('Release this identifier').click();
    await tick();
    expect(dialog().getAttribute('tabindex')).toBe('-1');
    dialog().click();
    await tick();

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('keeps the dialog usable after a rejected release request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('network detail')))
    );
    renderAccount();

    button('Release this identifier').click();
    await tick();
    button('Release alice').click();

    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        'Could not reach the server. Check your connection and try again.'
      )
    );
    await tick();

    const release = button('Release alice');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(release.disabled).toBe(false);
    expect(document.body.textContent).not.toContain('Releasing…');
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it('keeps focus inside the dialog while a release request is pending', async () => {
    let rejectRequest: ((reason?: unknown) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((_, reject) => {
            rejectRequest = reject;
          })
      )
    );
    renderAccount();

    button('Release this identifier').click();
    await tick();
    button('Release alice').click();
    await tick();

    const releaseDialog = dialog();
    expect(document.activeElement).toBe(releaseDialog);
    const tab = pressKey(releaseDialog, 'Tab');
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(releaseDialog);
    const shiftTab = pressKey(releaseDialog, 'Tab', true);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(releaseDialog);
    pressKey(releaseDialog, 'Escape');
    expect(document.querySelector('[role="dialog"]')).toBe(releaseDialog);
    expect(document.activeElement).toBe(releaseDialog);

    if (!rejectRequest) throw new Error('Release request did not start');
    rejectRequest(new TypeError('network detail'));
    await vi.waitFor(() => expect(button('Release alice').disabled).toBe(false));
    await tick();

    expect(document.body.textContent).toContain(
      'Could not reach the server. Check your connection and try again.'
    );
    expect(releaseDialog.contains(document.activeElement)).toBe(true);
  });
});

describe('account inactivity evidence', () => {
  it('explains lookup-driven release eligibility', () => {
    renderAccount();

    expect(document.body.textContent).toContain('Last NIP-05 lookup');
    expect(document.body.textContent).toContain('Public lookups keep this identifier active.');
    expect(document.body.textContent).toContain('Eligible for release after');
  });
});
