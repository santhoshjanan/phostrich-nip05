import { config } from '../config';

export function isAdmin(pubkey: string, admins: string[] = config.ADMIN_PUBKEYS): boolean {
  return admins.includes(pubkey.toLowerCase());
}
