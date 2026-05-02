// ─── ai.js ────────────────────────────────────────────────────
// Handles all communication with the Groq API.
// Uses streaming (SSE) so the first bullet appears in ~100ms.
// Groq uses the OpenAI-compatible API format.

const AI = (() => {

  // ── Model & limits ─────────────────────────────────────────
  // llama-3.3-70b-versatile = best quality on Groq
  // alternatives: 'llama3-8b-8192' (faster), 'mixtral-8x7b-32768'
  const MODEL      = 'llama-3.3-70b-versatile';
  const MAX_TOKENS = 400;
  const API_URL    = 'https://api.groq.com/openai/v1/chat/completions';

  // ── System prompt ──────────────────────────────────────────
  const SYSTEM_PROMPT = `You are an expert technical interview coach.
When given an interview question, respond ONLY with 3-5 bullet points.

Rules:
- Start each bullet with "- " (dash space)
- Each bullet is 1-2 sentences max — sharp and impressive
- No introduction, no summary, no explanation outside the bullets
- Use technical terms confidently
- Never write more than 5 bullets
- Never write ANY text outside the bullet list`;

  // ── Stream a response from Groq ────────────────────────────
  // Async generator — yields text delta chunks as they arrive.
  async function* streamAnswer(apiKey, question) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        stream:     true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: question       },
        ],
      }),
    });

    // Handle API errors (wrong key, rate limit, etc.)
    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errData = await response.json();
        errorMsg = errData?.error?.message || errorMsg;
      } catch (_) {}
      throw new Error(errorMsg);
    }

    // ── Parse SSE stream (OpenAI format) ─────────────────────
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      const events = buffer.split('\n\n');
      buffer = events.pop(); // keep the incomplete last chunk

      for (const event of events) {
        const dataLine = event
          .split('\n')
          .find(l => l.startsWith('data: '));

        if (!dataLine) continue;

        const data = dataLine.slice(6).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          // Groq / OpenAI format: choices[0].delta.content
          const text = parsed?.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch (_) {
          // Malformed chunk — skip silently
        }
      }
    }
  }

  // ── Parse bullet lines from raw streamed text ──────────────
  // Called on every chunk during streaming to progressively render bullets.
  function parseBullets(text) {
    return text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('-'))
      .map(l => l.replace(/^-+\s*/, '').trim())
      .filter(Boolean);
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    streamAnswer,
    parseBullets,
  };

})();