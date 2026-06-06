# WordLens（词镜）

> 阅读英文网页，不知不觉学英语。 — Chrome 浏览器插件

## 功能

**选中文本翻译** — 选中单词或句子，浮窗显示翻译。

- **本地词库**（5000+ 高频词）→ 毫秒级显示
- **未命中** → 调用 DeepSeek AI 翻译 → 自动存入词库，越用越快
- 句子翻译支持 **流式逐字输出**

**浮窗显示**：单词、音标、词性、中文释义，点击外部或滚轮关闭。

**复习队列** — 点插件图标进入复习模式：

| 操作 | 功能 |
|---|---|
| **↓ 第一次** | 显示释义 |
| **↓ 第二次** | 记住了，下一词 |
| **↑ 任何时候** | 忘记，重新排队 |

自动按遗忘率和查词频率排序，完成后显示词汇量 + CEFR 等级。

**GitHub 同步** — 配置仓库和 token，自动备份词库到 `wordlens-backup.json`，多设备间同步。

## 安装

```bash
git clone https://github.com/bijingdabaihua/wordlens.git
cd wordlens
npm install
npm run build
```

打开 `chrome://extensions` → 开发者模式 → 加载 `dist/` 目录。

## 开发

```bash
npm run dev        # 监听模式构建
npm run build      # 类型检查 + 构建
npm run test       # 跑测试
```

详见 [CLAUDE.md](./CLAUDE.md) 和 [PLAN.md](./PLAN.md)。

## 技术栈

- Chrome Manifest V3 / TypeScript / Vite / Vitest
- DeepSeek API / chrome.storage.local
