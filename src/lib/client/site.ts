// Public identity of the deployed site, for document metadata only.
//
// Deliberately a plain constant rather than PUBLIC_ORIGIN: canonical and
// og:url must name the *production* location of a page no matter which host
// rendered it, so deriving them from the running environment is wrong — dev
// would emit `http://localhost:5173/...` as its own canonical. Keeping it out
// of the env modules also avoids their sharp edges: `$env/static/public`
// fails to type-check anywhere the variable is absent (a fresh clone, a CI
// lint job), and `$env/dynamic/public` is unavailable under the test runner.
//
// Self-hosting this app under another domain? Change SITE_ORIGIN.
export const SITE_ORIGIN = 'https://phostrich.com';
export const SITE_NAME = 'Phostrich';
