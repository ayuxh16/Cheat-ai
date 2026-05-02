// ─── app.js ───────────────────────────────────────────────────
// Main controller. Wires Speech + AI + DOM together.

// ─── DOM refs ──────────────────────────────────────────────────
const startBtn      = document.getElementById('startBtn');
const btnText       = document.getElementById('btnText');
const statusBadge   = document.getElementById('statusBadge');
const transcriptBox = document.getElementById('transcriptBox');
const answerArea    = document.getElementById('answerArea');
const apiKeyInput   = document.getElementById('apiKey');

// ─── Load saved Groq API key ───────────────────────────────────
(function loadSavedKey() {
  const saved = localStorage.getItem('groq_api_key');
  if (saved) apiKeyInput.value = saved;
})();

apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('groq_api_key', apiKeyInput.value.trim());
});

// ─── Wire Speech callbacks ─────────────────────────────────────

// 1. Update the live transcript display
Speech.onTranscriptUpdate((final, interim) => {
  if (!final && !interim) {
    transcriptBox.textContent = 'Speak next question...';
    return;
  }
  transcriptBox.innerHTML =
    `<span class="final">${final}</span>` +
    `<span class="interim">${interim}</span>`;
});

// 2. Update the status badge
Speech.onStatusChange((text, cssClass) => {
  statusBadge.textContent = text;
  statusBadge.className   = 'status-badge' + (cssClass ? ' ' + cssClass : '');
});

// 3. When a question is detected → send to Groq AI
Speech.onQuestionDetected(async (question) => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus('No API key', 'error');
    return;
  }
  await handleQuestion(question, apiKey);
});

// ─── Toggle listening ──────────────────────────────────────────
function toggleListening() {
  if (Speech.isListening()) {
    stopListening();
  } else {
    startListening();
  }
}

function startListening() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    alert('Please enter your Groq API key first.\n\nGet one free at: console.groq.com');
    return;
  }

  transcriptBox.classList.add('active');
  transcriptBox.textContent = 'Speak now...';
  startBtn.classList.add('active');
  btnText.textContent = 'Stop Listening';

  Speech.start();
}

function stopListening() {
  startBtn.classList.remove('active');
  btnText.textContent = 'Start Listening';
  transcriptBox.classList.remove('active');
  transcriptBox.textContent = 'Detected speech will appear here...';
  Speech.stop();
}

// ─── Clear all answers ─────────────────────────────────────────
function clearAnswers() {
  answerArea.innerHTML = `
    <div class="empty-state">
      <div class="icon">🎤</div>
      <p>Start listening, then ask a question aloud</p>
      <small>AI answers stream here in real time</small>
    </div>`;
}

// ─── Core: handle a detected question ─────────────────────────
async function handleQuestion(question, apiKey) {

  // Remove empty state if present
  const empty = answerArea.querySelector('.empty-state');
  if (empty) empty.remove();

  // Show "thinking" indicator at the top
  const thinkId = 'think-' + Date.now();
  const thinkEl = createThinkingCard(thinkId);
  answerArea.insertBefore(thinkEl, answerArea.firstChild);
  setStatus('Thinking...', 'thinking');

  // Pre-build the answer card
  const card = createAnswerCard(question);

  try {
    let fullText     = '';
    let cardInserted = false;

    // Stream tokens from Groq
    for await (const chunk of AI.streamAnswer(apiKey, question)) {
      fullText += chunk;

      // On first token: remove thinking card, insert answer card
      if (!cardInserted) {
        document.getElementById(thinkId)?.remove();
        answerArea.insertBefore(card, answerArea.firstChild);
        cardInserted = true;
      }

      // Progressively render bullets while streaming
      renderBullets(card, fullText, /* streaming= */ true);
    }

    // Final render — remove blinking cursor
    renderBullets(card, fullText, /* streaming= */ false);
    addTimestamp(card);
    setStatus('Listening...', 'listening');

  } catch (err) {
    console.error('[App] AI error:', err);
    document.getElementById(thinkId)?.remove();

    card.innerHTML += `
      <div style="color:#f87171;font-size:13px;margin-top:10px">
        ⚠ Error: ${escapeHtml(err.message)}
      </div>`;
    answerArea.insertBefore(card, answerArea.firstChild);
    setStatus('Error', 'error');
  }
}

// ─── DOM helpers ───────────────────────────────────────────────

function setStatus(text, cssClass) {
  statusBadge.textContent = text;
  statusBadge.className   = 'status-badge' + (cssClass ? ' ' + cssClass : '');
}

function createThinkingCard(id) {
  const el = document.createElement('div');
  el.id        = id;
  el.className = 'thinking-card';
  el.innerHTML = `
    <span>Thinking</span>
    <span class="thinking-dots">
      <span></span><span></span><span></span>
    </span>`;
  return el;
}

function createAnswerCard(question) {
  const card = document.createElement('div');
  card.className = 'answer-card';
  card.innerHTML = `
    <div class="q-label">Question</div>
    <div class="question">${escapeHtml(question)}</div>
    <ul class="bullets">
      <li><span class="streaming-cursor"></span></li>
    </ul>`;
  return card;
}

// Render bullets progressively during streaming
function renderBullets(card, rawText, streaming) {
  const bulletsEl = card.querySelector('.bullets');
  const bullets   = AI.parseBullets(rawText);

  if (bullets.length === 0) {
    // Nothing parsed yet — show raw partial text
    bulletsEl.innerHTML = `<li>
      <span style="color:#9ca3af;font-size:13px">
        ${escapeHtml(rawText)}
        ${streaming ? '<span class="streaming-cursor"></span>' : ''}
      </span>
    </li>`;
    return;
  }

  bulletsEl.innerHTML = bullets.map((text, i) => {
    const isLast = i === bullets.length - 1;
    const cursor = (streaming && isLast)
      ? '<span class="streaming-cursor"></span>'
      : '';
    return `<li>${escapeHtml(text)}${cursor}</li>`;
  }).join('');
}

function addTimestamp(card) {
  const ts = document.createElement('div');
  ts.className   = 'timestamp';
  ts.textContent = new Date().toLocaleTimeString();
  card.appendChild(ts);
}

// Prevent XSS from speech input going into innerHTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}