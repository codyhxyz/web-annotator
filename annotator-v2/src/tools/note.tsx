import { StickyNote } from 'lucide-react';
import { useEffect } from 'react';
import AnnotationCard from '../components/AnnotationCard';
import { addAnnotation } from '../store/undoable';
import { useAnnotations } from '../hooks/useAnnotations';
import { getPageContext } from '../utils/pageContext';
import type { Tool, ToolContext } from './types';

function NoteTool({ ctx }: { ctx: ToolContext }) {
  const notes = useAnnotations({ url: ctx.pageKey, type: 'note' });

  // Note-creation is driven by App.tsx's container click handler; this
  // component only renders existing notes and exposes the creator.
  useEffect(() => {
    if (!ctx.active) return;
    // Nothing to bind: click capture happens at the overlay container.
  }, [ctx.active]);

  if (!ctx.overlayActive) return null;
  return (
    <>
      {notes?.map(ann => (
        <AnnotationCard
          key={ann.id}
          annotation={ann}
          onUndoableAction={ctx.push}
          isSelected={ctx.selectedAnnotationId === ann.id}
        />
      ))}
    </>
  );
}

/** Called by App on container click when this tool is active. */
export async function createNoteAt(
  ctx: ToolContext,
  clientX: number,
  clientY: number,
) {
  const noteY = clientY + window.scrollY;
  const context = getPageContext(noteY);
  const action = await addAnnotation({
    id: crypto.randomUUID(),
    url: ctx.pageKey,
    type: 'note',
    data: JSON.stringify({
      text: '',
      x: clientX + window.scrollX,
      y: noteY,
      width: 250,
      height: 120,
    }),
    color: ctx.color,
    timestamp: Date.now(),
    ...context,
  });
  ctx.push(action);
}

export const noteTool: Tool = {
  id: 'note',
  label: 'Note',
  hotkey: 'n',
  icon: StickyNote,
  takesColor: true,
  defaultColor: '#fef08a',
  surface: 'click',
  Component: NoteTool,
};
