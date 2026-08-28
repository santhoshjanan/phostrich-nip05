import { describe, expect, it } from 'vitest';
import { validateRelayList } from './relays';

describe('validateRelayList', () => {
  it('normalizes accepted secure relay URLs', () => {
    expect(validateRelayList(['wss://relay.one', 'wss://relay.two'])).toEqual({
      ok: true,
      relays: ['wss://relay.one/', 'wss://relay.two/']
    });
  });

  it('rejects lists longer than eight relays', () => {
    const relays = Array.from({ length: 9 }, (_, index) => `wss://relay${index}.example`);

    expect(validateRelayList(relays)).toEqual({
      ok: false,
      error: 'no more than 8 relays are allowed'
    });
  });

  it('rejects insecure websocket URLs unless explicitly allowed', () => {
    expect(validateRelayList(['ws://relay.example'])).toEqual({
      ok: false,
      error: 'relay 1: must start with wss://'
    });
    expect(validateRelayList(['ws://relay.example'], { allowInsecure: true }).ok).toBe(true);
  });

  it('rejects malformed relay URLs', () => {
    expect(validateRelayList(['not-a-url'])).toEqual({
      ok: false,
      error: 'relay 1: must be a valid URL'
    });
  });

  it('rejects relay URLs with credentials', () => {
    expect(validateRelayList(['wss://user:pass@relay.example'])).toEqual({
      ok: false,
      error: 'relay 1: must not include credentials'
    });
  });

  it('rejects relay URLs with query strings', () => {
    expect(validateRelayList(['wss://relay.example?x=1'])).toEqual({
      ok: false,
      error: 'relay 1: must not include a query string'
    });
  });

  it('deduplicates trailing-slash variants while preserving the first occurrence', () => {
    expect(validateRelayList(['wss://relay.example', 'wss://relay.example/'])).toEqual({
      ok: true,
      relays: ['wss://relay.example/']
    });
  });
});
