# Google OAuth 接入指南

## 已完成的配置

### 1. 安装依赖
- next-auth@beta
- prisma + @prisma/client
- @next-auth/prisma-adapter

### 2. 数据库设置
- 使用 SQLite 本地数据库（prisma/dev.db）
- 已创建 User、Account、Session 模型

### 3. 创建的文件

- `src/lib/auth.ts` - NextAuth 配置（已接入 Prisma）
- `src/lib/prisma.ts` - Prisma 客户端单例
- `src/app/api/auth/[...nextauth]/route.ts` - API 路由
- `src/components/SessionProvider.tsx` - Session Provider
- `src/types/next-auth.d.ts` - TypeScript 类型
- `prisma/schema.prisma` - 数据库模型
- `prisma/migrations/` - 数据库迁移

### 4. 修改的文件

- `src/app/layout.tsx` - 添加 SessionProvider
- `src/app/PageClient.tsx` - 添加登录/登出按钮
- `.env.local` - 环境变量

## 环境变量 (.env.local)

```
# Database
DATABASE_URL="file:./dev.db"

# NextAuth
NEXTAUTH_URL=https://sumifypdf.com
NEXTAUTH_SECRET=<生成随机字符串>

# Google OAuth (从 Google Cloud Console 获取)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# DeepSeek API
DEEPSEEK_API_KEY=your-api-key

# 百度 OCR API
BAIDU_OCR_API_KEY=your-api-key
BAIDU_OCR_SECRET_KEY=your-secret-key

# 默认使用模型
DEFAULT_MODEL=deepseek-chat
```

生成 NEXTAUTH_SECRET：
```bash
openssl rand -base64 32
```

## 测试

1. 启动开发服务器：
```bash
cd projects/PDF-Guru-v2
npm run dev
```

2. 访问 `http://localhost:3000`

3. 点击右上角 "Google 登录" 按钮

4. 首次登录后，用户信息会存入数据库

## 生产环境部署

### 方案 1: 继续使用 SQLite（简单）

- 把 `prisma/dev.db` 文件上传到部署平台
- 设置环境变量 `DATABASE_URL`

### 方案 2: 使用 PostgreSQL（推荐生产）

1. 使用 Supabase / Neon / Railway 等托管 PostgreSQL
2. 更新 `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
3. 更新环境变量:
```bash
DATABASE_URL="postgresql://user:password@host:5432/dbname"
```
4. 运行 `npx prisma migrate deploy`

## 数据库模型说明

- **User**: 存储用户基本信息（名字、邮箱、头像、免费额度）
- **Account**: 存储 OAuth 账户信息
- **Session**: 存储用户会话

## 后续功能

可以基于数据库实现：
- 用户免费额度管理（每日限额）
- 用户历史记录
- 管理员功能
