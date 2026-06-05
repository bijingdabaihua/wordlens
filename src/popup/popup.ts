// Popup — Review Queue

import { getWordsByPriority, updateReviewResult, getStats, estimateVocabulary, getCEFRLevel } from '../shared/storage';
import type { WordRecord } from '../shared/types';

// ─── Types ────────────────────────────────────────────────────────────

interface UndoEntry {
  type: 'remember' | 'forgot';
  id: string;
  index: number;
  beforeRemembered: number;
  beforeForgotten: number;
  beforeStatus: WordRecord['status'];
}

// ─── State ────────────────────────────────────────────────────────────

let words: WordRecord[] = [];
let currentIndex = 0;
let undoStack: UndoEntry[] = [];
let reviewedCount = 0;
let rememberedCount = 0;
let forgottenCount = 0;

// DOM refs
const $ = (id: string) => document.getElementById(id)!;

const loadingScreen = $('loading-screen');
const emptyScreen = $('empty-screen');
const reviewScreen = $('review-screen');
const completeScreen = $('complete-screen');
const progressFill = $('progress-fill') as HTMLElement;
const progressText = $('progress-text');
const cardWord = $('card-word');
const cardHint = $('card-hint');
const cardDetails = $('card-details');
const cardTranslation = $('card-translation');
const cardPos = $('card-pos');
const cardPhonetic = $('card-phonetic');
const cardSentence = $('card-sentence');
const cardFrequency = $('card-frequency');
const cardForgotten = $('card-forgotten');
const statReviewed = $('stat-reviewed');
const statRemembered = $('stat-remembered');
const statForgotten = $('stat-forgotten');
const statVocab = $('stat-vocab');
const statCefr = $('stat-cefr');

// ─── Initialization ───────────────────────────────────────────────────

async function init() {
  try {
    words = await getWordsByPriority();
    words = words.filter(w => w.status !== 'mastered');

    if (words.length === 0) {
      showEmpty();
      return;
    }

    showReview();
  } catch {
    showEmpty();
  }
}

// ─── Screen Switching ─────────────────────────────────────────────────

function showLoading() {
  loadingScreen.classList.remove('hidden');
  emptyScreen.classList.add('hidden');
  reviewScreen.classList.add('hidden');
  completeScreen.classList.add('hidden');
}

function showEmpty() {
  loadingScreen.classList.add('hidden');
  emptyScreen.classList.remove('hidden');
  reviewScreen.classList.add('hidden');
  completeScreen.classList.add('hidden');
}

function showReview() {
  loadingScreen.classList.add('hidden');
  emptyScreen.classList.add('hidden');
  reviewScreen.classList.remove('hidden');
  completeScreen.classList.add('hidden');
  renderCard();
}

function showComplete() {
  loadingScreen.classList.add('hidden');
  emptyScreen.classList.add('hidden');
  reviewScreen.classList.add('hidden');
  completeScreen.classList.remove('hidden');
  renderStats();
}

// ─── Card Rendering ───────────────────────────────────────────────────

function renderCard() {
  if (currentIndex >= words.length) {
    showComplete();
    return;
  }

  const record = words[currentIndex];
  const total = words.length;

  // Progress
  const progress = (currentIndex / total) * 100;
  progressFill.style.width = `${progress}%`;
  progressText.textContent = `${currentIndex + 1} / ${total}`;

  // Word
  cardWord.textContent = record.word;

  // Details (hidden by default — revealed on hover/click)
  cardDetails.classList.add('hidden');
  cardHint.classList.remove('hidden');
  cardHint.textContent = '悬停看释义';

  // Use saved translation data
  cardTranslation.textContent = record.translation || '';
  cardPos.textContent = '';
  cardPhonetic.textContent = '';
  cardSentence.textContent = record.sentence || '';
  cardFrequency.textContent = `查询 ${record.frequency} 次`;
  cardForgotten.textContent = `遗忘 ${record.forgottenCount} 次`;

  // Reset undo stack when moving to a new word
  undoStack = [];
}

// ─── Card Interaction ─────────────────────────────────────────────────

cardWord.addEventListener('mouseenter', () => {
  cardDetails.classList.remove('hidden');
  cardHint.classList.add('hidden');
});

cardWord.addEventListener('click', () => {
  cardDetails.classList.remove('hidden');
  cardHint.classList.add('hidden');
});

// ─── Keyboard Controls ────────────────────────────────────────────────

document.addEventListener('keydown', (e: KeyboardEvent) => {
  // Complete screen: close on Enter or Space
  if (!completeScreen.classList.contains('hidden')) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.close();
    }
    return;
  }

  if (reviewScreen.classList.contains('hidden')) return;

  // Reveal details on any action
  cardDetails.classList.remove('hidden');
  cardHint.classList.add('hidden');

  switch (e.key) {
    case ' ':
    case 'Space':
      e.preventDefault();
      handleRemember();
      break;
    case 'w':
    case 'W':
      handleForgot();
      break;
    case 'q':
    case 'Q':
      handleUndo();
      break;
  }
});

// ─── Action Handlers ──────────────────────────────────────────────────

function handleRemember() {
  if (currentIndex >= words.length) return;

  const record = words[currentIndex];

  // Save undo info
  undoStack.push({
    type: 'remember',
    id: record.id,
    index: currentIndex,
    beforeRemembered: record.rememberedCount,
    beforeForgotten: record.forgottenCount,
    beforeStatus: record.status,
  });

  // Update in storage
  updateReviewResult(record.id, true);

  reviewedCount++;
  rememberedCount++;
  currentIndex++;
  renderCard();
}

function handleForgot() {
  if (currentIndex >= words.length) return;

  const record = words[currentIndex];

  // Save undo info
  undoStack.push({
    type: 'forgot',
    id: record.id,
    index: currentIndex,
    beforeRemembered: record.rememberedCount,
    beforeForgotten: record.forgottenCount,
    beforeStatus: record.status,
  });

  // Update in storage
  updateReviewResult(record.id, false);

  reviewedCount++;
  forgottenCount++;

  // Re-insert later in the queue (10% deeper, at least 2 positions ahead)
  const reinsertPos = Math.min(
    currentIndex + Math.max(Math.floor(words.length * 0.1) + 1, 2),
    words.length,
  );

  const [moved] = words.splice(currentIndex, 1);
  words.splice(reinsertPos - 1, 0, moved);

  // Stay at same index (next word slides in)
  renderCard();
}

function handleUndo() {
  if (undoStack.length === 0) return;

  const undo = undoStack.pop()!;

  if (undo.type === 'remember') {
    // Simple: go back one position
    currentIndex = undo.index;
    reviewedCount--;
    rememberedCount--;
    renderCard();
  } else if (undo.type === 'forgot') {
    // Find the word and put it back at the original position
    const wordIdx = words.findIndex(w => w.id === undo.id);
    if (wordIdx >= 0) {
      const [moved] = words.splice(wordIdx, 1);
      words.splice(undo.index, 0, moved);
    }

    reviewedCount--;
    forgottenCount--;

    // Re-render at the undo index
    currentIndex = undo.index;
    renderCard();
  }
}

// ─── Stats Screen ─────────────────────────────────────────────────────

async function renderStats() {
  try {
    const stats = await getStats();
    const vocabEstimate = estimateVocabulary(stats.mastered);
    const cefr = getCEFRLevel(vocabEstimate);

    statReviewed.textContent = String(reviewedCount);
    statRemembered.textContent = String(rememberedCount);
    statForgotten.textContent = String(forgottenCount);
    statVocab.textContent = formatNumber(vocabEstimate);
    statCefr.textContent = cefr;
  } catch {
    statReviewed.textContent = String(reviewedCount);
    statRemembered.textContent = String(rememberedCount);
    statForgotten.textContent = String(forgottenCount);
    statVocab.textContent = '-';
    statCefr.textContent = '-';
  }
}

// ─── Utilities ────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(n);
}

// ─── Button Events ────────────────────────────────────────────────────

$('close-btn').addEventListener('click', () => window.close());
$('go-options-btn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ─── Start ────────────────────────────────────────────────────────────

showLoading();
init();
