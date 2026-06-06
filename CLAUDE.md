# WordLens（词镜）

Chrome 浏览器插件 — 阅读英文网页，不知不觉学英语。

## 第一原则：可控

所有设计和实现以"可控"为核心，确保 Claude Code 能长期稳定迭代。

## 项目概览

- **浏览器**: Chrome (Manifest V3)
- **语言**: TypeScript（严格模式）
- **构建**: Vite
- **测试**: Vitest
- **AI**: DeepSeek API
- **存储**: chrome.storage.local

## 目录结构

```
wordlens/
├── src/
│   ├── content/           # 内容脚本（注入网页）
│   │   ├── index.ts       # 入口：Alt+悬停、选中监听
│   │   ├── floating-card.ts  # 翻译浮窗 UI
│   │   └── content.css    # 浮窗样式
│   ├── background/        # Service Worker
│   │   └── index.ts       # DeepSeek API 调用
│   ├── popup/             # 复习队列弹窗
│   │   ├── index.html
│   │   ├── popup.ts
│   │   └── popup.css
│   ├── options/           # 设置页面
│   │   ├── index.html
│   │   └── options.ts
│   └── shared/            # 共享层
│       ├── types.ts       # 类型定义
│       ├── storage.ts     # chrome.storage 封装
│       └── api.ts         # DeepSeek API 客户端
├── public/
│   ├── manifest.json
│   └── icons/
├── scripts/
│   └── build.js
├── CLAUDE.md
├── STATUS.md
└── package.json
```

## 构建命令

```bash
npm run build    # 类型检查 + 构建
npm run dev      # 监听模式构建
npm run test     # 跑测试
npm run test:watch  # 监听测试
```

## 开发流程

1. Chrome 加载 `dist/` 目录（chrome://extensions → 加载已解压的扩展程序）
2. 修改代码后重新 build，Chrome 自动重载
3. 测试改动手动验证

## 功能架构

### 交互方式
- **选中文本**: 翻译句子/段落；选中单个词则解释文中义
- 浮窗显示：音标、词性、中文释义
- 句子翻译支持流式逐字输出

### 翻译流程
1. 用户选中文本
2. 先查本地词库（5000+ 高频词）→ 命中则毫秒级返回
3. 未命中 → 调 DeepSeek API → 结果展示
4. API 结果自动补入本地词库（自增长）

### 复习队列（popup）
- 打开 popup 进入复习模式
- 按频率 + 遗忘次数排序
- 滚轮操作：↓ 看释义 → ↓ 记住 / ↑ 忘记
- 统计词汇量 + CEFR 等级 (A1-C2)

### 设置页面
- API Key 自动检测（绿色状态灯）
- GitHub 仓库自动同步（版本号管理）
- 词汇统计面板

### GitHub 同步
- 配置 `owner/repo` + token
- 自动推送 `wordlens-backup.json`
- 版本号递增，多设备间自动同步
- 公开仓库无需 token 可读

## 当前进度

见 STATUS.md。

## 数据存储

所有用户数据存储在 chrome.storage.local，不发送到任何第三方服务（除用户自行配置的 DeepSeek API）。
