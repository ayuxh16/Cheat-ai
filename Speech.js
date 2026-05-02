// ─── speech.js ───────────────────────────────────────────────
// Handles Web Speech API: continuous listening, silence detection,
// and firing a callback when a complete question is detected.

const Speech = (() => {

  // ── Config ─────────────────────────────────────────────────
  const SILENCE_THRESHOLD_MS = 1800; // ms of silence before triggering AI
  const MIN_QUESTION_LENGTH  = 8;    // ignore fragments shorter than this

  // ── State ──────────────────────────────────────────────────
  let recognition       = null;
  let isListening       = false;
  let finalTranscript   = '';
  let interimTranscript = '';
  let silenceTimer      = null;

  // ── Callbacks (set by app.js) ──────────────────────────────
  let onTranscriptUpdate = () => {}; // (final, interim) => void
  let onQuestionDetected = () => {}; // (questionText)   => void
  let onStatusChange     = () => {}; // (status, cssClass) => void

  // ── Check browser support ──────────────────────────────────
  function isSupported() {
    return ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }

  // ── Start listening ────────────────────────────────────────
  function start() {
    if (!isSupported()) {
      onStatusChange('Not supported', 'error');
      alert('Speech Recognition only works in Chrome or Edge. Please switch browsers.');
      return;
    }

    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();

    recognition.continuous      = true;  // keep listening even after pauses
    recognition.interimResults  = true;  // get live partial results
    recognition.lang            = 'en-US';
    recognition.maxAlternatives = 1;

    // ── Event: recognition started ───────────────────────────
    recognition.onstart = () => {
      isListening = true;
      onStatusChange('Listening...', 'listening');
    };

    // ── Event: got speech results ─────────────────────────────
    recognition.onresult = (event) => {
      interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript = transcript;
        }
      }

      // Update UI transcript display
      onTranscriptUpdate(finalTranscript, interimTranscript);

      // Reset silence timer on every new word
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        const fullQuestion = (finalTranscript + interimTranscript).trim();
        if (fullQuestion.length >= MIN_QUESTION_LENGTH) {
          onQuestionDetected(fullQuestion);
          // Reset for next question
          finalTranscript   = '';
          interimTranscript = '';
          onTranscriptUpdate('', '');
        }
      }, SILENCE_THRESHOLD_MS);
    };

    // ── Event: speech ended — auto-restart for continuous mode ─
    recognition.onend = () => {
      if (isListening) {
        // Chrome stops after long silence — restart automatically
        try { recognition.start(); } catch (_) {}
      }
    };

    // ── Event: error handling ─────────────────────────────────
    recognition.onerror = (event) => {
      if (event.error === 'no-speech') return; // normal silence
      if (event.error === 'aborted')   return; // manual stop
      console.error('[Speech] Error:', event.error);
      onStatusChange('Error: ' + event.error, 'error');
    };

    recognition.start();
  }

  // ── Stop listening ─────────────────────────────────────────
  function stop() {
    isListening = false;
    clearTimeout(silenceTimer);
    finalTranscript   = '';
    interimTranscript = '';

    if (recognition) {
      recognition.onend = null; // prevent auto-restart
      recognition.stop();
      recognition = null;
    }

    onStatusChange('Idle', '');
    onTranscriptUpdate('', '');
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    isSupported,
    start,
    stop,
    isListening: () => isListening,

    onTranscriptUpdate: (fn) => { onTranscriptUpdate = fn; },
    onQuestionDetected: (fn) => { onQuestionDetected = fn; },
    onStatusChange:     (fn) => { onStatusChange     = fn; },
  };

})();