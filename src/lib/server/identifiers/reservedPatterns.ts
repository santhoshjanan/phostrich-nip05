const RESERVED_EXACT = new Set([
  // platform protection
  'admin', 'support', 'help', 'contact', 'security', 'abuse', 'phostrich', 'www', 'api', 'root',
  'moderator', 'mod', 'staff', 'official', 'noreply', 'postmaster', 'webmaster', 'sysadmin',
  // generic / impersonation-prone
  'info', 'news', 'test', 'null', 'undefined', 'anonymous', 'everyone', 'nobody', 'system', 'service', 'bot',
  // government, prominent
  'whitehouse', 'fbi', 'cia', 'nsa', 'potus', 'congress', 'senate', 'un', 'nato', 'treasury', 'irs', 'pentagon',
  // major companies, likely-impersonated
  'google', 'apple', 'microsoft', 'amazon', 'meta', 'facebook', 'twitter', 'x', 'tesla', 'openai',
  'anthropic', 'binance', 'coinbase', 'kraken'
]);

// This set is a curated starting point, not a claim of exhaustiveness - extend it
// via ordinary code review as squatting/impersonation attempts surface.
const RESERVED_PATTERNS = [/(^|[._-])gov([._-]|$)/i];

const NAME_FORMAT = /^[a-z0-9._-]+$/;
const MIN_LENGTH = 2;
const MAX_LENGTH = 30;

export function isValidNameFormat(name: string): boolean {
  if (name.length < MIN_LENGTH || name.length > MAX_LENGTH) return false;
  if (!NAME_FORMAT.test(name)) return false;
  if (name.startsWith('.') || name.endsWith('.')) return false;
  if (name.startsWith('-') || name.endsWith('-')) return false;
  if (name.startsWith('_') || name.endsWith('_')) return false;
  if (name.includes('..')) return false;
  return true;
}

export function isClaimableName(name: string): boolean {
  if (!isValidNameFormat(name)) return false;
  if (RESERVED_EXACT.has(name)) return false;
  if (RESERVED_PATTERNS.some((pattern) => pattern.test(name))) return false;
  return true;
}
