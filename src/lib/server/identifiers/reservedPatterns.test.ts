import { describe, expect, it } from 'vitest';
import { isClaimableName } from './reservedPatterns';

describe('isClaimableName', () => {
  it('accepts a normal lowercase name', () => {
    expect(isClaimableName('alice')).toBe(true);
  });

  it('rejects names shorter than 2 or longer than 30 characters', () => {
    expect(isClaimableName('a')).toBe(false);
    expect(isClaimableName('a'.repeat(31))).toBe(false);
    expect(isClaimableName('a'.repeat(30))).toBe(true);
  });

  it('rejects uppercase and disallowed characters', () => {
    expect(isClaimableName('Alice')).toBe(false);
    expect(isClaimableName('alice smith')).toBe(false);
    expect(isClaimableName('alice@smith')).toBe(false);
  });

  it('rejects leading/trailing separators and consecutive dots', () => {
    expect(isClaimableName('.alice')).toBe(false);
    expect(isClaimableName('alice.')).toBe(false);
    expect(isClaimableName('-alice')).toBe(false);
    expect(isClaimableName('alice-')).toBe(false);
    expect(isClaimableName('_alice')).toBe(false);
    expect(isClaimableName('alice_')).toBe(false);
    expect(isClaimableName('al..ice')).toBe(false);
  });

  it('rejects exact reserved names', () => {
    expect(isClaimableName('admin')).toBe(false);
    expect(isClaimableName('google')).toBe(false);
    expect(isClaimableName('whitehouse')).toBe(false);
  });

  it('rejects government pattern variants without false-positiving on governor', () => {
    expect(isClaimableName('us-gov')).toBe(false);
    expect(isClaimableName('gov')).toBe(false);
    expect(isClaimableName('governor')).toBe(true);
  });
});
