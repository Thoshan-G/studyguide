import { useState, useRef, useEffect, useCallback } from 'react';
import { sendChatbotMessage } from '../api';

// Simple markdown-to-HTML (basic bold, italic, code, lists, headings)
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

export default function Chatbot({ onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || sending) return;

    const userMsg = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const response = await sendChatbotMessage(msg, sessionId);
      setMessages(prev => [...prev, response]);
      if (response.sessionId) setSessionId(response.sessionId);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Error: ${err.message}`,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, sessionId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setSessionId(null);
    inputRef.current?.focus();
  };

  const suggestions = [
    '💡 Explain quantum computing simply',
    '🐍 Write a Python sorting algorithm',
    '📚 Summarize the theory of relativity',
    '🌍 What are the causes of climate change?',
    '🎨 Give me creative writing tips',
    '🧮 Solve: What is the integral of x²?',
  ];

  const handleSuggestion = (text) => {
    // Remove emoji prefix
    const cleanText = text.replace(/^[^\s]+ /, '');
    setInput(cleanText);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="chatbot-page">
      <div className="chatbot-header">
        <button className="chatbot-back-btn" onClick={onBack} title="Back to home">
          ← Back
        </button>
        <div className="chatbot-title">
          <span className="chatbot-title-icon">🤖</span>
          <h2>AI Chatbot</h2>
          <span className="chatbot-badge">Studymate AI</span>
        </div>
        <button className="chatbot-new-btn" onClick={handleNewChat} title="New chat">
          ✦ New Chat
        </button>
      </div>

      <div className="chatbot-body">
        {messages.length === 0 ? (
          <div className="chatbot-welcome">
            <div className="chatbot-welcome-icon">🤖</div>
            <h2>Hi! I'm your AI assistant</h2>
            <p>I can answer questions on any topic — coding, science, math, writing, and more. Ask me anything!</p>
            <div className="chatbot-suggestions">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="chatbot-suggestion"
                  onClick={() => handleSuggestion(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div
                  className="message-content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              </div>
            ))}
            {sending && (
              <div className="message assistant">
                <div className="message-avatar">🤖</div>
                <div className="message-content">
                  <div className="typing-indicator">
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder="Ask me anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || sending}
          >
            {sending ? <span className="spinner" /> : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
