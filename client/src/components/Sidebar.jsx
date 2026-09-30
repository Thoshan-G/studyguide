import { useState, useRef, useCallback } from 'react';
import { uploadSource, addTextSource, deleteSource } from '../api';

export default function Sidebar({ notebook, onBack, onSourcesChange }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const fileInputRef = useRef(null);

  const handleFiles = useCallback(async (files) => {
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        await uploadSource(notebook.id, file);
      }
      onSourcesChange();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  }, [notebook.id, onSourcesChange]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const handleDeleteSource = useCallback(async (sourceId) => {
    try {
      await deleteSource(notebook.id, sourceId);
      onSourcesChange();
    } catch (err) {
      alert(err.message);
    }
  }, [notebook.id, onSourcesChange]);

  const getSourceIcon = (type) => {
    const t = type.toLowerCase();
    if (t === 'pdf') return { icon: '📄', cls: 'pdf' };
    if (t === 'docx' || t === 'doc') return { icon: '📝', cls: 'docx' };
    if (t === 'md') return { icon: '📋', cls: 'md' };
    if (t === 'txt') return { icon: '📃', cls: 'txt' };
    if (t === 'url') return { icon: '🔗', cls: 'url' };
    return { icon: '📎', cls: 'text' };
  };

  const formatWords = (count) => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k words`;
    return `${count} words`;
  };

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="sidebar-back-btn" onClick={onBack}>
            ← Back
          </button>
          <span className="sidebar-title">{notebook.name}</span>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">
            Sources ({notebook.sources?.length || 0})
          </div>
        </div>

        <div className="source-list">
          {notebook.sources?.map((source) => {
            const { icon, cls } = getSourceIcon(source.type);
            return (
              <div key={source.id} className="source-card">
                <div className={`source-icon ${cls}`}>{icon}</div>
                <div className="source-info">
                  <div className="source-name" title={source.name}>{source.name}</div>
                  <div className="source-meta">
                    {source.type} · {formatWords(source.wordCount)}
                  </div>
                </div>
                <button
                  className="source-delete"
                  onClick={() => handleDeleteSource(source.id)}
                  title="Remove source"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <div
          className={`upload-area ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.docx"
            multiple
            onChange={(e) => handleFiles(Array.from(e.target.files))}
          />
          <div className="upload-icon">{uploading ? <span className="spinner" /> : '📤'}</div>
          <div className="upload-text">
            {uploading ? 'Uploading...' : 'Drop files or click to upload'}
          </div>
          <div className="upload-hint">PDF, TXT, MD, DOCX — up to 20MB</div>
        </div>

        <button className="paste-text-btn" onClick={() => setShowPasteModal(true)}>
          ✏️ Paste text as source
        </button>
      </aside>

      {showPasteModal && (
        <PasteModal
          notebookId={notebook.id}
          onClose={() => setShowPasteModal(false)}
          onDone={onSourcesChange}
        />
      )}
    </>
  );
}

function PasteModal({ notebookId, onClose, onDone }) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await addTextSource(notebookId, name || 'Pasted Text', text);
      onDone();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>📋 Paste Text as Source</h2>
        <input
          className="modal-input"
          type="text"
          placeholder="Source name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="modal-textarea"
          placeholder="Paste your text content here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn primary"
            onClick={handleSave}
            disabled={!text.trim() || saving}
          >
            {saving ? 'Adding...' : 'Add Source'}
          </button>
        </div>
      </div>
    </div>
  );
}
