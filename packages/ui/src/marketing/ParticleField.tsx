"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
}

/**
 * Lightweight canvas particle field — green "data motes" drifting upward
 * with proximity link lines. Renders a single static frame when the user
 * prefers reduced motion. Place inside a `relative` parent.
 */
export function ParticleField({
  className = "",
  density = 14000,
  maxParticles = 110,
}: {
  className?: string;
  density?: number;
  maxParticles?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let particles: Particle[] = [];
    let raf = 0;
    let width = 0;
    let height = 0;
    let inView = true;

    const seed = () => {
      const count = Math.min(
        maxParticles,
        Math.floor((width * height) / density)
      );
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -(0.05 + Math.random() * 0.2),
        r: 0.6 + Math.random() * 1.4,
        alpha: 0.15 + Math.random() * 0.5,
      }));
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const LINK_DIST = 110;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DIST) {
            ctx.strokeStyle = `rgba(34,197,94,${(1 - dist / LINK_DIST) * 0.08})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
        ctx.fillStyle = `rgba(34,197,94,${p.alpha * 0.55})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = () => {
      if (!inView) {
        raf = 0;
        return;
      }
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -8) {
          p.y = height + 8;
          p.x = Math.random() * width;
        }
        if (p.x < -8) p.x = width + 8;
        if (p.x > width + 8) p.x = -8;
      }
      draw();
      raf = requestAnimationFrame(step);
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    // Pause the animation loop while the canvas is scrolled out of view —
    // the O(n²) link pass is wasted work (and battery) offscreen.
    const visibility = new IntersectionObserver(([entry]) => {
      const wasInView = inView;
      inView = entry?.isIntersecting ?? true;
      if (!reduceMotion && inView && !wasInView && raf === 0) {
        raf = requestAnimationFrame(step);
      }
    });
    visibility.observe(canvas);

    if (reduceMotion) {
      draw();
    } else {
      raf = requestAnimationFrame(step);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      visibility.disconnect();
    };
  }, [density, maxParticles]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
    />
  );
}
