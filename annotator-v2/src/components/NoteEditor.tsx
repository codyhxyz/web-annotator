import { useEffect, useMemo, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { $getRoot, $createParagraphNode, $createTextNode, type EditorState, type LexicalEditor } from 'lexical';

interface Props {
  initialState?: string;
  initialText: string;
  onChange: (state: string, text: string) => void;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

const theme = {
  paragraph: 'note-p',
  text: { bold: 'note-bold', italic: 'note-italic', underline: 'note-underline' },
  list: {
    nested: { listitem: 'note-nested-li' },
    ul: 'note-ul', ol: 'note-ol', listitem: 'note-li',
  },
};

/**
 * Per-annotation Lexical editor. Two invariants worth understanding:
 *
 *  1. `initialConfig` is memoized with empty deps. Lexical reads it
 *     exactly once on mount; freezing it keeps storage echoes (which
 *     hand `AnnotationCard` a new `annotation` reference every ~500ms
 *     during typing) from re-running the LexicalComposer constructor
 *     and clobbering the editor mid-keystroke.
 *
 *  2. `OnChangePlugin`'s callback is stable across renders via the
 *     ref-latest pattern. If the callback identity changed, Lexical
 *     would re-register its listener on every parent render — that
 *     reset the in-flight beforeinput → keystroke pipeline and was the
 *     proximate cause of "I can't type into the notes."
 */
export default function NoteEditor({
  initialState, initialText, onChange, autoFocus, onFocus, onBlur,
}: Props) {
  const initialConfig = useMemo(() => ({
    namespace: 'annotator-note',
    theme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
    editorState: initialState || undefined,
    onError: (err: Error) => { console.warn('[note-editor]', err); },
    // initialState is intentionally NOT a dep — Lexical owns state after
    // mount and re-applying it would clobber in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleChange = useMemo(() => (state: EditorState, editor: LexicalEditor) => {
    const json = JSON.stringify(state.toJSON());
    let text = '';
    state.read(() => { text = editor.getRootElement()?.innerText ?? ''; });
    onChangeRef.current(json, text);
  }, []);

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorBootstrap
        seedText={initialState ? '' : initialText}
        autoFocus={autoFocus}
      />
      <div className="relative h-full" onFocus={onFocus} onBlur={onBlur}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="w-full h-full bg-transparent outline-none text-slate-800 text-sm leading-relaxed"
              style={{ minHeight: '100%' }}
            />
          }
          placeholder={<div className="absolute top-0 left-0 text-slate-800/50 text-sm pointer-events-none">Type a note…</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <OnChangePlugin onChange={handleChange} />
      </div>
    </LexicalComposer>
  );
}

/**
 * Mount-only bootstrap: seed plain text on a fresh editor and apply
 * autofocus. Re-running on prop changes would steal focus mid-typing or
 * clobber edits with stale seed text.
 *
 * `editor.focus(undefined, { defaultSelection: 'rootStart' })` is the
 * correct invocation — bare `editor.focus()` silently no-ops on a brand
 * new editor with no anchor selection.
 */
function EditorBootstrap({ seedText, autoFocus }: { seedText: string; autoFocus?: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (seedText) {
      editor.update(() => {
        const root = $getRoot();
        if (root.getTextContent() === '') {
          const p = $createParagraphNode();
          p.append($createTextNode(seedText));
          root.clear();
          root.append(p);
        }
      });
    }
    if (autoFocus) {
      requestAnimationFrame(() => editor.focus(undefined, { defaultSelection: 'rootStart' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
