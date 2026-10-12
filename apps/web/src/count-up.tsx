import { useEffect, useRef, useState } from "react";

/** Anima un número desde 0 la primera vez que entra en pantalla. Respeta "reducir movimiento". */
export function CountUp({ value, format, duration = 1100 }: { value: number; format: (v: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce || !ref.current) return;
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        setShown(value * (1 - (1 - t) ** 3));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration, reduce]);

  return (
    <span ref={ref} className="tabular-nums">
      {format(shown)}
      {/* El valor final, para lectores de pantalla, sin animación. */}
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
