import { memo, useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching } from '@codemirror/language';
import { basicSetup } from 'codemirror';

interface FlowchartEditorProps {
  value: string;
  theme: 'light' | 'dark';
  onChange: (code: string) => void;
}

function createEditorTheme(theme: 'light' | 'dark') {
  const isDark = theme === 'dark';

  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: 'hsl(var(--card))',
        color: 'hsl(var(--foreground))',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        lineHeight: '1.6',
      },
      '.cm-content': {
        padding: '16px 0',
        minHeight: '100%',
      },
      '.cm-line': {
        padding: '0 16px',
      },
      '.cm-gutters': {
        backgroundColor: isDark ? 'hsl(var(--card))' : 'hsl(var(--background))',
        borderRight: '1px solid hsl(var(--border))',
        color: 'hsl(var(--muted-foreground))',
      },
      '.cm-activeLine': {
        backgroundColor: 'hsl(var(--accent) / 0.45)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'hsl(var(--accent) / 0.7)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'hsl(var(--primary))',
      },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'hsl(var(--primary) / 0.18)',
      },
      '&.cm-focused': {
        outline: 'none',
      },
    },
    { dark: isDark }
  );
}

export const FlowchartEditor = memo(function FlowchartEditor({
  value,
  theme,
  onChange,
}: FlowchartEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);
  const initialThemeRef = useRef(theme);

  onChangeRef.current = onChange;

  // Initialize CodeMirror once; value and theme sync through separate effects below.
  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const startState = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        basicSetup,
        bracketMatching(),
        markdown(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': 'Trình chỉnh sửa mã Mermaid',
          spellcheck: 'false',
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        themeCompartmentRef.current.of(createEditorTheme(initialThemeRef.current)),
      ],
    });

    const editorView = new EditorView({
      state: startState,
      parent: containerRef.current,
    });

    editorViewRef.current = editorView;

    return () => {
      editorView.destroy();
      editorViewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editorView = editorViewRef.current;
    if (!editorView) {
      return;
    }

    editorView.dispatch({
      effects: themeCompartmentRef.current.reconfigure(createEditorTheme(theme)),
    });
  }, [theme]);

  useEffect(() => {
    const editorView = editorViewRef.current;
    if (!editorView) {
      return;
    }

    const currentValue = editorView.state.doc.toString();
    if (value === currentValue) {
      return;
    }

    editorView.dispatch({
      changes: { from: 0, to: currentValue.length, insert: value },
    });
  }, [value]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">Mã Mermaid</h3>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" aria-label="Trình chỉnh sửa mã Mermaid" />
    </div>
  );
});
