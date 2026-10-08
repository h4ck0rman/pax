import { useEffect, useRef } from 'react';

/** A short, self-contained confetti burst for the celebration on the review
 *  screen. No external library and no remote asset, because the strict
 *  Content-Security-Policy allows only 'self'. Colours are the palette greens
 *  and cream, so it stays on brand. Does nothing when the reader prefers reduced
 *  motion. */
export default function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();

    // Palette only: green ink at two weights and cream.
    const colours = ['#214539', 'rgba(33, 69, 57, 0.65)', '#F0EBD6'];
    const pieces = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: -Math.random() * canvas.height * 0.4,
      size: (5 + Math.random() * 8) * dpr,
      colour: colours[Math.floor(Math.random() * colours.length)],
      vx: (-1 + Math.random() * 2) * dpr,
      vy: (2.5 + Math.random() * 4) * dpr,
      rot: Math.random() * Math.PI,
      spin: -0.2 + Math.random() * 0.4,
      round: Math.random() < 0.5,
    }));

    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03 * dpr; // gentle gravity
        p.rot += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.colour;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }
      if (now - started < 2800) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
