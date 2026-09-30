import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Gemini with fallback models
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash'];

// Fast model fallback — try each model once, no delays
async function callWithRetry(messages) {
  // Convert OpenAI-style messages to Gemini format
  const systemMsg = messages.find(m => m.role === 'system');
  const userMsg = messages.find(m => m.role === 'user');

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemMsg?.content || undefined,
      });
      const result = await model.generateContent(userMsg?.content || '');
      return result.response.text();
    } catch (err) {
      const isRetryable = err.status === 503 || err.status === 429 ||
        err.message?.includes('503') || err.message?.includes('RESOURCE_EXHAUSTED');
      if (isRetryable) {
        console.log(`  🔄 ${modelName} unavailable, trying next...`);
        continue;
      }
      throw err;
    }
  }
  throw new Error('All AI models are currently unavailable. Please try again later.');
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// File upload config
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.md') || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Use PDF, TXT, MD, or DOCX.'));
    }
  }
});

// In-memory store for notebooks
const notebooks = new Map();

// Helper: extract text from uploaded file
async function extractText(filePath, mimetype, originalname) {
  const ext = path.extname(originalname).toLowerCase();

  if (mimetype === 'application/pdf' || ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }

  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  // Default: treat as plain text
  return fs.readFileSync(filePath, 'utf-8');
}

// ─── NOTEBOOK ROUTES ────────────────────────────────────────────

// Create a new notebook
app.post('/api/notebooks', (req, res) => {
  const id = uuidv4();
  const notebook = {
    id,
    name: req.body.name || 'Untitled Notebook',
    sources: [],
    notes: [],
    chatHistory: [],
    createdAt: new Date().toISOString()
  };
  notebooks.set(id, notebook);
  res.json(notebook);
});

// Get all notebooks
app.get('/api/notebooks', (req, res) => {
  res.json([...notebooks.values()]);
});

// Get a specific notebook
app.get('/api/notebooks/:id', (req, res) => {
  const notebook = notebooks.get(req.params.id);
  if (!notebook) return res.status(404).json({ error: 'Notebook not found' });
  res.json(notebook);
});

// Delete a notebook
app.delete('/api/notebooks/:id', (req, res) => {
  notebooks.delete(req.params.id);
  res.json({ success: true });
});

// ─── SOURCE ROUTES ──────────────────────────────────────────────

// Upload a source to a notebook
app.post('/api/notebooks/:id/sources', upload.single('file'), async (req, res) => {
  try {
    const notebook = notebooks.get(req.params.id);
    if (!notebook) return res.status(404).json({ error: 'Notebook not found' });

    let text = '';
    let sourceName = '';
    let sourceType = '';

    if (req.file) {
      // File upload
      text = await extractText(req.file.path, req.file.mimetype, req.file.originalname);
      sourceName = req.file.originalname;
      sourceType = path.extname(req.file.originalname).replace('.', '').toUpperCase();
    } else if (req.body.text) {
      // Pasted text
      text = req.body.text;
      sourceName = req.body.name || 'Pasted Text';
      sourceType = 'TEXT';
    } else if (req.body.url) {
      // URL (just store the URL, actual scraping would need additional libs)
      text = req.body.url;
      sourceName = req.body.name || req.body.url;
      sourceType = 'URL';
    } else {
      return res.status(400).json({ error: 'No source provided' });
    }

    const source = {
      id: uuidv4(),
      name: sourceName,
      type: sourceType,
      text: text,
      wordCount: text.split(/\s+/).length,
      addedAt: new Date().toISOString()
    };

    notebook.sources.push(source);
    res.json(source);
  } catch (error) {
    console.error('Source upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a source
app.delete('/api/notebooks/:notebookId/sources/:sourceId', (req, res) => {
  const notebook = notebooks.get(req.params.notebookId);
  if (!notebook) return res.status(404).json({ error: 'Notebook not found' });
  notebook.sources = notebook.sources.filter(s => s.id !== req.params.sourceId);
  res.json({ success: true });
});

// ─── GENERAL CHATBOT ────────────────────────────────────────────

// In-memory store for chatbot conversations
const chatSessions = new Map();

app.post('/api/chatbot', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    // Get or create session
    const sid = sessionId || uuidv4();
    if (!chatSessions.has(sid)) {
      chatSessions.set(sid, []);
    }
    const history = chatSessions.get(sid);

    // Build conversation context (last 20 messages)
    const recentHistory = history.slice(-20)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are a helpful, friendly, and knowledgeable AI assistant. You can answer questions on any topic including science, math, programming, history, creative writing, and more.

GUIDELINES:
- Be concise but thorough. Use markdown formatting for readability.
- If you're not sure about something, say so honestly.
- For code questions, provide working examples with explanations.
- Be conversational and engaging.

${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}` : ''}`;

    const response = await callWithRetry([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ]);

    // Store in history
    history.push(
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'assistant', content: response, timestamp: new Date().toISOString() }
    );

    res.json({ role: 'assistant', content: response, timestamp: new Date().toISOString(), sessionId: sid });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── NOTEBOOK CHAT ROUTES ───────────────────────────────────────

app.post('/api/notebooks/:id/chat', async (req, res) => {
  try {
    const notebook = notebooks.get(req.params.id);
    if (!notebook) return res.status(404).json({ error: 'Notebook not found' });

    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    // Build context from sources
    const sourceContext = notebook.sources
      .map((s, i) => `[Source ${i + 1}: "${s.name}"]\n${s.text}`)
      .join('\n\n---\n\n');

    // Build chat history context (last 10 messages)
    const recentHistory = notebook.chatHistory.slice(-10)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are an intelligent research assistant similar to NotebookLM. You have access to the following source documents uploaded by the user. Your job is to answer questions, provide insights, and help the user understand their sources.

IMPORTANT RULES:
- Only use information from the provided sources to answer questions.
- If the answer cannot be found in the sources, say so clearly.
- When referencing information, cite the source name.
- Be concise but thorough. Use markdown formatting.
- If the user asks for a summary or analysis, provide well-structured responses.

SOURCES:
${sourceContext || '(No sources uploaded yet. Tell the user to upload some documents first.)'}

RECENT CONVERSATION:
${recentHistory || '(No previous messages)'}`;

    const response = await callWithRetry([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ]);

    // Store in chat history
    notebook.chatHistory.push(
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'assistant', content: response, timestamp: new Date().toISOString() }
    );

    res.json({ role: 'assistant', content: response, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── NOTES ROUTES ───────────────────────────────────────────────

// Generate a note (summary, key topics, study guide, etc.)
app.post('/api/notebooks/:id/notes/generate', async (req, res) => {
  try {
    const notebook = notebooks.get(req.params.id);
    if (!notebook) return res.status(404).json({ error: 'Notebook not found' });

    const { type } = req.body; // 'summary', 'key_topics', 'study_guide', 'faq', 'timeline', 'briefing'

    if (notebook.sources.length === 0) {
      return res.status(400).json({ error: 'Add at least one source first' });
    }

    const sourceContext = notebook.sources
      .map((s, i) => `[Source ${i + 1}: "${s.name}"]\n${s.text}`)
      .join('\n\n---\n\n');

    const prompts = {
      summary: `Based on all the provided sources, create a comprehensive summary. Organize it with clear headings and bullet points. Highlight the most important findings, arguments, and conclusions from each source.`,
      key_topics: `Analyze all the provided sources and identify the key topics and themes. For each topic, provide a brief explanation and cite which sources discuss it. Organize them by importance.`,
      study_guide: `Create a detailed study guide based on the provided sources. Include:
- Key concepts and definitions
- Important facts and figures
- Potential discussion questions
- Connections between sources
Format it in a clear, study-friendly layout.`,
      faq: `Based on the provided sources, generate a comprehensive FAQ (Frequently Asked Questions) document. Include 8-12 questions that someone reading these sources might ask, along with detailed answers citing the relevant sources.`,
      timeline: `Extract and organize all chronological events, dates, and milestones mentioned in the provided sources into a clear timeline format. Include context for each event.`,
      briefing: `Create an executive briefing document based on the provided sources. Include:
- Executive Summary (2-3 sentences)
- Key Findings
- Implications & Recommendations
- Supporting Evidence from Sources
Keep it professional and concise.`
    };

    const prompt = prompts[type] || prompts.summary;

    const content = await callWithRetry([
      { role: 'system', content: `You are a research assistant. Analyze the following sources and respond to the request.\n\nSOURCES:\n${sourceContext}` },
      { role: 'user', content: prompt }
    ]);

    const note = {
      id: uuidv4(),
      type,
      title: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      content,
      createdAt: new Date().toISOString()
    };

    notebook.notes.push(note);
    res.json(note);
  } catch (error) {
    console.error('Note generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save a custom note
app.post('/api/notebooks/:id/notes', (req, res) => {
  const notebook = notebooks.get(req.params.id);
  if (!notebook) return res.status(404).json({ error: 'Notebook not found' });

  const note = {
    id: uuidv4(),
    type: 'custom',
    title: req.body.title || 'Untitled Note',
    content: req.body.content || '',
    createdAt: new Date().toISOString()
  };

  notebook.notes.push(note);
  res.json(note);
});

// Delete a note
app.delete('/api/notebooks/:notebookId/notes/:noteId', (req, res) => {
  const notebook = notebooks.get(req.params.notebookId);
  if (!notebook) return res.status(404).json({ error: 'Notebook not found' });
  notebook.notes = notebook.notes.filter(n => n.id !== req.params.noteId);
  res.json({ success: true });
});

// Update a note
app.put('/api/notebooks/:notebookId/notes/:noteId', (req, res) => {
  const notebook = notebooks.get(req.params.notebookId);
  if (!notebook) return res.status(404).json({ error: 'Notebook not found' });
  const note = notebook.notes.find(n => n.id === req.params.noteId);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (req.body.title) note.title = req.body.title;
  if (req.body.content) note.content = req.body.content;
  note.updatedAt = new Date().toISOString();
  res.json(note);
});

// ─── SERVE FRONTEND (Production) ────────────────────────────────

const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log('  📦 Serving static frontend from client/dist');
}

// ─── START SERVER ───────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  🚀 Studymate Server running at http://localhost:${PORT}\n`);
});
