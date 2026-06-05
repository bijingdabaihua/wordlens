# WordLens 浏览器插件 — 实施计划

## 项目概述

WordLens（词镜）是一个 Chrome 浏览器插件，帮助英语学习者通过阅读网页自然积累词汇。核心亮点是 AI 翻译（DeepSeek）+ 智能复习队列。

## 第一原则：可控

这个项目全程由 Claude Code 迭代维护，所有设计以"可控"为核心：

1. **Claude 能看懂** — 目录结构清晰、命名一致、职责单一，新会话 5 分钟上手
2. **Claude 能改对** — 类型安全、模块低耦合、改一处不影响其他地方
3. **Claude 能验证** — 核心逻辑有单元测试，改完跑测试就知道有没有 break
4. **Claude 能接上** — CLAUDE.md 指引 + STATUS.md 进度快照，新会话无缝衔接
5. **步子小** — 每个阶段完成停一下确认，不跳步、不堆代码

## 需求总览

### 交互方式
1. **Alt + 悬停单词** → 翻译单词（无需选中，适合无法选中的元素）
2. **选中文本** → 翻译句子/段落；选中单个词则解释在句中的含义
3. **翻译浮窗** → 页面内弹出，显示翻译结果

### 复习队列（popup 弹窗）
1. 自动记录所有查过的词
2. 排序 = 查词频率 × 权重 + 遗忘次数 × 权重
3. 只显示英文 → 用户回忆 → 悬停看释义
4. 按 Space = 记住（移出队列）
5. 按 W = 没记住（增加遗忘计数，重新排队）
6. 按 Q = 撤销上一步操作
7. 统计词汇量，评估 CEFR 英语等级（A1-C2）

### 配置
- 插件内设置页面输入 DeepSeek API Key

---

## 阶段一：项目脚手架（Step 1）

目标：搭建干净的项目结构，确保构建成功。

### 技术选型
- **语言**: TypeScript（严格模式）
- **构建**: Vite（多入口配置）
- **浏览器标准**: Manifest V3
- **存储**: chrome.storage.local
- **样式**: 原生 CSS（无框架依赖，减少维护成本）

### 目录结构

```
wordlens/
├── src/
│   ├── content/
│   │   ├── index.ts            # 内容脚本入口
│   │   ├── floating-card.ts    # 翻译浮窗 UI
│   │   └── content.css         # 内容脚本样式
│   ├── background/
│   │   └── index.ts            # Service Worker
│   ├── popup/
│   │   ├── index.html
│   │   ├── popup.ts            # 复习队列逻辑
│   │   └── popup.css
│   ├── options/
│   │   ├── index.html
│   │   └── options.ts          # API Key 设置
│   └── shared/
│       ├── types.ts            # 共享类型定义
│       ├── storage.ts          # chrome.storage 封装
│       └── api.ts              # DeepSeek API 客户端
├── public/
│   ├── manifest.json           # Manifest V3
│   └── icons/                  # 插件图标
├── package.json
├── tsconfig.json
├── vite.config.ts
├── scripts/
│   └── build.js                # 构建脚本（复制 manifest、icons）
├── CLAUDE.md               # Claude 项目指引（新会话入口）
├── STATUS.md                # 开发进度快照
└── README.md
```

### 关键构建策略
- Vite 通过 `build.rollupOptions.input` 配置多入口
- 内容脚本和 Background 输出为 IIFE 格式（单个文件）
- Popup/Options 输出为标准 HTML 页面
- 构建完成后通过脚本将 manifest.json + icons 复制到 dist

---

## 阶段二：共享层（Step 2）

### 类型定义 (`shared/types.ts`)
```typescript
interface WordRecord {
  id: string;
  word: string;
  translation: string;
  sentence: string;         // 原文句子
  url: string;              // 来源网页
  timestamp: number;        // 首次查询时间
  frequency: number;        // 查询次数
  forgottenCount: number;   // 遗忘次数
  rememberedCount: number;  // 记住次数
  status: 'learning' | 'known' | 'mastered';
  lastReviewed: number;
}

interface TranslationResult {
  word: string;
  translation: string;
  sourceSentence: string;
  partOfSpeech?: string;
  phonetic?: string;
}
```

### Storage 封装 (`shared/storage.ts`)
- `addWord(record)` — 添加或更新单词（频率+1）
- `getAllWords()` — 获取所有单词
- `updateReviewResult(id, remembered)` — 更新遗忘/记住计数
- `deleteWord(id)` — 删除单词
- `clearAll()` — 清空
- `getStats()` — 统计词汇量

### 本地词库 (`shared/dictionary.ts`)
- 5000+ 高频英语单词数据（硬编码常量）
- `lookupWord(word)`: 查本地词库，返回音标/释义/词性
- `addToLocalDictionary(word, data)`: 将新词写入本地存储
- 按字母分块组织，加载快

### DeepSeek API 封装 (`shared/api.ts`)
- `translateWord(word, context?)` — 翻译单词（含上下文）
- `translateSentence(text)` — 翻译句子（支持 streaming）
- 使用 fetch 直接调用 DeepSeek API（兼容 OpenAI 格式）
- 错误处理 + 超时 + 重试逻辑

---

## 阶段三：翻译功能（Step 3）

### 内容脚本 (`content/index.ts`)
- 监听 `mouseover` 事件（检测 Alt 键按下）
- 监听 `mouseup` 事件（检测选中文本）
- 防抖处理，避免频繁请求
- 调用 Background 获取翻译
- 渲染浮窗

### 浮窗组件 (`content/floating-card.ts`)
- 显示在鼠标位置附近
- 自适应屏幕边界（不溢出）
- 关闭按钮/点击外部关闭
- 显示：单词/原文、翻译、音标、例句

### Background Service Worker (`background/index.ts`)
- 监听来自 content script 的消息
- 调用 DeepSeek API
- 返回翻译结果
- 缓存机制（同一词短时间内不重复请求）

### 本地词库方案（核心体验优化）
- 内置 **5000+ 高频英语单词**（含音标、中文释义、词性）
- **命中流程**: hover 时先查本地词库 → 命中则毫秒级返回 → 未命中才调 API
- **自增长机制**: API 查过的生词自动加入本地词库，越用命中率越高
- 词库数据初始化时机: 插件安装首次启动时写入 chrome.storage
- 词库文件放在 `src/shared/dictionary.ts`（按字母分块，避免单文件过大）

### Streaming 输出
- 句子翻译使用 **streaming**（逐 token 输出到浮窗）
- 用户不用盯着空白等待，感知延迟大幅降低
- 浮窗先显示骨架屏 → 文字逐字出现

### 视口预翻译
- 页面加载后，提取用户**当前视口内**的文本
- 批量查本地词库，标记已认识的词
- 不预先调 API（避免浪费额度），只缓存本地词库的命中结果

### 翻译 Prompt 设计
- **单词翻译**: "翻译这个英文单词在以下句子中的含义，返回JSON: {word, translation, phonetic, partOfSpeech}"
- **句子翻译**: "将以下英文翻译为中文，保持原意，符合中文表达习惯"

---

## 阶段四：复习队列（Step 4）

### 排序算法
```
score = (frequency * 0.3) + (forgottenCount * 0.5) - (rememberedCount * 0.2)
```
- frequency（查词频率）反映用户常遇到的词
- forgottenCount（遗忘次数）反映需要巩固的词
- rememberedCount（记住次数）降低已掌握词的权重
- 按 score 降序排列

### Popup UI (`popup/`)
1. 打开弹窗直接进入复习模式
2. 显示当前卡片：英文单词 + 进度（第 X/共 Y 个）
3. 悬停 → 显示释义
4. Space → 记住（标记 mastered，不再出现）
5. W → 没记住（forgottenCount+1，重新排队）
6. Q → 撤销上一步
7. 全部完成后显示：本次复习统计 + 词汇量 + CEFR 等级

### 词汇量估算
- 根据已掌握的 master 单词数量
- 加上权重系数估算总词汇量
- 映射 CEFR 等级：A1(<500) → A2(500-1500) → B1(1500-3000) → B2(3000-5000) → C1(5000-8000) → C2(>8000)

---

## 阶段五：设置页面（Step 5）

### Options 页面
- API Key 输入框 + 保存按钮
- 测试连接按钮（调用 DeepSeek API 验证 Key 是否有效）
- 清空所有数据按钮（带确认）
- 导出/导入单词数据

---

## 阶段六：打磨与发布（Step 6）

### 需处理的细节
- 浮窗位置智能调整（不超出视口）
- 深色模式支持
- 图标设计（简单的 SVG/PNG）
- 权限最小化原则（仅申请 `storage` 和 `activeTab` 权限）
- 错误状态处理（API 失败、网络错误、无 Key 提示）

---

## 验证方式

1. **启动开发模式**: `npm run dev` → Chrome 加载 `dist/` 目录测试
2. **构建检查**: `npm run build` → 确认无 TypeScript 错误
3. **手动测试用例**:
   - Alt + 悬停一个单词 → 弹出浮窗
   - 选中一段文字 → 翻译浮窗
   - 选中一个单词 → 上下文翻译
   - 打开 popup → 出现复习卡片
   - Space/W/Q 按键功能正常
   - Options 页面保存 API Key 成功
   - 重复打开插件，数据持久化正常

---

## 执行顺序

每个阶段完成后验证 + 确认 → 再进入下一阶段。

1. Phase 1: 脚手架搭建
2. Phase 2: 共享层（types, storage, api）
3. Phase 3: 翻译功能（content + background）
4. Phase 4: 复习队列（popup）
5. Phase 5: 设置页面（options）
6. Phase 6: 打磨优化
