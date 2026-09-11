<script lang="ts">
  import { SITE_NAME, SITE_ORIGIN } from './site';

  // Per-route document head. The origin comes from a plain constant — see
  // site.ts for why not `$app/state` or either env module.
  //
  // `path` is opt-in: canonical and og:url are only meaningful on the one
  // indexable route, and the signed-in routes that omit it are noindex.
  interface Props {
    /** Page-specific half of the title; the site name is appended. */
    title: string;
    description: string;
    /** Absolute path of this route, e.g. `/login`. Enables canonical + og:url. */
    path?: string;
    /** Signed-in and transactional routes stay out of search results. */
    noindex?: boolean;
  }
  let { title, description, path, noindex = false }: Props = $props();

  const fullTitle = $derived(`${title} · ${SITE_NAME}`);
  const canonical = $derived(path ? `${SITE_ORIGIN}${path}` : undefined);
</script>

<svelte:head>
  <title>{fullTitle}</title>
  <meta name="description" content={description} />
  {#if canonical}
    <link rel="canonical" href={canonical} />
  {/if}
  {#if noindex}
    <meta name="robots" content="noindex, nofollow" />
  {/if}

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={SITE_NAME} />
  <meta property="og:title" content={fullTitle} />
  <meta property="og:description" content={description} />
  {#if canonical}
    <meta property="og:url" content={canonical} />
  {/if}

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={fullTitle} />
  <meta name="twitter:description" content={description} />
</svelte:head>
