/**
 * ═══════════════════════════════════════════════════════════════════════
 *  STONE-SYNCHRONY INVARIANT
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The annotator overlay must move with the page in EXACT synchrony:
 * zero lag, zero jump, zero inertia. Writing on a piece of stone.
 *
 * The lag pattern this module exists to prevent looks like:
 *
 *     useEffect(() => {
 *       const update = () => { el.style.top = `${window.scrollY + ...}`; };
 *       window.addEventListener('scroll', update);
 *     }, []);
 *
 * Scroll events fire AFTER the browser has painted the new scroll
 * position, so any element whose position is JS-coordinated to scroll
 * is, by construction, one frame behind. The user perceives this as
 * the bar "swimming" through the scroll.
 *
 * ── The two correct anchorings ───────────────────────────────────────
 *
 *  1. VIEWPORT-PINNED  → `position: fixed`.  Browser keeps the element
 *     locked to viewport coords natively; no JS coordination needed.
 *     Use for: command palette, contextual tool panel, modal overlays,
 *     pinned notes, the Handoff bar.
 *
 *  2. PAGE-PINNED      → `position: absolute` inside the document-
 *     spanning overlay container (which itself scrolls with the page
 *     because it lives in document flow). The element scrolls with
 *     the page natively.
 *     Use for: notes anchored to a paragraph, highlight marks, the
 *     highlight menu, pen strokes.
 *
 * ── Forbidden patterns ───────────────────────────────────────────────
 *
 *  • Any read of `window.scrollX` / `window.scrollY` inside a scroll
 *    or pointermove listener that writes an element's position.
 *  • Any `requestAnimationFrame` loop that tracks scroll.
 *  • Any IntersectionObserver / ResizeObserver-driven repositioning
 *    of an overlay element to compensate for scroll.
 *  • Use of position:fixed on an element whose anchor point lives in
 *    document coords (it will appear to scroll wrong because fixed
 *    elements DON'T scroll with the page).
 *
 *  The one known escape hatch is `OverlayCanvas` — see its file-level
 *  comment for the memory trade-off that justifies the violation, and
 *  the SVG-renderer migration path that would close it.
 *
 * ── How to comply ────────────────────────────────────────────────────
 *
 *  Use the primitives below. They do not contain any JS scroll
 *  coordination, and that is intentional. If you ever feel the need to
 *  add a scroll listener inside one of these primitives, you are about
 *  to violate the invariant — stop, and revisit your positioning model.
 */

import { useEffect, type CSSProperties, type RefObject } from 'react';

/**
 * Anchor an element to a fixed point in the viewport. Returns a style
 * object you spread onto the element. Uses `position: fixed` — the
 * element stays glued to the viewport synchronously as the page
 * scrolls. Zero JS coordination.
 */
export function viewportBottomCenter(offsetPx: number): CSSProperties {
  return {
    position: 'fixed',
    bottom: offsetPx,
    left: '50%',
    transform: 'translateX(-50%)',
  };
}

/**
 * Fade an element when the mouse is far from it. Operates on the DOM
 * directly via the supplied ref — no React state, no re-renders of
 * children, no animation libraries fighting for control. Applies an
 * opacity transition once on mount and updates opacity inside rAF.
 *
 * `nearPx` and `farPx` are distances from the element's bounding rect
 * (0 if the mouse is inside the rect, otherwise the L∞-style distance
 * to the nearest edge). Below `nearPx` → fully opaque. Above `farPx`
 * → `idleOpacity`. Linear interpolation between.
 */
export function useProximityDim(
  ref: RefObject<HTMLElement | null>,
  opts: { nearPx: number; farPx: number; idleOpacity: number },
) {
  const { nearPx, farPx, idleOpacity } = opts;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = 'opacity 200ms ease-out';

    let mouseX = -Infinity;
    let mouseY = -Infinity;
    let rafQueued = false;

    const apply = () => {
      rafQueued = false;
      const node = ref.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const dx = Math.max(r.left - mouseX, 0, mouseX - r.right);
      const dy = Math.max(r.top - mouseY, 0, mouseY - r.bottom);
      const dist = Math.hypot(dx, dy);
      const range = Math.max(1, farPx - nearPx);
      const t = Math.max(0, Math.min(1, (dist - nearPx) / range));
      node.style.opacity = String(1 - t * (1 - idleOpacity));
    };

    const onMove = (e: PointerEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (rafQueued) return;
      rafQueued = true;
      requestAnimationFrame(apply);
    };

    // Initial state: assume mouse is far (so newly-mounted bars start
    // dimmed and only light up when the user actually approaches them).
    apply();
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [ref, nearPx, farPx, idleOpacity]);
}
