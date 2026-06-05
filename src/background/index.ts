// Service Worker — handles translation requests from content script

import { translateWord, translateSentence, translateSentenceStream, ApiError } from '../shared/api';
import { addWord, hasApiKey } from '../shared/storage';
import type { TranslationResult } from '../shared/types';

// ─── In-memory cache ──────────────────────────────────────────────────
// Avoids redundant API calls for recently translated words

interface CacheEntry {
  result: TranslationResult;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCached(key: string): TranslationResult | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.result;
}

function setCache(key: string, result: TranslationResult): void {
  cache.set(key, { result, timestamp: Date.now() });
}

// ─── One-shot Message Handler ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((
  message: { type: string; text: string; context?: string; url?: string },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => {
  const handler = async () => {
    try {
      switch (message.type) {
        case 'TRANSLATE_WORD':
          return await handleTranslateWord(message.text, message.context, message.url);
        case 'TRANSLATE_SENTENCE':
          return await handleTranslateSentence(message.text);
        case 'CHECK_API_KEY':
          return { hasKey: await hasApiKey() };
        default:
          return { error: `Unknown message type: ${message.type}` };
      }
    } catch (error) {
      if (error instanceof ApiError) {
        return { error: error.message, code: error.code };
      }
      return { error: '翻译失败，请重试' };
    }
  };

  handler().then(sendResponse);
  return true; // Keep channel open for async response
});

// ─── Streaming (Port-based) Handler ───────────────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'wordlens-translate') return;

  port.onMessage.addListener(async (message: { type: string; text: string; context?: string }) => {
    if (message.type !== 'TRANSLATE_SENTENCE') {
      port.postMessage({ error: 'Unknown stream type' });
      return;
    }

    try {
      // First send a start signal
      port.postMessage({ type: 'start' });

      // Use streaming API
      await translateSentenceStream(
        message.text,
        (chunk: string) => {
          try {
            port.postMessage({ type: 'chunk', chunk });
          } catch {
            // Port disconnected — stop streaming
          }
        },
        (error: Error) => {
          try {
            port.postMessage({ error: error.message });
          } catch {
            // Port disconnected
          }
        },
      );

      // Signal completion
      try {
        port.postMessage({ type: 'result' });
      } catch {
        // Port disconnected
      }
    } catch (error) {
      try {
        const msg = error instanceof ApiError ? error.message : '翻译失败';
        const code = error instanceof ApiError ? error.code : undefined;
        port.postMessage({ error: msg, code });
      } catch {
        // Port disconnected
      }
    }
  });
});

// ─── Translation Handlers ─────────────────────────────────────────────

async function handleTranslateWord(
  word: string,
  context?: string,
  url?: string,
): Promise<{ result?: TranslationResult; error?: string; code?: string }> {
  const cacheKey = `${word.toLowerCase()}|${context || ''}`;
  const cached = getCached(cacheKey);
  if (cached) return { result: cached };

  const result = await translateWord(word, context);

  // Auto-save to word library (non-critical)
  try {
    await addWord(word, result.translation, context || result.sourceSentence, url || '');
  } catch {
    // Ignore save failures
  }

  setCache(cacheKey, result);
  return { result };
}

async function handleTranslateSentence(
  text: string,
): Promise<{ result?: string; error?: string; code?: string }> {
  // Caching for non-streaming sentence requests
  const cacheKey = `sentence:${text.trim().toLowerCase().slice(0, 100)}`;
  const cached = getCached(cacheKey);
  if (cached) return { result: cached.translation };

  const translation = await translateSentence(text);
  setCache(cacheKey, { word: '', translation, sourceSentence: text });

  return { result: translation };
}

// ─── Storage Change Listener ──────────────────────────────────────────

chrome.storage.onChanged.addListener((changes) => {
  if (changes.wordlens_api_key) {
    console.log('[WordLens] API key updated');
  }
});
