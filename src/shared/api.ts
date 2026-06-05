// DeepSeek API client
// Uses OpenAI-compatible endpoint: https://api.deepseek.com/v1/chat/completions

import { getApiKey } from './storage';
import type { TranslationResult } from './types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

const TIMEOUT_MS = 15_000; // 15 seconds
const MAX_RETRIES = 2;

// ─── Error Types ──────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public code: 'NO_KEY' | 'TIMEOUT' | 'RATE_LIMIT' | 'API_ERROR' | 'PARSE_ERROR',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Internal Helpers ─────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function deepseekRequest(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { temperature?: number; maxTokens?: number; stream?: boolean } = {},
): Promise<Response> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new ApiError('请先在设置页面配置 DeepSeek API Key', 'NO_KEY');
  }

  const response = await fetchWithTimeout(
    DEEPSEEK_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 1024,
        stream: options.stream ?? false,
      }),
    },
    TIMEOUT_MS,
  );

  if (response.status === 429) {
    throw new ApiError('API 请求过于频繁，请稍后再试', 'RATE_LIMIT');
  }

  if (!response.ok) {
    throw new ApiError(
      `DeepSeek API 错误 (${response.status}): ${response.statusText}`,
      'API_ERROR',
    );
  }

  return response;
}

async function requestWithRetry(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await deepseekRequest(messages, options);
      const data = await response.json();

      if (!data.choices?.[0]?.message?.content) {
        throw new ApiError('API 返回格式异常', 'PARSE_ERROR');
      }

      return data.choices[0].message.content;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on auth errors or missing key
      if (error instanceof ApiError) {
        if (error.code === 'NO_KEY' || error.code === 'RATE_LIMIT') {
          throw error;
        }
      }

      // Wait before retry (exponential backoff)
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
      }
    }
  }

  throw lastError || new ApiError('请求失败，请重试', 'API_ERROR');
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Translate a single word, optionally with context sentence.
 * Returns a structured TranslationResult.
 */
export async function translateWord(
  word: string,
  context?: string,
): Promise<TranslationResult> {
  const systemPrompt =
    '你是一个英语学习助手。请翻译英文单词并提供详细解释。' +
    '返回严格 JSON 格式，不要包含任何额外文字：' +
    '{"word": "...", "translation": "...", "sourceSentence": "...", "partOfSpeech": "...", "phonetic": "..."}';

  const userPrompt = context
    ? `请翻译单词 "${word}" 在以下句子中的含义：\n"${context}"`
    : `请翻译英语单词 "${word}"，给出中文释义、音标和词性。`;

  const content = await requestWithRetry([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  try {
    // Try to extract JSON from the response (handles markdown-wrapped JSON)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    const result = JSON.parse(jsonStr) as TranslationResult;
    return {
      word: result.word || word,
      translation: result.translation || '',
      sourceSentence: result.sourceSentence || context || '',
      partOfSpeech: result.partOfSpeech,
      phonetic: result.phonetic,
    };
  } catch {
    throw new ApiError('无法解析翻译结果', 'PARSE_ERROR');
  }
}

/**
 * Translate a sentence or paragraph.
 * Returns the translated text.
 */
export async function translateSentence(text: string): Promise<string> {
  const systemPrompt =
    '你是一个翻译助手。将以下英文翻译为中文，保持原意，符合中文表达习惯。只返回翻译结果，不要添加任何解释。';

  const userPrompt = `请翻译以下英文：\n${text}`;

  return await requestWithRetry([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
}

/**
 * Translate a sentence with streaming output.
 * Calls onChunk with each partial translation as it arrives.
 */
export async function translateSentenceStream(
  text: string,
  onChunk: (chunk: string) => void,
  onError?: (error: Error) => void,
): Promise<string> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    const err = new ApiError('请先在设置页面配置 DeepSeek API Key', 'NO_KEY');
    onError?.(err);
    throw err;
  }

  const systemPrompt =
    '你是一个翻译助手。将以下英文翻译为中文，保持原意，符合中文表达习惯。只返回翻译结果，不要添加任何解释。';

  try {
    const response = await deepseekRequest(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请翻译以下英文：\n${text}` },
      ],
      { stream: true },
    );

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ApiError('无法读取响应流', 'API_ERROR');
    }

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    return fullText;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(err);
    throw err;
  }
}

/**
 * Verify that the configured API key is valid by making a minimal request.
 */
export async function verifyApiKey(): Promise<boolean> {
  try {
    await requestWithRetry([
      { role: 'user', content: 'Say "ok" if you can read this.' },
    ]);
    return true;
  } catch {
    return false;
  }
}
