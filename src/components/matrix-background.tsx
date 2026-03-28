import { useEffect, useRef } from 'react';

export function MatrixBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const dropsRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*(){}[]<>/|~';
    const fontSize = 14;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const columns = Math.floor(canvas.width / fontSize);
      dropsRef.current = Array.from({ length: columns }, () => Math.random() * -50);
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const isDark = document.documentElement.classList.contains('dark');
      const columns = Math.floor(canvas.width / fontSize);

      if (dropsRef.current.length !== columns) {
        dropsRef.current = Array.from({ length: columns }, () => Math.random() * -50);
      }

      ctx.fillStyle = isDark ? 'rgba(10, 10, 10, 0.06)' : 'rgba(248, 249, 250, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px "JetBrains Mono", monospace`;

      for (let i = 0; i < dropsRef.current.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = dropsRef.current[i] * fontSize;
        const opacity = isDark ? 0.06 + Math.random() * 0.1 : 0.03 + Math.random() * 0.05;

        ctx.fillStyle = isDark
          ? `rgba(34, 211, 238, ${opacity})`
          : `rgba(13, 148, 136, ${opacity})`;
        ctx.fillText(char, x, y);

        if (y > canvas.height && Math.random() > 0.975) {
          dropsRef.current[i] = 0;
        }
        dropsRef.current[i] += 0.35;
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    animationRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full z-0 pointer-events-none"
      data-testid="matrix-background"
    />
  );
}
