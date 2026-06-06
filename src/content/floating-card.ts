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

  card.innerHTML = `
    <div class="wordlens-header">
      <span class="wordlens-word">${escapeHtml(result.word)}</span>
      ${phoneticHtml}
    </div>
    <div class="wordlens-body">
      <div class="wordlens-translation">${escapeHtml(result.translation)}</div>
      <div class="wordlens-meta">${posHtml}</div>
    </div>
  `;

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
  card.dataset.streaming = 'true';
  card.innerHTML = `
    <div class="wordlens-body">
      <div class="wordlens-translation"></div>
    </div>
  `;

  positionCard(card, x, y);
  document.body.appendChild(card);
  state.showing = true;
}

/**
 * Finish a streaming translation — update card in-place, no visual jump.
 */
export function finishStream(): void {
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  delete card.dataset.streaming;
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
    <div class="wordlens-body">
      <div class="wordlens-error">${escapeHtml(message)}</div>
    </div>
  `;

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
    <div class="wordlens-body">
      <div class="wordlens-error">
        请先在设置页面配置 DeepSeek API Key
      </div>
    </div>
  `;

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
  card.style.left = '-9999px';
  card.style.top = '-9999px';
  card.style.position = 'fixed';

  requestAnimationFrame(() => {
    const rect = card.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const margin = 8;

    let left: number;
    let top: number;

    // Below cursor, expanding downward (natural for streaming)
    if (y + rect.height + margin < viewportH) {
      top = y + margin;
    } else {
      top = y - rect.height - margin;
    }

    // Center-align with cursor
    left = x - rect.width / 2;
    left = Math.max(margin, Math.min(viewportW - rect.width - margin, left));

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

// Close on scroll / mouse wheel
document.addEventListener('wheel', () => {
  if (state.showing) {
    removeCard();
  }
});

export { CARD_ID, CARD_CLASS };
