// Content Script — Alt+hover and text selection handling

import {
  showLoading,
  showTranslation,
  showStreamStart,
  appendStreamChunk,
  finishStream,
  showError,
  showNoKeyPrompt,
  isCardVisible,
} from './floating-card';
import { lookupWord } from '../shared/dictionary';
import type { TranslationResult } from '../shared/types';

// ─── State ────────────────────────────────────────────────────────────

interface HoverState {
  word: string;
  x: number;
  y: number;
}

let altPressed = false;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let lastHover: HoverState | null = null;
let lastWord: string = '';

const HOVER_DEBOUNCE_MS = 200;
const MIN_WORD_LENGTH = 1;
const MAX_WORD_LENGTH = 50;

// ─── Alt Key Tracking ────────────────────────────────────────────────

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Alt' && !altPressed) {
    altPressed = true;
  }
});

document.addEventListener('keyup', (e: KeyboardEvent) => {
  if (e.key === 'Alt') {
    altPressed = false;
    if (!isCardVisible()) {
      clearHoverTimer();
    }
  }
});

// If the page loses focus, reset Alt state
document.addEventListener('blur', () => {
  altPressed = false;
});

// ─── Hover Handling (Alt + hover) ─────────────────────────────────────

document.addEventListener('mouseover', (e: MouseEvent) => {
  if (!altPressed) return;
  handleHover(e);
});

// Keep tracking mouse position for the debounce timer
document.addEventListener('mousemove', () => {
  if (!altPressed) return;

  if (hoverTimer) {
    // Keep tracking — card stays stable during reading
  }
});

function handleHover(e: MouseEvent) {
  clearHoverTimer();

  const word = extractWordAtPoint(e.clientX, e.clientY);
  if (!word) return;

  // Don't re-translate if the same word is already showing
  if (word === lastWord && isCardVisible()) return;

  lastHover = { word, x: e.clientX, y: e.clientY };

  hoverTimer = setTimeout(() => {
    if (!altPressed || !lastHover) return;
    processWord(lastHover.word, lastHover.x, lastHover.y, getContextAtPoint(lastHover.x, lastHover.y));
  }, HOVER_DEBOUNCE_MS);
}

function clearHoverTimer() {
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

// ─── Selection Handling ──────────────────────────────────────────────

document.addEventListener('mouseup', (e: MouseEvent) => {
  // Don't trigger if the user was interacting with the card
  if (e.target instanceof Element && e.target.closest('#wordlens-card')) return;

  // Delay slightly to let the selection be made
  setTimeout(() => handleSelection(e), 10);
});

function handleSelection(e: MouseEvent) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  const text = selection.toString().trim();
  if (!text || text.length > 5000) return; // Reasonable limit

  // Don't re-trigger if Alt+hover card is already showing something
  if (isCardVisible() && text === lastWord) return;

  // Check if single word or sentence
  const isSingleWord = /^[a-zA-Z]+$/.test(text) && text.split(/\s+/).length === 1;

  if (isSingleWord) {
    // Treat as word translation with context
    const context = extractSentenceSurrounding(selection);
    processWord(text, e.clientX, e.clientY, context);
  } else {
    // Sentence translation
    processSentence(text, e.clientX, e.clientY);
  }
}

// ─── Word Extraction ──────────────────────────────────────────────────

function extractWordAtPoint(x: number, y: number): string | null {
  // Get the text node and offset at the cursor position
  const range = document.caretRangeFromPoint(x, y);
  if (!range) return null;

  const node = range.startContainer;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.textContent || '';
  const offset = range.startOffset;

  // Navigate to find the word boundaries
  const wordStart = findWordBoundary(text, offset, -1);
  const wordEnd = findWordBoundary(text, offset, 1);

  if (wordStart >= wordEnd) return null;

  const word = text.slice(wordStart, wordEnd);
  if (word.length < MIN_WORD_LENGTH || word.length > MAX_WORD_LENGTH) return null;
  if (!/^[a-zA-Z'-]+$/.test(word)) return null; // Only valid English words

  return word;
}

function findWordBoundary(text: string, start: number, direction: -1 | 1): number {
  let pos = start;
  const isWordChar = (ch: string) => /[a-zA-Z]/.test(ch);

  if (direction === -1) {
    // Walk backward from offset
    while (pos > 0) {
      const prev = text[pos - 1];
      if (isWordChar(prev) || prev === "'" || prev === '-') {
        pos--;
      } else {
        break;
      }
    }
  } else {
    // Walk forward from offset
    while (pos < text.length) {
      const ch = text[pos];
      if (isWordChar(ch) || ch === "'" || ch === '-') {
        pos++;
      } else {
        break;
      }
    }
  }

  return pos;
}

function getContextAtPoint(x: number, y: number): string | undefined {
  const range = document.caretRangeFromPoint(x, y);
  if (!range) return undefined;

  // Get the surrounding sentence from the parent element
  const parentEl = range.startContainer.parentElement;
  if (!parentEl) return undefined;

  const fullText = parentEl.textContent || '';
  return fullText.slice(0, 200).trim(); // Limit context length
}

function extractSentenceSurrounding(selection: Selection): string | undefined {
  const range = selection.getRangeAt(0);
  const parentEl = range.startContainer.parentElement;
  if (!parentEl) return undefined;

  return (parentEl.textContent || '').slice(0, 200).trim();
}

// ─── Processing ───────────────────────────────────────────────────────

async function processWord(
  word: string,
  x: number,
  y: number,
  context?: string,
): Promise<void> {
  lastWord = word;
  const lowerWord = word.toLowerCase();

  // Check local dictionary first for instant response
  const dictEntry = lookupWord(lowerWord);
  if (dictEntry) {
    showTranslation(
      {
        word: dictEntry.word,
        translation: dictEntry.translation,
        sourceSentence: context || '',
        partOfSpeech: dictEntry.partOfSpeech,
        phonetic: dictEntry.phonetic,
      },
      x,
      y,
    );
    return;
  }

  // Not in dictionary — request translation via background
  showLoading(x, y);

  try {
    const response = await sendMessage({
      type: 'TRANSLATE_WORD',
      text: word,
      context,
    });

    if (response.error) {
      if (response.code === 'NO_KEY') {
        showNoKeyPrompt(x, y);
      } else {
        showError(response.error, x, y);
      }
      return;
    }

    if (response.result) {
      showTranslation(response.result as TranslationResult, x, y);
    }
  } catch {
    showError('网络错误，请重试', x, y);
  }
}

async function processSentence(
  text: string,
  x: number,
  y: number,
): Promise<void> {
  lastWord = text;
  showStreamStart(x, y);

  try {
    // Use streaming for sentence translation
    const port = chrome.runtime.connect({ name: 'wordlens-translate' });
    let fullResult = '';
    let hasError = false;

    port.onMessage.addListener((msg: { type?: string; chunk?: string; result?: string; error?: string; code?: string }) => {
      if (msg.error) {
        hasError = true;
        if (msg.code === 'NO_KEY') {
          showNoKeyPrompt(x, y);
        } else {
          showError(msg.error, x, y);
        }
        return;
      }

      if (msg.type === 'chunk' && msg.chunk) {
        fullResult += msg.chunk;
        appendStreamChunk(msg.chunk);
      }

      if (msg.type === 'result') {
        // Translation complete — card already has text via chunks, just mark done
        if (fullResult) {
          finishStream();
        }
      }
    });

    port.onDisconnect.addListener(() => {
      // Only show error if we got nothing and no error was already shown
      if (!fullResult && !hasError) {
        showError('翻译连接断开', x, y);
      }
    });

    port.postMessage({ type: 'TRANSLATE_SENTENCE', text });

    // Fallback: non-streaming timeout
    setTimeout(async () => {
      if (!fullResult && !hasError) {
        try {
          const response = await sendMessage({
            type: 'TRANSLATE_SENTENCE',
            text,
          });
          if (response.result) {
            appendStreamChunk(response.result as string);
            finishStream();
          }
        } catch {
          // Already handled
        }
      }
    }, 8000);
  } catch (err) {
    showError('句子翻译失败', x, y);
  }
}

function sendMessage(
  message: { type: string; text: string; context?: string; url?: string },
): Promise<{ result?: unknown; error?: string; code?: string }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { ...message, url: window.location.href },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: '连接失败，请刷新页面重试' });
          return;
        }
        resolve(response || { error: '无响应' });
      },
    );
  });
}

// ─── Check API Key Status ─────────────────────────────────────────────

// On load, check if API key is configured
(async () => {
  try {
    await sendMessage({ type: 'CHECK_API_KEY', text: '' });
    // No action needed — the user will see the prompt when they first try to translate
  } catch {
    // Extension not ready yet
  }
})();

export { processWord, processSentence };
