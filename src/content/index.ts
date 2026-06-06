// Content Script — Text selection translation

import {
  showLoading,
  showTranslation,
  showStreamStart,
  appendStreamChunk,
  finishStream,
  showError,
  showNoKeyPrompt,
} from './floating-card';
import { lookupWord } from '../shared/dictionary';
import type { TranslationResult } from '../shared/types';

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
  if (!text || text.length > 5000) return;

  // Check if single word or sentence
  const isSingleWord = /^[a-zA-Z]+$/.test(text) && text.split(/\s+/).length === 1;

  if (isSingleWord) {
    const context = extractSentenceSurrounding(selection);
    processWord(text, e.clientX, e.clientY, context);
  } else {
    processSentence(text, e.clientX, e.clientY);
  }
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
  showStreamStart(x, y);

  try {
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
        if (fullResult) {
          finishStream();
        }
      }
    });

    port.onDisconnect.addListener(() => {
      if (!fullResult && !hasError) {
        showError('翻译连接断开', x, y);
      }
    });

    port.postMessage({ type: 'TRANSLATE_SENTENCE', text });

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
  } catch {
    showError('句子翻译失败', x, y);
  }
}

// ─── Message Passing ──────────────────────────────────────────────────

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

(async () => {
  try {
    await sendMessage({ type: 'CHECK_API_KEY', text: '' });
  } catch {
    // Extension not ready yet
  }
})();

export { processWord, processSentence };
