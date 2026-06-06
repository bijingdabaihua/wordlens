// Popup — Review Queue

import { getWordsByPriority, updateReviewResult, getStats, estimateVocabulary, getCEFRLevel } from '../shared/storage';

// ─── State ────────────────────────────────────────────────────────────

let words: WordRecord[] = [];
let currentIndex = 0;
let reviewedCount = 0;
let rememberedCount = 0;
let forgottenCount = 0;
let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
let detailsRevealed = false;

// ─── Types ────────────────────────────────────────────────────────────

interface WordRecord {
  id: string;
  word: string;
  translation: string;
  sentence: string;
  frequency: number;
  forgottenCount: number;
  rememberedCount: number;
  status: string;
}

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
    words = words.filter((w: WordRecord) => w.status !== 'mastered');

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

  // Details hidden by default — first scroll down reveals them
  cardDetails.classList.add('hidden');
  cardHint.classList.add('hidden');
  detailsRevealed = false;

  // Use saved translation data
  cardTranslation.textContent = record.translation || '';
  cardPos.textContent = '';
  cardPhonetic.textContent = '';
  cardFrequency.textContent = `查询 ${record.frequency} 次`;
  cardForgotten.textContent = `遗忘 ${record.forgottenCount} 次`;
}

// ─── Scroll Controls ─────────────────────────────────────────────────

$('card').addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();

  if (reviewScreen.classList.contains('hidden')) return;

  if (scrollTimeout) return;
  scrollTimeout = setTimeout(() => { scrollTimeout = null; }, 350);

  if (e.deltaY > 0) {
    // Scroll down: first time → reveal details, second time → remember
    if (!detailsRevealed) {
      cardDetails.classList.remove('hidden');
      detailsRevealed = true;
    } else {
      handleRemember();
    }
  } else {
    // Scroll up: reveal + forgot
    if (!detailsRevealed) {
      cardDetails.classList.remove('hidden');
    }
    handleForgot();
  }
}, { passive: false });

// ─── Action Handlers ──────────────────────────────────────────────────

function handleRemember() {
  if (currentIndex >= words.length) return;

  const record = words[currentIndex];

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

  renderCard();
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
