import { useState, useCallback } from 'react';
import { generateNote, deleteNote } from '../api';

// Simple markdown renderer (same as ChatPanel)
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
  html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');
  return `<p>${html}</p>`;
}

const NOTE_TYPES = [
  { type: 'summary', label: 'Summary', icon: '📝' },
  { type: 'key_topics', label: 'Key Topics', icon: '🔑' },
  { type: 'study_guide', label: 'Study Guide', icon: '📚' },
  { type: 'faq', label: 'FAQ', icon: '❓' },
  { type: 'timeline', label: 'Timeline', icon: '📅' },
  { type: 'briefing', label: 'Briefing Doc', icon: '📊' },
];

export default function NotesPanel({ notebook, onNotesChange }) {
  const [generating, setGenerating] = useState(null);
  const [expandedNotes, setExpandedNotes] = useState(new Set());

  const handleGenerate = useCallback(async (type) => {
    if (generating) return;
    setGenerating(type);
    try {
      await generateNote(notebook.id, type);
      onNotesChange();
    } catch (err) {
      alert(err.message);
    } finally {
      setGenerating(null);
    }
  }, [notebook.id, generating, onNotesChange]);

  const handleDelete = useCallback(async (noteId) => {
    try {
      await deleteNote(notebook.id, noteId);
      onNotesChange();
    } catch (err) {
      alert(err.message);
    }
  }, [notebook.id, onNotesChange]);

  const toggleExpand = (noteId) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const hasSources = notebook?.sources?.length > 0;

  return (
    <div className="notes-panel">
      <div className="notes-toolbar">
        {NOTE_TYPES.map(({ type, label, icon }) => (
          <button
            key={type}
            className="note-generate-btn"
            onClick={() => handleGenerate(type)}
            disabled={!hasSources || generating !== null}
            title={!hasSources ? 'Add sources first' : `Generate ${label}`}
          >
            <span className="btn-icon">{generating === type ? <span className="spinner" /> : icon}</span>
            {label}
          </button>
        ))}
      </div>

      {(!notebook?.notes || notebook.notes.length === 0) ? (
        <div className="notes-empty">
          <div className="notes-empty-icon">📓</div>
          <h3>No notes yet</h3>
          <p>
            {hasSources
              ? 'Click any button above to generate AI-powered notes from your sources.'
              : 'Upload some sources first, then generate notes from them.'}
          </p>
        </div>
      ) : (
        <div className="notes-list">
          {[...notebook.notes].reverse().map((note) => {
            const isExpanded = expandedNotes.has(note.id);
            return (
              <div key={note.id} className="note-card">
                <div className="note-card-header">
                  <div className="note-card-title">
                    <span className="note-type-badge">{note.type}</span>
                    <h4>{note.title}</h4>
                  </div>
                  <div className="note-card-actions">
                    <button
                      className="note-action-btn"
                      onClick={() => copyToClipboard(note.content)}
                      title="Copy to clipboard"
                    >
                      📋
                    </button>
                    <button
                      className="note-action-btn delete"
                      onClick={() => handleDelete(note.id)}
                      title="Delete note"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <div
                  className={`note-card-content ${isExpanded ? 'expanded' : ''}`}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(note.content) }}
                />
                <button
                  className="note-expand-btn"
                  onClick={() => toggleExpand(note.id)}
                >
                  {isExpanded ? '▲ Show less' : '▼ Show more'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
