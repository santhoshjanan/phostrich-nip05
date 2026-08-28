import { expect, it } from 'vitest';
import { load } from './+page.server';

it('redirects the root route to login', () => {
  expect(() => load()).toThrow(expect.objectContaining({ status: 302, location: '/login' }));
});
