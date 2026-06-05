// Options Page — Settings & Data Management

import { saveApiKey, getApiKey, getAllWords, clearAll, getStats, estimateVocabulary, getCEFRLevel } from '../shared/storage';
import { verifyApiKey } from '../shared/api';

// ─── DOM Refs ──────────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id)!;

const keyInput = $('api-key-input') as HTMLInputElement;
const toggleBtn = $('toggle-key-visibility');
const testBtn = $('test-connection-btn') as HTMLButtonElement;
const saveBtn = $('save-key-btn') as HTMLButtonElement;
const apiStatus = $('api-status');

const exportBtn = $('export-btn') as HTMLButtonElement;
const importBtn = $('import-btn') as HTMLButtonElement;
const importFileInput = $('import-file-input') as HTMLInputElement;
const clearBtn = $('clear-btn') as HTMLButtonElement;
const dataStatus = $('data-status');

const statTotal = $('stat-total');
const statLearning = $('stat-learning');
const statMastered = $('stat-mastered');
const statVocab = $('stat-vocab');
const statCefr = $('stat-cefr');
const refreshStatsBtn = $('refresh-stats-btn');

// ─── Initialize ───────────────────────────────────────────────────────

async function init() {
  // Load saved API key
  const key = await getApiKey();
  if (key) {
    keyInput.value = key;
  }

  // Load stats
  await refreshStats();
}

// ─── API Key Section ──────────────────────────────────────────────────

// Toggle visibility
toggleBtn.addEventListener('click', () => {
  if (keyInput.type === 'password') {
    keyInput.type = 'text';
    toggleBtn.textContent = '🙈';
  } else {
    keyInput.type = 'password';
    toggleBtn.textContent = '👁';
  }
});

// Save API key
saveBtn.addEventListener('click', async () => {
  const key = keyInput.value.trim();
  if (!key) {
    showStatus(apiStatus, '请输入 API Key', 'error');
    return;
  }

  if (!key.startsWith('sk-')) {
    showStatus(apiStatus, 'API Key 格式不正确，应以 sk- 开头', 'error');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  try {
    await saveApiKey(key);
    showStatus(apiStatus, 'API Key 已保存', 'success');
  } catch {
    showStatus(apiStatus, '保存失败，请重试', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '保存';
  }
});

// Test connection
testBtn.addEventListener('click', async () => {
  const key = keyInput.value.trim();
  if (!key) {
    showStatus(apiStatus, '请先输入 API Key', 'error');
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = '验证中...';
  showStatus(apiStatus, '正在连接 DeepSeek API...', 'info');

  try {
    // Temporarily save the key so the API module can use it
    await saveApiKey(key);
    const valid = await verifyApiKey();

    if (valid) {
      showStatus(apiStatus, '✅ 连接成功！API Key 有效', 'success');
    } else {
      showStatus(apiStatus, '❌ 连接失败，请检查 API Key', 'error');
    }
  } catch {
    showStatus(apiStatus, '❌ 网络错误，请检查网络连接', 'error');
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '测试连接';
  }
});

// ─── Data Section ─────────────────────────────────────────────────────

// Export data
exportBtn.addEventListener('click', async () => {
  try {
    const words = await getAllWords();
    const data = JSON.stringify({ words, exportedAt: new Date().toISOString() }, null, 2);

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wordlens-backup-${formatDate()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showStatus(dataStatus, `已导出 ${words.length} 个单词`, 'success');
  } catch {
    showStatus(dataStatus, '导出失败', 'error');
  }
});

// Import data
importBtn.addEventListener('click', () => {
  importFileInput.click();
});

importFileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.words || !Array.isArray(data.words)) {
      showStatus(dataStatus, '文件格式不正确', 'error');
      return;
    }

    // Import words one by one
    const { addWord } = await import('../shared/storage');
    let count = 0;
    for (const w of data.words) {
      if (w.word && w.translation !== undefined) {
        await addWord(w.word, w.translation, w.sentence || '', w.url || '');
        count++;
      }
    }

    showStatus(dataStatus, `已导入 ${count} 个单词`, 'success');
    await refreshStats();
  } catch {
    showStatus(dataStatus, '导入失败，请检查文件格式', 'error');
  } finally {
    importFileInput.value = '';
  }
});

// Clear all data
clearBtn.addEventListener('click', async () => {
  const confirmed = confirm(
    '确定要清空所有数据吗？\n\n这将删除所有已保存的单词和复习记录，此操作不可撤销。',
  );
  if (!confirmed) return;

  const doubleConfirm = confirm('再次确认：真的要清空所有数据吗？');
  if (!doubleConfirm) return;

  try {
    await clearAll();
    showStatus(dataStatus, '所有数据已清空', 'success');
    await refreshStats();
  } catch {
    showStatus(dataStatus, '清空失败', 'error');
  }
});

// ─── Stats Section ────────────────────────────────────────────────────

async function refreshStats() {
  try {
    const stats = await getStats();
    const vocab = estimateVocabulary(stats.mastered);
    const cefr = getCEFRLevel(vocab);

    statTotal.textContent = String(stats.total);
    statLearning.textContent = String(stats.learning);
    statMastered.textContent = String(stats.mastered);
    statVocab.textContent = formatNumber(vocab);
    statCefr.textContent = cefr;
  } catch {
    statTotal.textContent = '0';
    statLearning.textContent = '0';
    statMastered.textContent = '0';
    statVocab.textContent = '0';
    statCefr.textContent = '-';
  }
}

refreshStatsBtn.addEventListener('click', refreshStats);

// ─── Utilities ────────────────────────────────────────────────────────

function showStatus(el: HTMLElement, msg: string, type: 'success' | 'error' | 'info') {
  el.textContent = msg;
  el.className = `status-msg ${type}`;
  el.classList.remove('hidden');

  // Auto-hide after 5 seconds for success/info
  if (type !== 'error') {
    setTimeout(() => el.classList.add('hidden'), 5000);
  }
}

function formatNumber(n: number): string {
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(n);
}

function formatDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Start ────────────────────────────────────────────────────────────

init();
