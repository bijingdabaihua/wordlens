# WordLens（词镜）

> 阅读英文网页，不知不觉学英语。 — Chrome 浏览器插件

## 功能

**Alt + 悬停单词** — 不用选中，按住 Alt 把鼠标移到单词上，立刻显示释义。

- **本地词库**（5000+ 高频词）→ 毫秒级显示
- **未命中** → 调用 DeepSeek AI 翻译 → 自动存入词库，越用越快

**选中文本** — 选中句子或段落，浮窗显示翻译（支持 streaming 逐字输出）。

**复习队列** — 点插件图标进入复习模式：

| 按键 | 功能 |
|---|---|
| **Space** | 记住了，移出队列 |
| **W** | 没记住，重新排队 |
| **Q** | 撤销上一步 |

自动按遗忘率和查词频率排序，复习完成后显示词汇量估算和 CEFR 等级（A1-C2）。

## 安装

### 从源码加载

```bash
# 克隆项目
git clone https://github.com/bijingdabaihua/wordlens.git
cd wordlens

# 安装依赖
npm install

# 构建
npm run build
```

打开 `chrome://extensions` → 开启「开发者模式」→ 「加载已解压的扩展程序」 → 选择 `dist/` 目录。

### 配置 API Key

右键插件图标 → **选项** → 输入 DeepSeek API Key → **测试连接** → **保存**

## 开发

```bash
npm run dev        # 监听模式构建
npm run build      # 类型检查 + 构建
npm run test       # 跑测试
npm run test:watch # 监听测试
```

### 项目结构

```
src/
├── content/        # 内容脚本 — Alt+悬停、选中、浮窗
├── background/     # Service Worker — 翻译请求处理
├── popup/          # 复习队列
├── options/        # 设置页面
└── shared/         # 共享层 — 类型、存储、词库、API 封装
```

详见 [CLAUDE.md](./CLAUDE.md) 和 [PLAN.md](./PLAN.md)。

## 技术栈

- **浏览器**: Chrome (Manifest V3)
- **语言**: TypeScript（严格模式）
- **构建**: Vite
- **测试**: Vitest
- **AI**: DeepSeek API
- **存储**: chrome.storage.local
