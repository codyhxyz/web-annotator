import { useEffect, useState } from 'react';
import { Copy, StickyNote, Trash2, Palette } from 'lucide-react';
import { storage } from '../store/storage';
import { deleteAnnotation, updateAnnotation, addAnnotation } from '../store/undoable';
import { getHighlightData } from '../store/annotation';
import type { UndoAction } from '../hooks/useUndoRedo';

interface Props {
  onUndoableAction: (action: UndoAction) => void;
}

interface MenuState {
  id: string;
  x: number;
  y: number;
}

const COLOR_OPTIONS = ['#fde047', '#fca5a5', '#86efac', '#93c5fd', '#f0abfc'];

export default function HighlightMenu({ onUndoableAction }: Props) {
  const [state, setState] = useState<MenuState | null>(null);
  const [showColors, setShowColors] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const { id, x, y } = (e as CustomEvent).detail as MenuState;
      setState({ id, x, y });
      setShowColors(false);
    };
    const onClick = (e: MouseEvent) => {
      // Close on any click outside menu or on another highlight
      const target = e.target as HTMLElement;
      if (target.closest?.('[data-annotator-highlight-menu]')) return;
      if (target.hasAttribute?.('data-annotator-highlight-id')) return;
      setState(null);
    };
    // No `scroll` listener: the menu is `position: absolute` inside the
    // document overlay, so it scrolls with the page natively (stone-
    // synchrony). The previous implementation closed the menu on scroll
    // AND leaked its listener — both gone.
    window.addEventListener('annotator-highlight-menu', onOpen);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('annotator-highlight-menu', onOpen);
      document.removeEventListener('click', onClick);
    };
  }, []);

  if (!state) return null;

  const close = () => setState(null);

  const doCopy = async () => {
    const ann = await storage.get(state.id);
    if (!ann) return close();
    try {
      const parsed = JSON.parse(getHighlightData(ann).serializedRange);
      await navigator.clipboard.writeText(parsed?.quote?.exact ?? '');
    } catch { /* ignore */ }
    close();
  };

  const doAddNote = async () => {
    const ann = await storage.get(state.id);
    if (!ann) return close();
    const action = await addAnnotation({
      id: crypto.randomUUID(),
      url: ann.url,
      type: 'note',
      data: JSON.stringify({
        text: '', x: state.x, y: state.y + 12, width: 260, height: 130,
        linkedHighlightId: state.id,
      }),
      color: '#fef08a',
      timestamp: Date.now(),
      pageTitle: ann.pageTitle,
      favicon: ann.favicon,
      pageSection: ann.pageSection,
    });
    onUndoableAction(action);
    close();
  };

  const doColor = async (color: string) => {
    const action = await updateAnnotation(state.id, { color });
    onUndoableAction(action);
    close();
  };

  const doDelete = async () => {
    const action = await deleteAnnotation(state.id);
    onUndoableAction(action);
    close();
  };

  return (
    <div
      data-annotator-highlight-menu
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: state.x,
        top: state.y + 8,
        transform: 'translateX(-50%)',
        zIndex: 10000,
        pointerEvents: 'auto',
        background: 'white',
        borderRadius: 10,
        boxShadow: '0 10px 30px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.08)',
        padding: 6,
        display: 'flex',
        gap: 2,
        alignItems: 'center',
      }}
    >
      {!showColors ? (
        <>
          <MenuBtn icon={Copy} label="Copy text" onClick={doCopy} />
          <MenuBtn icon={StickyNote} label="Add note" onClick={doAddNote} />
          <MenuBtn icon={Palette} label="Color" onClick={() => setShowColors(true)} />
          <MenuBtn icon={Trash2} label="Delete" onClick={doDelete} danger />
        </>
      ) : (
        <div style={{ display: 'flex', gap: 4, padding: '4px 6px' }}>
          {COLOR_OPTIONS.map(c => (
            <button
              key={c}
              onClick={() => doColor(c)}
              style={{
                width: 22, height: 22, borderRadius: '50%',
                backgroundColor: c, border: '1px solid rgba(0,0,0,0.1)',
                cursor: 'pointer',
              }}
              title={c}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuBtn({
  icon: Icon, label, onClick, danger,
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 8,
        border: 'none', background: 'transparent',
        color: danger ? '#dc2626' : '#475569',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? '#fee2e2' : '#f1f5f9')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon size={16} />
    </button>
  );
}
