import { forwardRef, useEffect } from "react";

interface Props {
  isActive: boolean;
  pointerEvents: 'auto' | 'none';
  cursor: string;
}

/**
 * Viewport-pinned canvas. The earlier implementation sized the canvas
 * to the full document (scrollWidth × scrollHeight), which on a 20k-px
 * page produced a 120 MB backing store. We now keep it viewport-sized
 * and `position: fixed` so the browser anchors it to the viewport
 * natively — no JS-driven `transform: translate(scrollX, scrollY)`,
 * which used to lag one frame behind every scroll.
 *
 * Strokes are stored in document-space; the redraw in usePenTool
 * translates by -scroll on draw, fired by an `annotator-redraw` event
 * on scroll/resize. Stroke content still pays a one-frame redraw cost
 * on fast scroll — this is the documented escape hatch from the stone-
 * synchrony rule (see src/utils/synchrony.ts). Closing it requires an
 * SVG-element renderer instead of canvas; deferred.
 */
export default forwardRef<HTMLCanvasElement, Props>(function OverlayCanvas(
  { isActive, pointerEvents, cursor },
  ref,
) {
  useEffect(() => {
    const canvas = typeof ref === 'function' ? null : ref?.current;
    if (!canvas) return;

    if (!isActive) {
      if (canvas.width > 0) { canvas.width = 0; canvas.height = 0; }
      return;
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    // Scroll listener fires a redraw event so strokes recompute their
    // viewport coords. It does NOT write any DOM/style — the canvas
    // itself stays glued to the viewport via `position: fixed`.
    const onScroll = () => canvas.dispatchEvent(new CustomEvent('annotator-redraw'));
    const onResize = () => { resize(); canvas.dispatchEvent(new CustomEvent('annotator-redraw')); };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [isActive, ref]);

  return (
    <canvas
      ref={ref}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 1,
        pointerEvents,
        cursor,
      }}
    />
  );
});
