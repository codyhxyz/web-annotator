import { useEffect } from 'react';
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
  text: {
    bold: 'note-bold',
    italic: 'note-italic',
    underline: 'note-underline',
  },
  list: {
    nested: { listitem: 'note-nested-li' },
    ul: 'note-ul',
    ol: 'note-ol',
    listitem: 'note-li',
  },
};

export default function NoteEditor({
  initialState, initialText, onChange, autoFocus, onFocus, onBlur,
}: Props) {
  const config = {
    namespace: 'annotator-note',
    theme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
    editorState: initialState || undefined,
    onError: (err: Error) => { console.warn('[note-editor]', err); },
  };

  return (
    <LexicalComposer initialConfig={config}>
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
        <OnChangePlugin onChange={(state: EditorState, editor: LexicalEditor) => {
          const json = JSON.stringify(state.toJSON());
          let text = '';
          state.read(() => { text = editor.getRootElement()?.innerText ?? ''; });
          onChange(json, text);
        }} />
      </div>
    </LexicalComposer>
  );
}

/**
 * Mount-time bootstrap: grab the editor instance via context (available
 * synchronously on first render — unlike the OnChangePlugin ref pattern,
 * which only fires after a state change) and apply autofocus + plain-text
 * seed exactly once.
 */
function EditorBootstrap({
  seedText, autoFocus,
}: {
  seedText: string;
  autoFocus?: boolean;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (seedText) {
      editor.update(() => {
        const root = $getRoot();
        if (root.getTextContent() === '') {
          const paragraph = $createParagraphNode();
          paragraph.append($createTextNode(seedText));
          root.clear();
          root.append(paragraph);
        }
      });
    }
    if (autoFocus) {
      // Defer focus until after the contentEditable is in the DOM.
      requestAnimationFrame(() => editor.focus());
    }
    // Intentionally mount-only: re-running on prop changes would steal
    // focus mid-typing or clobber edits with stale seed text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
