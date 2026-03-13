# PDF Guru - AI PDF 摘要工具

支持文字 PDF 和扫描件的 AI 摘要工具，使用 DeepSeek + 百度 OCR。

## 功能特性

- ✅ **文字 PDF 提取** - 直接提取文本内容
- ✅ **扫描件 OCR** - 自动识别图片 PDF（百度 OCR）
- ✅ **AI 摘要** - DeepSeek 生成结构化摘要
- ✅ **Chat with PDF** - 基于摘要追问
- ✅ **中英文支持** - 混合识别
- ✅ **无存储** - 纯内存处理，保护隐私

## 技术栈

- **前端**: Next.js 14 + React 18 + Tailwind CSS
- **PDF 解析**: pdf.js
- **OCR**: 百度 OCR API
- **AI**: DeepSeek API
- **部署**: Cloudflare Workers

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/x819217-png/PDF-Guru-v2.git
cd PDF-Guru-v2
```

### 2. 安装依赖

```bash
# 推荐使用 pnpm
pnpm install

# 或使用 npm
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填入你的 API Keys：

```bash
# DeepSeek API
DEEPSEEK_API_KEY=sk-your-deepseek-key

# 百度 OCR API
BAIDU_OCR_API_KEY=your-baidu-api-key
BAIDU_OCR_SECRET_KEY=your-baidu-secret-key
```

**获取 API Keys：**
- DeepSeek: https://platform.deepseek.com/
- 百度 OCR: https://cloud.baidu.com/product/ocr

### 4. 运行开发服务器

```bash
pnpm dev
# 或
npm run dev
```

打开 http://localhost:3000

## 部署

### Vercel 部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/x819217-png/PDF-Guru-v2)

部署后记得在 Vercel 后台配置环境变量。

### Cloudflare Workers 部署

```bash
# 安装 wrangler
npm install -g wrangler

# 登录
wrangler login

# 部署
npm run build
wrangler deploy
```

## 使用说明

1. **上传 PDF** - 拖拽或点击上传（最大 10MB）
2. **自动识别** - 系统自动判断是文字 PDF 还是扫描件
3. **生成摘要** - AI 自动生成结构化摘要
4. **追问** - 可以基于摘要继续提问
5. **导出** - 复制或下载摘要文本

## 成本预估

| 服务 | 免费额度 | 超额费用 |
|------|----------|----------|
| Cloudflare Workers | 100,000 次/天 | $0.013/百万请求 |
| 百度 OCR | 1,000 次/天 | ¥0.004/次 |
| DeepSeek API | - | ~$0.001/次 |

**预估月成本**（1000 用户/天）：~¥150/月

## 开发

```bash
# 开发
pnpm dev

# 构建
pnpm build

# 启动生产服务器
pnpm start

# 代码检查
pnpm lint
```

## 项目结构

```
PDF-Guru-v2/
├── src/
│   └── app/
│       ├── api/
│       │   ├── ocr/route.ts       # OCR API
│       │   └── summarize/route.ts # 摘要 API
│       ├── page.tsx               # 主页面
│       ├── layout.tsx             # 布局
│       └── globals.css            # 全局样式
├── public/
│   └── pdf.worker.min.js          # pdf.js worker
├── .env.example                   # 环境变量示例
└── package.json
```

## 常见问题

### Q: 为什么提示"无法提取文本"？

A: 可能是：
1. PDF 是扫描件 - 系统会自动使用 OCR 识别
2. OCR API 配置错误 - 检查 `.env.local` 中的 API Keys
3. PDF 文件损坏 - 尝试其他 PDF

### Q: OCR 识别很慢？

A: OCR 识别需要时间，特别是多页 PDF。当前限制最多识别 10 页。

### Q: 支持哪些语言？

A: 支持中文和英文混合识别。

## License

MIT

## 作者

余晓炜

## 贡献

欢迎提交 Issue 和 Pull Request！
