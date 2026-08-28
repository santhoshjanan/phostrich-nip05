import { expect, test } from '@playwright/test';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../src/lib/server/db';
import { identifierEvents, identifiers } from '../../src/lib/server/db/schema';
import { createAdminFixtures, type AdminFixtures } from './helpers/adminFixtures';
import { installFakeNostrExtension } from './helpers/fakeSigner';
import { FIXED_ADMIN_PUBKEY, signInAsFixedAdmin } from './helpers/fixedAdminSigner';

const STALE_OWNER = '5601000000000000000000000000000000000000000000000000000000000000';
const FORCE_RELEASE_ROUTE = '**/api/admin/force-release';
const REMOVE_RESERVATION_ROUTE = '**/api/admin/reservations/*';

const fixturesByTestId = new Map<string, AdminFixtures>();

async function cleanAdminFixtures(fixtures: AdminFixtures): Promise<void> {
  const names = [fixtures.staleName, fixtures.reservationName];
  await db.delete(identifierEvents).where(inArray(identifierEvents.identifierName, names));
  await db.delete(identifiers).where(inArray(identifiers.name, names));
}

async function seedStaleClaimedIdentifier(name: string): Promise<void> {
  await db.insert(identifiers).values({
    name,
    status: 'claimed',
    ownerPubkey: STALE_OWNER,
    lastIdentifiedAt: new Date('2025-01-01T00:00:00.000Z')
  });
}

test.beforeEach(async ({ browserName }, testInfo) => {
  void browserName;
  const fixtures = createAdminFixtures(testInfo.testId, testInfo.workerIndex, testInfo.retry);
  fixturesByTestId.set(testInfo.testId, fixtures);
  await cleanAdminFixtures(fixtures);
});

test.afterEach(async ({ browserName }, testInfo) => {
  void browserName;
  const fixtures = fixturesByTestId.get(testInfo.testId);
  if (!fixtures) return;
  await cleanAdminFixtures(fixtures);
  fixturesByTestId.delete(testInfo.testId);
});

test('reservation removal contains focus, recovers from a rejected request, and audits removal', async ({
  page
}, testInfo) => {
  const { reservationName } = fixturesByTestId.get(testInfo.testId)!;
  await signInAsFixedAdmin(page);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Stale identifiers' })).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill(reservationName);
  await page.getByLabel('Reason', { exact: true }).fill('e2e test reservation');
  await page.getByRole('button', { name: 'Add reservation' }).click();
  const reservationRow = page.getByRole('row', { name: new RegExp(reservationName) });
  await expect(reservationRow).toBeVisible();

  const launcher = reservationRow.getByRole('button', {
    name: `Remove reservation for ${reservationName}`,
    exact: true
  });
  await launcher.click();
  const dialog = page.getByRole('dialog', {
    name: `Remove reservation for ${reservationName}?`,
    exact: true
  });
  await expect(dialog).toHaveAccessibleDescription(
    'This makes the name available for anyone else to claim.'
  );
  const action = dialog.getByRole('button', { name: 'Remove reservation' });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });

  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(action).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(action).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();

  await launcher.click();
  await page.mouse.click(0, 0);
  await expect(dialog).toBeVisible();

  let requestStartedResolve!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    requestStartedResolve = resolve;
  });
  let rejectRequest!: () => Promise<void>;
  await page.route(REMOVE_RESERVATION_ROUTE, async (route) => {
    requestStartedResolve();
    await new Promise<void>((resolve) => {
      rejectRequest = async () => {
        await route.abort('failed');
        resolve();
      };
    });
  });

  await action.click();
  await requestStarted;
  await expect(dialog).toBeFocused();
  await expect(action).toBeDisabled();
  await expect(cancel).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await rejectRequest();
  await expect(
    dialog.getByText('We could not remove the reservation. Please try again.')
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(action).toBeEnabled();
  await expect(cancel).toBeEnabled();
  await expect(cancel).toBeFocused();

  await page.unroute(REMOVE_RESERVATION_ROUTE);
  await action.click();
  await expect(reservationRow).toBeHidden();

  const events = await db
    .select({
      eventType: identifierEvents.eventType,
      actorPubkey: identifierEvents.actorPubkey,
      reason: identifierEvents.reason
    })
    .from(identifierEvents)
    .where(eq(identifierEvents.identifierName, reservationName))
    .orderBy(asc(identifierEvents.id));
  expect(events).toEqual([
    {
      eventType: 'reserved',
      actorPubkey: FIXED_ADMIN_PUBKEY,
      reason: 'e2e test reservation'
    },
    {
      eventType: 'reservation_removed',
      actorPubkey: FIXED_ADMIN_PUBKEY,
      reason: null
    }
  ]);
});

test('force release contains focus, recovers from a rejected request, and audits release', async ({
  page
}, testInfo) => {
  const { staleName } = fixturesByTestId.get(testInfo.testId)!;
  await signInAsFixedAdmin(page);
  await seedStaleClaimedIdentifier(staleName);
  await page.goto('/admin');

  const staleRow = page.getByRole('row', { name: new RegExp(staleName) });
  await expect(staleRow).toBeVisible();
  const launcher = staleRow.getByRole('button', {
    name: `Force release ${staleName}`,
    exact: true
  });
  await launcher.click();
  const dialog = page.getByRole('dialog', {
    name: `Force release ${staleName}?`,
    exact: true
  });
  await expect(dialog).toHaveAccessibleDescription(
    'This makes the identifier available for anyone else to claim and cannot be undone.'
  );
  const reason = dialog.getByLabel('Reason (required)');
  const action = dialog.getByRole('button', { name: `Force release ${staleName}` });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });

  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(reason).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Tab');
  await reason.fill('e2e recovery');
  await page.keyboard.press('Tab');
  await expect(action).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(action).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();

  await launcher.click();
  await page.mouse.click(0, 0);
  await expect(dialog).toBeVisible();
  await reason.fill('e2e recovery');

  let requestStartedResolve!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    requestStartedResolve = resolve;
  });
  let rejectRequest!: () => Promise<void>;
  await page.route(FORCE_RELEASE_ROUTE, async (route) => {
    requestStartedResolve();
    await new Promise<void>((resolve) => {
      rejectRequest = async () => {
        await route.abort('failed');
        resolve();
      };
    });
  });

  await action.click();
  await requestStarted;
  await expect(dialog).toBeFocused();
  await expect(action).toBeDisabled();
  await expect(cancel).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await rejectRequest();
  await expect(
    dialog.getByText('We could not force-release this identifier. Please try again.')
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(action).toBeEnabled();
  await expect(cancel).toBeEnabled();
  await expect(cancel).toBeFocused();

  await page.unroute(FORCE_RELEASE_ROUTE);
  await action.click();
  await expect(staleRow).toBeHidden();

  const events = await db
    .select({
      eventType: identifierEvents.eventType,
      actorPubkey: identifierEvents.actorPubkey,
      reason: identifierEvents.reason
    })
    .from(identifierEvents)
    .where(eq(identifierEvents.identifierName, staleName))
    .orderBy(asc(identifierEvents.id));
  expect(events).toEqual([
    {
      eventType: 'force_released',
      actorPubkey: FIXED_ADMIN_PUBKEY,
      reason: 'e2e recovery'
    }
  ]);
});

test('authenticated non-admin users receive 403 from the dashboard and write endpoints', async ({
  page
}) => {
  await installFakeNostrExtension(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with extension' }).click();
  await page.waitForURL('**/claim');

  const dashboard = await page.goto('/admin');
  expect(dashboard?.status()).toBe(403);

  const statuses = await page.evaluate(async () => {
    const responses = await Promise.all([
      fetch('/api/admin/reservations', {
        method: 'POST',
        body: JSON.stringify({ name: 'forbidden-e2e', reason: 'e2e test' })
      }),
      fetch('/api/admin/reservations/forbidden-e2e', { method: 'DELETE' }),
      fetch('/api/admin/force-release', {
        method: 'POST',
        body: JSON.stringify({ name: 'forbidden-e2e', reason: 'e2e test' })
      })
    ]);
    return responses.map((response) => response.status);
  });
  expect(statuses).toEqual([403, 403, 403]);
});
