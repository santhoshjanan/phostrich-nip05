<script lang="ts">
  import { PUBLIC_ORIGIN } from '$env/static/public';

  // Per-route document head.
  //
  // The absolute origin comes from PUBLIC_ORIGIN, which SvelteKit inlines at
  // build time — deliberately not from `$app/state`, whose `page` boots the
  // client runtime on import and breaks component tests that render a page
  // directly. `path` is opt-in: canonical and og:url are only meaningful on
  // the indexable route, and the signed-in routes that omit it are noindex.
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

  const SITE_NAME = 'Phostrich';
  const fullTitle = $derived(`${title} · ${SITE_NAME}`);
  const canonical = $derived(path ? `${PUBLIC_ORIGIN}${path}` : undefined);
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
