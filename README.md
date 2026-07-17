# TKA 术后膝关节康复监测管理平台

Next.js 15 App Router 全栈项目，面向 TKA 术后家属端智能护膝自动上传、护士端实时康复监测、AI 异常预警和护理记录闭环。

## 技术栈

- Next.js 15 + TypeScript + App Router
- Tailwind CSS 4 + shadcn/ui 风格组件
- Supabase Auth + Postgres + Realtime
- Prisma 7 + @prisma/client + @prisma/adapter-pg
- Recharts 趋势图

## 核心页面

- `/`：平台首页
- `/login`：邮箱/密码登录与 family / nurse 角色选择，登录后自动跳转对应端
- `/register`：家属使用照护邀请码和邮箱验证码注册；护士账号不开放公开注册
- `/family`：家属端，模拟智能护膝每 5 秒自动上传屈曲角度、活动频次、训练时长、疼痛评分等数据，并显示护士端 AI 分析
- `/family/profile`：家属信息维护，保存到 `profiles`
- `/family/guidance`：家属查看护士远程指导历史，支持已读状态和 Realtime 同步
- `/family/devices`：家属手动绑定智能护膝设备，更新当前传感器设备 ID
- `/family/tcm-knowledge`：TKA 术后中医康复知识卡片专区
- `/appointments`：双端预约上门护理，家属提交预约，护士确认/拒绝/安排时间
- `/nurse`：护士端实时仪表盘，包含患者列表、趋势图、红色异常预警、一键远程指导、AI 智能分析和护理记录
- `/nurse/profile`：护士个人信息维护，保存到 `profiles`

## 本地运行

```bash
cd /d/网站项目/tka-rehab-platform
npm install
npm run db:generate
npm run dev
```

打开：

- `http://localhost:3000/family`
- `http://localhost:3000/nurse`

本地默认使用 `APP_MODE=demo` 的内存数据。生产模式不会回退到 Demo 数据。

## 配置 Supabase + Prisma

1. 复制环境变量模板：

```bash
cp .env.example .env
```

2. 在 `.env` 中填写 Supabase 项目的连接信息：

```bash
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
OPENAI_API_KEY="your-openai-api-key"
ANTHROPIC_API_KEY="your-anthropic-api-key"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

AI 智能分析优先使用 `OPENAI_API_KEY`，其次使用 `ANTHROPIC_API_KEY`；两者都未配置时会使用本地规则分析，便于 Demo 演示。

3. 生成 Prisma Client 并执行迁移：

```bash
npm run db:generate
npm run db:migrate
```

生产环境执行已生成迁移：

```bash
npm run db:deploy
```

4. 在 Supabase SQL Editor 执行 Realtime/RLS 配置：

```bash
psql "$DIRECT_URL" -f supabase/realtime.sql
```

也可以打开 Supabase SQL Editor，粘贴执行 `supabase/realtime.sql` 内容。该脚本会把 `profiles`、`appointments`、`ai_analyses`、`knee_data_records`、`nursing_records`、`alert_logs` 等表加入 Supabase Realtime publication，并开启演示用 RLS 策略。

## 本次迭代主要改进点

- 修复多端数据同步：统一订阅 `profiles`、`patients`、`knee_data_records`、`alert_logs`、`nursing_records`、`ai_analyses`、`appointments`，Demo 模式保留轮询兜底。
- 指标卡片增加康复科普弹窗：家属端和护士端可查看屈曲、伸直、频次、时长、疼痛、电量等指标说明和中医康复建议。
- AI 异常预警形成处理闭环：护士端“处理”弹窗支持远程指导、个性化建议、预约上门护理、填写处理记录，并自动关闭预警。
- 护理记录升级为 SOAP：支持 S/O/A/P 结构化记录、筛选、详情查看、倒序追踪，家属端指导页同步展示结构化内容。
- 深化关键交互：家属资料弹窗、指导历史筛选、预约处理弹窗、设备绑定/解绑/自检、中医知识收藏和已学习状态。
- 优化反馈与视觉：增加统一状态提示组件，整体背景与变量调整为医疗蓝白科技风格，关键页面保留成功/错误/同步状态提示。

## 数据库模型

模型位于 `prisma/schema.prisma`：

- `Profile`：患者/护士个人资料与传感器设备信息
- `Patient`：患者
- `KneeDataRecord`：膝关节护膝数据记录
- `NursingRecord`：护理记录与远程指导已读状态
- `Appointment`：上门护理预约
- `AiAnalysis`：AI 智能关节分析报告
- `AlertLog`：预警日志

迁移文件位于 `prisma/migrations/`，生产部署使用 `npm run db:deploy` 执行已生成迁移。

## 构建和生产运行

```bash
cd /d/网站项目/tka-rehab-platform
npm run lint
npm run build
npm run start
```

默认监听 `3000` 端口。手机和 PC 端访问同一域名即可，页面已按移动端和桌面端做响应式布局。

## 部署到域名

### 自托管 Docker（当前生产方案）

服务器使用 `compose.production.yml` 启动私有 PostgreSQL、Next.js 与 Caddy，
支持本地家属/护士正式账号、网关 Bearer Token、自动 HTTPS、日志轮转与每日备份。
完整环境变量、部署、验收和备份命令见 [`deploy/README.md`](deploy/README.md)。

```bash
docker compose -f compose.production.yml up -d --build
docker compose -f compose.production.yml exec -T app node deploy/verify-production.mjs
```

### Vercel

```bash
cd /d/网站项目/tka-rehab-platform
npm i -g vercel
vercel login
vercel
vercel env add DATABASE_URL production
vercel env add DIRECT_URL production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel --prod
```

在 Vercel 项目设置中进入 `Domains`，添加你的域名并按提示配置 DNS 记录。

### 云服务器 + PM2 + Nginx

```bash
cd /d/网站项目/tka-rehab-platform
npm install
npm run db:generate
npm run db:deploy
npm run build
npm install -g pm2
pm2 start npm --name tka-rehab-platform -- start
pm2 save
pm2 startup
```

如果需要指定生产端口，可使用：

```bash
PORT=3000 pm2 start npm --name tka-rehab-platform -- start
```

Nginx 反向代理示例：

```nginx
server {
  listen 80;
  server_name your-domain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

配置后执行：

```bash
nginx -t
systemctl reload nginx
```

建议再用 Certbot 配置 HTTPS：

```bash
certbot --nginx -d your-domain.com
```

部署完成后访问 `https://your-domain.com/login`，选择 patient 进入家属端，选择 nurse 进入护士端。Supabase Auth 需要提前在 Supabase 控制台创建测试邮箱/密码账号；未配置 Supabase 时可直接使用 Demo 模式验证页面、接口和移动端布局。
