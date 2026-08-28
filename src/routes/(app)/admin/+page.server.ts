import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isAdmin } from '$lib/server/auth/admin';
import { getReservations, getStaleIdentifiers } from '$lib/server/identifiers/adminQueries';

export const load = (async ({ locals }) => {
  if (!locals.user) {
    redirect(302, '/login');
  }

  if (!isAdmin(locals.user.pubkey)) {
    error(403, 'Forbidden');
  }

  const [stale, reservations] = await Promise.all([getStaleIdentifiers(), getReservations()]);

  return {
    stale: stale.map((identifier) => ({
      name: identifier.name,
      ownerPubkey: identifier.ownerPubkey,
      lastIdentifiedAt: identifier.lastIdentifiedAt.toISOString()
    })),
    reservations: reservations.map((reservation) => ({
      name: reservation.name,
      reason: reservation.reason,
      actorPubkey: reservation.actorPubkey,
      createdAt: reservation.createdAt.toISOString()
    }))
  };
}) satisfies PageServerLoad;
