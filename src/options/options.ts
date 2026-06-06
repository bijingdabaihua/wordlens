// Options Page — Settings & Data Management

import { saveApiKey, getApiKey, getAllWords, getStats, estimateVocabulary, getCEFRLevel } from '../shared/storage';
import { verifyApiKey } from '../shared/api';

const REPO_URL_KEY = 'wordlens_repo_url';
const REPO_TOKEN_KEY = 'wordlens_repo_token';
const LOCAL_VERSION_KEY = 'wordlens_backup_version';

// ─── DOM Refs ──────────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id)!;

const keyInput = $('api-key-input') as HTMLInputElement;
const toggleBtn = $('toggle-key-visibility');
const keyStatusDot = $('key-status-dot');
const repoStatusDot = $('repo-status-dot');

const repoUrlInput = $('repo-url-input') as HTMLInputElement;
const repoTokenInput = $('repo-token-input') as HTMLInputElement;

const statTotal = $('stat-total');
const statLearning = $('stat-learning');
const statMastered = $('stat-mastered');
const statVocab = $('stat-vocab');
const statCefr = $('stat-cefr');

// ─── Initialize ───────────────────────────────────────────────────────

async function init() {
  const key = await getApiKey();
  if (key) {
    keyInput.value = key;
    // Auto-verify existing key on page load
    setKeyStatus('checking');
    try {
      setKeyStatus(await verifyApiKey() ? 'ok' : 'err');
    } catch {
      setKeyStatus('err');
    }
  }

  const { [REPO_URL_KEY]: repo } = await chrome.storage.local.get(REPO_URL_KEY);
  if (repo) repoUrlInput.value = repo as string;

  const { [REPO_TOKEN_KEY]: token } = await chrome.storage.local.get(REPO_TOKEN_KEY);
  if (token) repoTokenInput.value = token as string;

  // Auto-sync if repo configured
  const savedRepo = repoUrlInput.value.trim();
  if (savedRepo) {
    setRepoStatus('checking');
    await runSync(savedRepo.replace(/^https?:\/\/github\.com\//, ''), token as string || '');
  }

  await refreshStats();
}

// ─── API Key ──────────────────────────────────────────────────────────

toggleBtn.addEventListener('click', () => {
  keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  toggleBtn.textContent = keyInput.type === 'password' ? '👁' : '🙈';
});

// Auto-verify API key on input change
let keyCheckTimer: ReturnType<typeof setTimeout> | null = null;
keyInput.addEventListener('input', () => {
  setKeyStatus('idle');

  if (keyCheckTimer) clearTimeout(keyCheckTimer);
  keyCheckTimer = setTimeout(async () => {
    const key = keyInput.value.trim();
    if (!key) { setKeyStatus('idle'); return; }

    setKeyStatus('checking');
    try {
      await saveApiKey(key);
      setKeyStatus(await verifyApiKey() ? 'ok' : 'err');
    } catch {
      setKeyStatus('err');
    }
  }, 600);
});

function setKeyStatus(state: 'ok' | 'err' | 'checking' | 'idle' | 'unset') {
  keyStatusDot.className = 'key-dot ' + state;
}

function setRepoStatus(state: 'ok' | 'err' | 'checking' | 'idle') {
  repoStatusDot.className = 'key-dot ' + state;
}

// ─── GitHub ───────────────────────────────────────────────────────────

async function saveRepoConfig(repo: string, token: string) {
  await chrome.storage.local.set({ [REPO_URL_KEY]: repo, [REPO_TOKEN_KEY]: token });
}

async function fetchBackup(repo: string, token: string): Promise<{ words: unknown[]; version: number } | null> {
  try {
    if (token) {
      const res = await fetch(`https://api.github.com/repos/${repo}/contents/wordlens-backup.json`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const content = decodeURIComponent(escape(atob(data.content)));
      return JSON.parse(content);
    } else {
      const res = await fetch(`https://raw.githubusercontent.com/${repo}/main/wordlens-backup.json`);
      if (!res.ok) return null;
      return await res.json();
    }
  } catch { return null; }
}

async function importWords(data: { words: { word: string; translation: string; sentence?: string; url?: string }[] }): Promise<number> {
  const { addWord } = await import('../shared/storage');
  let count = 0;
  for (const w of data.words) {
    if (w.word && w.translation !== undefined) {
      await addWord(w.word, w.translation, w.sentence || '', w.url || '');
      count++;
    }
  }
  return count;
}

async function pushToRepo(repo: string, token: string) {
  const words = await getAllWords();
  const { [LOCAL_VERSION_KEY]: localVer } = await chrome.storage.local.get(LOCAL_VERSION_KEY);
  const version = ((localVer as number) ?? 0) + 1;
  const content = btoa(unescape(encodeURIComponent(JSON.stringify({ words, version }, null, 2))));

  const stats = await getStats();
  const readmeContent = btoa(unescape(encodeURIComponent(
    `# WordLens 词库备份\n\n自动备份时间：${new Date().toLocaleString('zh-CN')}\n\n` +
    `## 统计\n\n- 总单词数：${stats.total}\n- 学习中：${stats.learning}\n` +
    `- 已掌握：${stats.mastered}\n- 词汇量估算：${estimateVocabulary(stats.mastered)}\n` +
    `- CEFR 等级：${getCEFRLevel(estimateVocabulary(stats.mastered))}\n\n` +
    `> 由 [WordLens](https://github.com/bijingdabaihua/wordlens) 自动生成\n`
  )));

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Update README
  const readmeExisting = await fetch(`https://api.github.com/repos/${repo}/contents/README.md`, { headers });
  const readmeBody: Record<string, unknown> = { message: 'Update README.md', content: readmeContent };
  if (readmeExisting.ok) readmeBody.sha = (await readmeExisting.json()).sha;
  await fetch(`https://api.github.com/repos/${repo}/contents/README.md`, { method: 'PUT', headers, body: JSON.stringify(readmeBody) });

  // Update backup JSON
  const existing = await fetch(`https://api.github.com/repos/${repo}/contents/wordlens-backup.json`, { headers });
  const body: Record<string, unknown> = { message: 'Update wordlens-backup.json', content };
  if (existing.ok) body.sha = (await existing.json()).sha;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/wordlens-backup.json`, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (res.ok) {
    await chrome.storage.local.set({ [LOCAL_VERSION_KEY]: version });
    showToast(`已推送 v${version}（${words.length} 词）到仓库`, 'success');
  } else {
    const err = await res.json();
    showToast(err.message || '推送失败', 'error');
  }
}

// Auto-sync: compare versions → import or push
async function runSync(repo: string, token: string) {
  setRepoStatus('checking');
  try {
    // 1. Verify repo access
    const verifyUrl = token
      ? `https://api.github.com/repos/${repo}`
      : `https://raw.githubusercontent.com/${repo}/main/README.md`;
    const verifyRes = await fetch(verifyUrl, token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined);

    if (verifyRes.status === 401) { setRepoStatus('err'); showToast('Token 无效', 'error'); return; }
    if (verifyRes.status === 403) { setRepoStatus('err'); showToast('无法访问（私有仓库需填写 token）', 'error'); return; }
    if (verifyRes.status === 404) { setRepoStatus('err'); showToast('仓库不存在', 'error'); return; }
    if (!verifyRes.ok) { setRepoStatus('err'); showToast(`连接失败 (${verifyRes.status})`, 'error'); return; }

    await saveRepoConfig(repo, token);
    const username = repo.split('/')[0];

    // 2. Compare versions
    const repoBackup = await fetchBackup(repo, token);
    const { [LOCAL_VERSION_KEY]: localVer } = await chrome.storage.local.get(LOCAL_VERSION_KEY);
    const localWords = await getAllWords();
    const repoVer = repoBackup?.version ?? 0;
    const myVer = (localVer as number) ?? 0;

    if (repoBackup?.words?.length && repoVer > myVer) {
      // Repo is newer → auto import
      const count = await importWords(repoBackup as any);
      await chrome.storage.local.set({ [LOCAL_VERSION_KEY]: repoVer });
      setRepoStatus('ok');
      showToast(`已同步 v${repoVer}（导入 ${count} 词）`, 'success');
      await refreshStats();
    } else if (localWords.length && myVer >= repoVer) {
      // Local is same or newer → push if we have a token
      if (!token) {
        showToast('无 token，无法推送到仓库。填写 token 后可同步', 'error');
        return;
      }
      await pushToRepo(repo, token);
      setRepoStatus('ok');
    } else {
      setRepoStatus('ok');
      showToast(`已同步「${username}」的仓库`, 'success');
    }
    await refreshStats();
  } catch { /* sync failed silently — already handled */ }
}

// ─── Stats ────────────────────────────────────────────────────────────

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

// ─── Utilities ────────────────────────────────────────────────────────

function showToast(msg: string, type: 'success' | 'error') {
  const existing = document.querySelector('.wordlens-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `wordlens-toast ${type}`;
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function formatNumber(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

// ─── Start ────────────────────────────────────────────────────────────

init();
