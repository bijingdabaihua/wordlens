// Floating translation card — displayed near the cursor on hover/selection

import type { TranslationResult } from '../shared/types';

const CARD_ID = 'wordlens-card';
const CARD_CLASS = 'wordlens-floating-card';

interface CardState {
  showing: boolean;
  loading: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

const state: CardState = {
  showing: false,
  loading: false,
  timer: null,
};

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Show a loading indicator near the given position.
 */
export function showLoading(x: number, y: number): void {
  removeCard();
  state.loading = true;

  const card = createCardElement();
  card.innerHTML = `
    <div class="wordlens-loading">
      <span class="wordlens-spinner"></span>
      <span>翻译中...</span>
    </div>
  `;
  positionCard(card, x, y);
  document.body.appendChild(card);
  state.showing = true;
}

/**
 * Display a translation result in the floating card.
 */
export function showTranslation(
  result: TranslationResult,
  x: number,
  y: number,
): void {
  state.loading = false;
  removeCard();

  const card = createCardElement();
  const phoneticHtml = result.phonetic
    ? `<span class="wordlens-phonetic">${result.phonetic}</span>`
    : '';
  const posHtml = result.partOfSpeech
    ? `<span class="wordlens-pos">${result.partOfSpeech}</span>`
    : '';
  const sentenceHtml = result.sourceSentence
    ? `<div class="wordlens-sentence">${escapeHtml(result.sourceSentence)}</div>`
    : '';

  card.innerHTML = `
    <button class="wordlens-close" aria-label="关闭">&times;</button>
    <div class="wordlens-header">
      <span class="wordlens-word">${escapeHtml(result.word)}</span>
      ${phoneticHtml}
    </div>
    <div class="wordlens-body">
      <div class="wordlens-translation">${escapeHtml(result.translation)}</div>
      <div class="wordlens-meta">${posHtml}</div>
    </div>
    ${sentenceHtml}
  `;

  // Close button
  card.querySelector('.wordlens-close')?.addEventListener('click', removeCard);

  positionCard(card, x, y);
  document.body.appendChild(card);
  state.showing = true;
}

/**
 * Append a chunk of streaming translation to the card.
 */
export function appendStreamChunk(chunk: string): void {
  const card = document.getElementById(CARD_ID);
  if (!card) return;

  const translationEl = card.querySelector('.wordlens-translation');
  if (translationEl) {
    translationEl.textContent += chunk;
  }
}

/**
 * Show streaming translation in the card (initial state).
 */
export function showStreamStart(x: number, y: number): void {
  state.loading = false;
  removeCard();

  const card = createCardElement();
  card.innerHTML = `
    <button class="wordlens-close" aria-label="关闭">&times;</button>
    <div class="wordlens-header">
      <span class="wordlens-word">翻译</span>
    </div>
    <div class="wordlens-body">
      <div class="wordlens-translation"></div>
    </div>
  `;

  card.querySelector('.wordlens-close')?.addEventListener('click', removeCard);
  positionCard(card, x, y);
  document.body.appendChild(card);
  state.showing = true;
}

/**
 * Show an error message in the card.
 */
export function showError(
  message: string,
  x: number,
  y: number,
): void {
  state.loading = false;
  removeCard();

  const card = createCardElement();
  card.innerHTML = `
    <button class="wordlens-close" aria-label="关闭">&times;</button>
    <div class="wordlens-body">
      <div class="wordlens-error">${escapeHtml(message)}</div>
    </div>
  `;

  card.querySelector('.wordlens-close')?.addEventListener('click', removeCard);
  positionCard(card, x, y);
  document.body.appendChild(card);
  state.showing = true;
}

/**
 * Display a no-API-key prompt.
 */
export function showNoKeyPrompt(x: number, y: number): void {
  state.loading = false;
  removeCard();

  const card = createCardElement();
  card.innerHTML = `
    <button class="wordlens-close" aria-label="关闭">&times;</button>
    <div class="wordlens-body">
      <div class="wordlens-error">
        请先在设置页面配置 DeepSeek API Key
      </div>
    </div>
  `;

  card.querySelector('.wordlens-close')?.addEventListener('click', removeCard);
  positionCard(card, x, y);
  document.body.appendChild(card);
  state.showing = true;
}

/**
 * Hide the card.
 */
export function hideCard(): void {
  removeCard();
}

/**
 * Check if the card is currently visible.
 */
export function isCardVisible(): boolean {
  return state.showing;
}

// ─── Internal ─────────────────────────────────────────────────────────

function createCardElement(): HTMLElement {
  const existing = document.getElementById(CARD_ID);
  if (existing) existing.remove();

  const card = document.createElement('div');
  card.id = CARD_ID;
  card.className = CARD_CLASS;
  return card;
}

function positionCard(card: HTMLElement, x: number, y: number): void {
  // Render off-screen first to measure dimensions
  card.style.left = '-9999px';
  card.style.top = '-9999px';
  card.style.position = 'fixed';

  // Use requestAnimationFrame to wait for layout
  requestAnimationFrame(() => {
    const rect = card.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const margin = 12;

    let left: number;
    let top: number;

    // Prefer placing below cursor
    if (y + rect.height + margin < viewportH) {
      top = y + margin;
    } else {
      // Above cursor
      top = y - rect.height - margin;
    }

    if (x + rect.width + margin < viewportW) {
      left = x + margin;
    } else {
      // Align right edge with viewport
      left = viewportW - rect.width - margin;
    }

    // Clamp to viewport
    left = Math.max(margin, left);
    top = Math.max(margin, top);

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  });
}

function removeCard(): void {
  state.showing = false;
  state.loading = false;
  const card = document.getElementById(CARD_ID);
  if (card) card.remove();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Global close handlers ────────────────────────────────────────────

// Close on Escape
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && state.showing) {
    removeCard();
  }
});

// Close on click outside the card
document.addEventListener('mousedown', (e: MouseEvent) => {
  if (!state.showing) return;
  const target = e.target as HTMLElement;
  if (!target.closest(`#${CARD_ID}`)) {
    removeCard();
  }
});

export { CARD_ID, CARD_CLASS };
