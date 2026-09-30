const API_BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// Notebooks
export const createNotebook = (name) => request('/notebooks', {
  method: 'POST',
  body: JSON.stringify({ name }),
});

export const getNotebooks = () => request('/notebooks');

export const getNotebook = (id) => request(`/notebooks/${id}`);

export const deleteNotebook = (id) => request(`/notebooks/${id}`, { method: 'DELETE' });

// Sources
export const uploadSource = async (notebookId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/notebooks/${notebookId}/sources`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
};

export const addTextSource = (notebookId, name, text) => request(`/notebooks/${notebookId}/sources`, {
  method: 'POST',
  body: JSON.stringify({ name, text }),
});

export const deleteSource = (notebookId, sourceId) =>
  request(`/notebooks/${notebookId}/sources/${sourceId}`, { method: 'DELETE' });

// Chat
export const sendMessage = (notebookId, message) => request(`/notebooks/${notebookId}/chat`, {
  method: 'POST',
  body: JSON.stringify({ message }),
});

// General Chatbot
export const sendChatbotMessage = (message, sessionId) => request('/chatbot', {
  method: 'POST',
  body: JSON.stringify({ message, sessionId }),
});

// Notes
export const generateNote = (notebookId, type) => request(`/notebooks/${notebookId}/notes/generate`, {
  method: 'POST',
  body: JSON.stringify({ type }),
});

export const saveNote = (notebookId, title, content) => request(`/notebooks/${notebookId}/notes`, {
  method: 'POST',
  body: JSON.stringify({ title, content }),
});

export const deleteNote = (notebookId, noteId) =>
  request(`/notebooks/${notebookId}/notes/${noteId}`, { method: 'DELETE' });

export const updateNote = (notebookId, noteId, data) => request(`/notebooks/${notebookId}/notes/${noteId}`, {
  method: 'PUT',
  body: JSON.stringify(data),
});
