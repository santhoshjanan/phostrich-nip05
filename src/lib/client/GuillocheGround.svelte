<script lang="ts">
  import { onMount } from 'svelte';

  // Security-paper guilloché: a few overlaid spirograph rosettes drawn in the
  // hairline colour at very low alpha over the lavender canvas, drifting so
  // slowly the motion is only noticeable if you stare. Reduced-motion and
  // hidden tabs get a single static frame. It's texture, not an effect —
  // the "issued credential" thesis rendered into the substrate.

  let canvas: HTMLCanvasElement;

  const ROSETTES = [
    { R: 0.46, r: 0.128, d: 0.19, turns: 60, speed: 0.006, alpha: 0.042 },
    { R: 0.34, r: 0.052, d: 0.1, turns: 42, speed: -0.009, alpha: 0.038 },
    { R: 0.6, r: 0.21, d: 0.075, turns: 34, speed: 0.004, alpha: 0.03 }
  ];

  onMount(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const g = ctx;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let phase = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;

    // Drawn in the muted-ink tone rather than the hairline colour: at a few
    // percent alpha it reads as a faint engraving on close inspection and
    // vanishes at a glance — the hairline colour was too pale to register.
    const stroke =
      getComputedStyle(document.documentElement).getPropertyValue('--color-ink-muted').trim() ||
      '#6b6572';

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    }

    function render() {
      g.clearRect(0, 0, w, h);
      g.lineWidth = 1;
      g.strokeStyle = stroke;
      g.lineJoin = 'round';
      const cx = w / 2;
      const cy = h / 2;
      // Zoom the rosette in on narrow viewports so its line density stays
      // roughly constant per inch — otherwise it reads as busy on phones.
      const scale = Math.hypot(w, h) * (w < 640 ? 0.92 : 0.62);

      for (const cfg of ROSETTES) {
        const R = cfg.R * scale;
        const r = cfg.r * scale;
        const d = cfg.d * scale;
        const k = (R - r) / r;
        const drift = phase * cfg.speed;
        g.globalAlpha = cfg.alpha;
        g.beginPath();
        const step = 0.014;
        const end = Math.PI * 2 * cfg.turns;
        for (let a = 0; a <= end; a += step) {
          const x = cx + (R - r) * Math.cos(a) + d * Math.cos(k * a + drift);
          const y = cy + (R - r) * Math.sin(a) - d * Math.sin(k * a + drift);
          if (a === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    function tick() {
      phase += 1;
      render();
      raf = requestAnimationFrame(tick);
    }

    function start() {
      cancelAnimationFrame(raf);
      if (reduced.matches || document.hidden) {
        render();
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    const onVisibility = () => start();
    const onResize = () => {
      cancelAnimationFrame(raf);
      resize();
      start();
    };

    resize();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);
    reduced.addEventListener('change', start);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      reduced.removeEventListener('change', start);
    };
  });
</script>

<canvas bind:this={canvas} class="guilloche" aria-hidden="true"></canvas>

<style>
  .guilloche {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    pointer-events: none;
    /* Fades the pattern out toward the edges so it never crowds the viewport frame. */
    -webkit-mask-image: radial-gradient(145% 120% at 50% 38%, #000 58%, transparent 100%);
    mask-image: radial-gradient(145% 120% at 50% 38%, #000 58%, transparent 100%);
  }
</style>
