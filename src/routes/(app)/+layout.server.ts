import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isAdmin } from '$lib/server/auth/admin';

export const load = (({ locals }) => {
  if (!locals.user) {
    redirect(302, '/login');
  }

  return {
    pubkey: locals.user.pubkey,
    isAdmin: isAdmin(locals.user.pubkey)
  };
}) satisfies LayoutServerLoad;
