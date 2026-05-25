import { useEffect, useRef } from "react";
import { getHighlightData, type Annotation } from "../store/annotation";
import { useAnnotations } from "../hooks/useAnnotations";
import { serializeRange, deserializeRange, isInsideShadowDOM } from "../utils/rangeSerializer";
import { addAnnotation } from "../store/undoable";
import { getPageContext } from "../utils/pageContext";
import { currentPageKey } from "../utils/normalizeUrl";
import type { UndoAction } from "../hooks/useUndoRedo";

interface Props {
  isActive: boolean;
  color: string;
  onUndoableAction?: (action: UndoAction) => void;
}

const HIGHLIGHT_ATTR = 'data-annotator-highlight-id';

export default function useHighlighterTool({ isActive, color, onUndoableAction }: Props) {
  const url = currentPageKey();
  const highlights = useAnnotations({ url, type: 'highlight' });

  // Stable ref so the renderer's deps don't retrigger on push identity change.
  const onActionRef = useRef(onUndoableAction);
  useEffect(() => { onActionRef.current = onUndoableAction; }, [onUndoableAction]);

  // Diff-based rendering: only add marks for new highlights, only remove
  // marks whose highlight is gone, only recolor changed ones. The old
  // implementation cleanup-and-reinjected every time `highlights`
  // changed and flickered every undo.
  useEffect(() => {
    if (!highlights) return;

    const wantById = new Map<string, Annotation>();
    for (const h of highlights) wantById.set(h.id, h);

    // Remove marks whose annotation is gone.
    const existingMarks = document.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_ATTR}]`);
    const seen = new Set<string>();
    existingMarks.forEach(mark => {
      const id = mark.getAttribute(HIGHLIGHT_ATTR)!;
      const want = wantById.get(id);
      if (!want) {
        unwrapMark(mark);
      } else {
        seen.add(id);
        if (mark.style.backgroundColor !== want.color) {
          mark.style.backgroundColor = want.color;
        }
      }
    });

    // Inject marks for annotations that don't yet have a rendered mark.
    for (const h of highlights) {
      if (seen.has(h.id)) continue;
      try {
        const range = deserializeRange(getHighlightData(h).serializedRange);
        if (range) injectMark(range, h.id, h.color);
      } catch { /* XPath no longer valid — skip */ }
    }

    return () => {
      document.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_ATTR}]`).forEach(unwrapMark);
    };
  }, [highlights]);

  // Selection capture
  useEffect(() => {
    if (!isActive) return;
    let didMouseDown = false;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (isInsideShadowDOM(target)) return;
      if (target.hasAttribute?.(HIGHLIGHT_ATTR)) return;

      didMouseDown = true;

      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
        try {
          sel.modify('extend', 'forward', 'word');
          sel.modify('extend', 'backward', 'word');
          sel.collapseToStart();
          sel.modify('move', 'backward', 'word');
          sel.modify('extend', 'forward', 'word');
        } catch { /* unsupported */ }
      });
    };

    const onMouseUp = () => {
      if (!didMouseDown) return;
      didMouseDown = false;

      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);

        if (isInsideShadowDOM(range.startContainer) || isInsideShadowDOM(range.endContainer)) return;
        if ((range.startContainer.parentElement as HTMLElement)?.hasAttribute?.(HIGHLIGHT_ATTR)) return;

        try { expandRangeToWordBoundaries(range); } catch { /* ignore */ }

        const text = range.toString().trim();
        if (!text) return;

        const rangeRect = range.getBoundingClientRect();
        const context = getPageContext(rangeRect.top + window.scrollY);

        serializeRange(range).then(serialized => {
          addAnnotation({
            id: crypto.randomUUID(), url, type: 'highlight',
            data: JSON.stringify({ serializedRange: serialized }),
            color, timestamp: Date.now(),
            ...context,
          }).then(a => onActionRef.current?.(a));
        });

        sel.removeAllRanges();
      });
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isActive, color, url]);
}

// ── DOM helpers ───────────────────────────────────────────────────────

function injectMark(range: Range, id: string, color: string) {
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    { acceptNode: node => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT },
  );

  const hits: { node: Text; startOffset: number; endOffset: number }[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    let s = 0, e = t.length;
    if (t === range.startContainer) s = range.startOffset;
    if (t === range.endContainer) e = range.endOffset;
    if (s < e) hits.push({ node: t, startOffset: s, endOffset: e });
  }

  // Reverse so earlier splits don't invalidate later nodes.
  for (let i = hits.length - 1; i >= 0; i--) {
    wrapOne(hits[i]!, id, color);
  }
}

function wrapOne(
  { node, startOffset, endOffset }: { node: Text; startOffset: number; endOffset: number },
  id: string, color: string,
) {
  const parent = node.parentNode;
  if (!parent) return;

  const fullText = node.textContent || '';
  if (startOffset >= fullText.length) return;

  const mark = document.createElement('mark');
  mark.setAttribute(HIGHLIGHT_ATTR, id);
  mark.style.backgroundColor = color;
  mark.style.color = 'inherit';
  mark.style.opacity = '0.5';
  mark.style.transition = 'opacity 0.2s';
  mark.style.cursor = 'pointer';
  mark.style.borderRadius = '2px';
  mark.style.padding = '0';
  mark.style.margin = '0';
  mark.textContent = fullText.substring(startOffset, endOffset);

  mark.addEventListener('click', (e) => {
    e.stopPropagation(); e.preventDefault();
    const rect = mark.getBoundingClientRect();
    // Menu lives inside the document-spanning overlay with
    // `position: absolute`, so both x and y must be document-coords.
    window.dispatchEvent(new CustomEvent('annotator-highlight-menu', {
      detail: {
        id,
        x: rect.left + window.scrollX + rect.width / 2,
        y: rect.bottom + window.scrollY,
      },
    }));
  });
  mark.addEventListener('mouseenter', () => { mark.style.opacity = '0.7'; });
  mark.addEventListener('mouseleave', () => { mark.style.opacity = '0.5'; });

  const frag = document.createDocumentFragment();
  if (startOffset > 0) frag.appendChild(document.createTextNode(fullText.substring(0, startOffset)));
  frag.appendChild(mark);
  if (endOffset < fullText.length) frag.appendChild(document.createTextNode(fullText.substring(endOffset)));

  parent.replaceChild(frag, node);
}

function unwrapMark(mark: Element) {
  const parent = mark.parentNode;
  if (!parent) return;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  parent.normalize();
}

function expandRangeToWordBoundaries(range: Range) {
  const wordChar = /[\w\u00C0-\u024F\u1E00-\u1EFF]/;

  const startNode = range.startContainer;
  let startOffset = range.startOffset;
  if (startNode.nodeType === Node.TEXT_NODE) {
    const text = startNode.textContent || '';
    while (startOffset > 0 && wordChar.test(text[startOffset - 1]!)) startOffset--;
    range.setStart(startNode, startOffset);
  }

  const endNode = range.endContainer;
  let endOffset = range.endOffset;
  if (endNode.nodeType === Node.TEXT_NODE) {
    const text = endNode.textContent || '';
    while (endOffset < text.length && wordChar.test(text[endOffset]!)) endOffset++;
    range.setEnd(endNode, endOffset);
  }
}
