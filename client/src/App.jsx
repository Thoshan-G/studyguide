import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import NotesPanel from './components/NotesPanel';
import Chatbot from './components/Chatbot';
import { createNotebook, getNotebooks, getNotebook, deleteNotebook } from './api';
import './App.css';

export default function App() {
  const [mode, setMode] = useState(null); // null = landing, 'chatbot', 'notebook'
  const [notebooks, setNotebooks] = useState([]);
  const [activeNotebook, setActiveNotebook] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [loading, setLoading] = useState(false);

  // Fetch notebooks on mount
  useEffect(() => {
    fetchNotebooks();
  }, []);

  const fetchNotebooks = async () => {
    try {
      const data = await getNotebooks();
      setNotebooks(data);
    } catch {
      // Server might not be running yet
    }
  };

  const handleCreateNotebook = async () => {
    setLoading(true);
    try {
      const nb = await createNotebook('Untitled Notebook');
      setNotebooks(prev => [...prev, nb]);
      setActiveNotebook(nb);
      setMode('notebook');
    } catch (err) {
      alert('Failed to create notebook: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNotebook = async (nb) => {
    setLoading(true);
    try {
      const full = await getNotebook(nb.id);
      setActiveNotebook(full);
      setMode('notebook');
    } catch (err) {
      alert('Failed to open notebook: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNotebook = async (e, id) => {
    e.stopPropagation();
    try {
      await deleteNotebook(id);
      setNotebooks(prev => prev.filter(n => n.id !== id));
      if (activeNotebook?.id === id) {
        setActiveNotebook(null);
        setMode(null);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const refreshNotebook = useCallback(async () => {
    if (!activeNotebook) return;
    try {
      const full = await getNotebook(activeNotebook.id);
      setActiveNotebook(full);
    } catch (err) {
      console.error(err);
    }
  }, [activeNotebook?.id]);

  const handleBackToHome = () => {
    setMode(null);
    setActiveNotebook(null);
    fetchNotebooks();
  };

  // ─── CHATBOT MODE ───────────────────────────────────────────
  if (mode === 'chatbot') {
    return <Chatbot onBack={handleBackToHome} />;
  }

  // ─── NOTEBOOK MODE ──────────────────────────────────────────
  if (mode === 'notebook' && activeNotebook) {
    return (
      <div className="app">
        <Sidebar
          notebook={activeNotebook}
          onBack={handleBackToHome}
          onSourcesChange={refreshNotebook}
        />
        <div className="main-content">
          <div className="main-header">
            <div className="tab-bar">
              <button
                className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                💬 Chat
              </button>
              <button
                className={`tab ${activeTab === 'notes' ? 'active' : ''}`}
                onClick={() => setActiveTab('notes')}
              >
                📝 Studio
              </button>
            </div>
          </div>

          {activeTab === 'chat' ? (
            <ChatPanel notebook={activeNotebook} />
          ) : (
            <NotesPanel notebook={activeNotebook} onNotesChange={refreshNotebook} />
          )}
        </div>
      </div>
    );
  }

  // ─── LANDING PAGE ───────────────────────────────────────────
  return (
    <div className="landing">
      <div className="landing-content">
        <div className="landing-icon">✦</div>
        <h1>AI Studio</h1>
        <p>Choose your AI experience — chat freely or research with your documents.</p>

        <div className="mode-cards">
          <div className="mode-card" onClick={() => setMode('chatbot')}>
            <div className="mode-card-glow chatbot-glow" />
            <div className="mode-card-icon">🤖</div>
            <h2>AI Chatbot</h2>
            <p>Ask anything — coding, science, math, creative writing, and more. No documents needed.</p>
            <div className="mode-card-tag">General Purpose</div>
          </div>

          <div className="mode-card" onClick={handleCreateNotebook} style={{ opacity: loading ? 0.6 : 1 }}>
            <div className="mode-card-glow notebook-glow" />
            <div className="mode-card-icon">📓</div>
            <h2>Studymate Notebook</h2>
            <p>Upload PDFs, docs, and notes — then chat with an AI that understands your sources.</p>
            <div className="mode-card-tag">Source-Based Research</div>
          </div>
        </div>

        {notebooks.length > 0 && (
          <div className="landing-notebooks">
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '0.25rem' }}>
              Recent Notebooks
            </div>
            {notebooks.map(nb => (
              <div
                key={nb.id}
                className="landing-notebook-card"
                onClick={() => handleOpenNotebook(nb)}
              >
                <div className="landing-notebook-icon">📓</div>
                <div className="landing-notebook-info">
                  <h3>{nb.name}</h3>
                  <span>{nb.sources?.length || 0} sources · {new Date(nb.createdAt).toLocaleDateString()}</span>
                </div>
                <button
                  className="landing-notebook-delete"
                  onClick={(e) => handleDeleteNotebook(e, nb.id)}
                  title="Delete notebook"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
