# 系统代码审计与加固报告（2026-08-02）

## 1. 审计结论

本轮以 `main` 的 `1efe1c8` 基线为起点，在
`codex/system-audit-hardening` 分支完成全栈安全、数据隔离、稳定性、依赖、
Android 离线队列和部署配置审计。

- 共确认 15 项问题：P0 2 项、P1 6 项、P2 6 项、P3 1 项。
- 15 项均已完成代码修复或配置加固。
- Web/服务端自动化、类型检查、Lint、生产构建、Prisma 校验和依赖审计已通过。
- Android Lint 与 Debug APK 构建已通过；Windows 中文路径下的 Gradle 测试运行器
  无法加载测试类，GitHub Actions 已在 ASCII Linux 路径完成 JVM 测试和 Android verify。
- 本轮未执行生产数据库迁移和正式服务器部署。发布前必须先备份数据库，在预发布
  环境执行迁移并通过 GitHub CI，不应直接跳过这些步骤。

结论：Web Build 与 Android verify 已通过，代码可进入数据库迁移演练；在迁移演练和
生产备份完成前，不建议直接发布。

## 2. 项目与信任边界

- Web：Next.js 15 App Router、TypeScript、Prisma、PostgreSQL。
- 身份：本地签名 Cookie 或 Supabase；护士与家属共享应用，但数据权限不同。
- 硬件：Android 网关连接 WT9011DCL-BT50，通过独立 Bearer Token 上传真实帧。
- 部署：Docker Compose、PostgreSQL、Next.js、Caddy HTTPS。
- 关键资产：患者资料、训练与护理记录、传感器原始帧、设备位置绑定、账号凭据。

审计采用的核心规则：浏览器会话不能取得其他患者数据；家属只能访问显式关联的
患者；护士可访问临床工作区；网关令牌只能调用硬件采集链路；客户端不得把模拟值
或人工值声明为真实硬件数据。

## 3. 基线结果

修复前的功能测试、Lint 和生产构建可以通过，但依赖审计报告 8 个已知漏洞
（4 个高危、4 个中危）。代码与历史提交扫描未发现已提交的真实密钥；环境文件、
APK 和构建产物均处于忽略规则内。

## 4. 问题与修复

| ID | 级别 | 类型 | 影响 | 修复与验证 |
| --- | --- | --- | --- | --- |
| AUD-001 | P0 | 垂直越权 | Supabase 用户可通过可写的 `user_metadata.role` 或角色 Cookie 提升为护士。 | 只信任管理员控制的 `app_metadata.role`；Supabase 登录态禁止回退角色 Cookie；角色切换接口仅管理员可用。新增角色伪造回归测试。 |
| AUD-002 | P0 | 水平越权 | 家属数据读取未绑定账号与患者，未关联账号还可能回退到默认家属资料。 | `Profile` 增加 `patientId`；建立统一数据访问上下文；所有患者、设备、会话、样本、护理和分析 API 按显式患者关联过滤；未关联家属默认拒绝。新增隔离测试。 |
| AUD-003 | P1 | API 鉴权 | 中间件公开范围过宽，网关令牌可触达非采集接口，部分临床写操作缺少护士二次校验。 | 改为公开接口和网关接口精确白名单；护士写操作在中间件和路由内双重校验。 |
| AUD-004 | P1 | CSRF / 跳转 | Cookie 写请求未统一校验同源，重定向依赖转发 Host。 | Cookie 写操作强制严格同源；重定向从可信 `request.nextUrl` 克隆，避免外部 Host 注入。 |
| AUD-005 | P1 | 账号生命周期 | 禁用账号可走重置流程重新激活；改密后旧本地会话仍有效。 | 禁用账号不发重置邮件且不能重置；会话带 `issuedAt`，账号更新时间可使旧会话失效；改密后清除会话与角色 Cookie 并要求重新登录。 |
| AUD-006 | P1 | 数据串线 / 竞态 | 并发设备换绑可同时留下多个活动绑定，旧会话仍可能接收新患者帧。 | 绑定事务加入 PostgreSQL advisory lock；换绑时结束旧活动会话；迁移清理重复绑定并建立部分唯一索引。 |
| AUD-007 | P1 | 数据来源可信度 | 生产模拟器和通用记录接口可能生成或接受伪装为 `HARDWARE` 的数据。 | 生产环境关闭模拟器；通用记录只接受人工来源；真实硬件来源只允许从网关采集路径形成。新增来源回归测试。 |
| AUD-008 | P1 | Android 性能 / 可用性 | 每写入或确认一帧都扫描、排序最多 5 万个离线文件，长任务会明显卡顿。 | 离线队列启动时构建 `TreeMap` 索引，追加、读取、确认改为增量 O(log n)；保持逐帧加密与重启恢复。 |
| AUD-009 | P2 | 暴力尝试 | 注册邀请码检查早于限流，注册完成接口缺少足够的 IP+邮箱组合限制。 | 限流先于邀请码判断；注册完成增加 IP+邮箱窗口限制，成功后清理对应计数。 |
| AUD-010 | P2 | 资源消耗 | 关键 JSON、原始帧和校准基线缺少统一体积与数组上限，第三方响应也可过大。 | 关键请求增加 32KB 原始 JSON、批量 100 帧、字符串和嵌套数组上限；Android 平台响应限制为 256KB。 |
| AUD-011 | P2 | 阻塞与重复任务 | 数据保留清理可在多次请求中同步重复触发，放大数据库压力。 | 清理改为全局单飞、每小时最多触发一次的非阻塞任务。 |
| AUD-012 | P2 | 信息泄漏 | 邮件、AI 和数据库异常可能将上游响应体或内部错误返回客户端/日志。 | 对外统一安全错误；日志只保留错误类型和经过约束的消息，不记录上游响应正文。 |
| AUD-013 | P2 | 部署加固 | 应用容器以 root 运行，IP HTTP 入口未统一跳正式域名，生产 CSP 允许过宽连接与 `unsafe-eval`。 | 容器切换非 root 用户；Caddy 将 IP HTTP 跳转正式 HTTPS；生产移除 `unsafe-eval`，浏览器连接源仅 self 与已配置 Supabase。 |
| AUD-014 | P2 | 供应链 | Next.js、Prisma、PostCSS、Sharp 存在 8 个已知依赖漏洞。 | 升级 Next.js/Prisma 并约束传递依赖；`npm audit --audit-level=moderate` 结果为 0。 |
| AUD-015 | P3 | CI 门禁 | CI 不会因新依赖漏洞而失败。 | GitHub Build 增加中危及以上依赖审计步骤。 |

## 5. 主要修改范围

- 身份与访问：`middleware.ts`、`src/lib/auth.ts`、`src/lib/local-auth.ts`、
  `src/lib/server-access.ts`、`src/lib/access-control.ts`、认证 API。
- 患者数据：dashboard、patients、profile、appointments、nursing、alerts、devices、
  bindings、calibrations、sensor sessions/samples、AI 和 knee records API。
- 数据库：`prisma/schema.prisma`、
  `prisma/migrations/20260802120000_add_patient_account_scope/migration.sql`、
  `deploy/seed-production.sql`。
- Android：`EncryptedSampleQueue.java`、`PlatformGateway.java`。
- 部署与供应链：`Dockerfile`、`deploy/Caddyfile`、`next.config.ts`、
  `package.json`、`package-lock.json`、`.github/workflows/ci.yml`。
- 自动化：新增身份、访问控制、请求安全、请求限额、模拟器和来源边界测试。

## 6. 验证结果

| 检查 | 结果 |
| --- | --- |
| Web/服务端测试 | 68/68 通过（51 runtime、9 gateway、8 API） |
| TypeScript | `npx tsc --noEmit` 通过 |
| ESLint | `npm run lint` 通过 |
| Next.js 生产构建 | `npm run build` 通过，48 路由 |
| 本地启动冒烟 | Demo 配置启动成功，`/api/health/live` 返回 `live`，`/login` 返回 200 |
| Prisma | generate 与 validate 通过 |
| 依赖漏洞 | 0 个中危及以上，`npm audit` 通过 |
| Android 静态与构建 | `:app:lintDebug`、`:app:assembleDebug` 通过 |
| Android JVM 测试 | 本地中文路径 Gradle worker 无法加载测试类；GitHub Actions verify `30755502166` 通过 |
| GitHub Web Build | Actions `30755502168` 通过 |
| Docker Compose 展开 | 本机未保存 `.env.production`，无法展开；必须在服务器发布前执行 `docker compose config --quiet` |
| 密钥扫描 | 当前文件、Git 跟踪文件和提交历史未发现真实密钥 |

## 7. 发布步骤

1. Web Build 与 Android verify 已通过；将 PR 保持为草稿直至迁移演练完成。
2. 在生产变更窗口开始前记录当前提交和镜像，并生成 PostgreSQL 自包含备份。
3. 在预发布数据库执行 `npm run db:deploy`，确认重复活动绑定清理结果符合预期。
4. 运行生产构建、健康检查、家属隔离、护士权限、网关鉴权和同源写请求冒烟测试。
5. 生产执行数据库迁移并滚动重建应用；迁移期间暂停设备换绑操作。
6. 为所有现有家属账号明确设置 `Profile.patientId`；Supabase 角色只写入
   `app_metadata.role`。
7. 发布后复测登录、改密强制重登、跨患者拒绝、设备换绑和真实双传感器上传。

## 8. 回滚方案

### 应用回滚

保留部署前提交号和镜像。若应用验收失败，将工作树或镜像恢复到部署前提交，重新
构建应用容器，并再次运行健康检查。不要用回滚应用的方式自动回滚数据库。

### 数据库回滚

本次迁移会把重复活动绑定中较旧的记录设为非活动。只有部署前数据库备份能够完整
恢复这些业务状态，因此首选整库恢复。以下 SQL 只能撤销新约束和字段，不能恢复被
迁移清理的重复绑定：

```sql
DROP INDEX IF EXISTS "device_bindings_one_active_per_placement";
DROP INDEX IF EXISTS "device_bindings_one_active_per_device";
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_patient_id_fkey";
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_patient_id_fkey";
DROP INDEX IF EXISTS "appointments_patient_id_created_at_idx";
DROP INDEX IF EXISTS "profiles_patient_id_idx";
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "patient_id";
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "patient_id";
```

如果迁移后的数据隔离或绑定状态异常，应停止写入、保留故障库副本，再从部署前
`pg_dump -Fc` 备份恢复；不要在仍有 Android 网关上传时覆盖数据库。

### 会话兼容说明

新版本会主动使旧格式本地会话失效，用户需要重新登录。这是安全变更，不应通过
恢复旧 Cookie 格式来回滚。若回滚应用，已修改的密码仍以数据库为准。

## 9. 剩余风险与后续任务

1. 本地 Cookie 中间件不查询数据库；账号被禁用或改密后，旧会话可能暂时打开页面
   外壳，但受保护数据 API 会拒绝访问。长期方案是服务端会话表和会话版本号。
2. 限流器和 SSE 事件总线仍是单进程内存实现；水平扩容前需迁移到 Redis 或数据库。
3. 新注册家属账号默认不关联患者，这是安全的 fail-closed 行为，但需要管理员关联
   界面或受控邀请流程降低运维成本。
4. 数据库迁移尚未在生产副本演练；本机 Android JVM 测试仍受中文路径限制，但同一提交的 GitHub Actions 已通过。
5. 真实传感器、弱网补传、长时任务和算法有效性仍需实物验收；本报告不等同于
   医疗器械、临床准确性或渗透测试认证。
6. 凡曾在聊天、截图或工单中暴露过的生产口令与 API Key 都应轮换，即使仓库扫描
   没有发现它们。

## 10. 2026-08-05 公开邮箱注册补充

按产品要求取消照护邀请码。注册页面与 API 只需要邮箱、6 位验证码、姓名和安全
密码，仍然只能创建家属账号。发信与注册尝试分别使用 IP 和邮箱双层限流；邮箱
服务未配置时继续 fail-closed。新账号不会继承任何已有患者，患者数据访问仍由
`Profile.patientId` 显式关联控制。

该补充已随 PR #43 合并提交 `ff0e3fec3e0255eb7decfb1b0def4a510d6675f5`
部署生产。发布前数据库备份已通过恢复目录校验，患者范围迁移和设备绑定唯一约束
已生效；公网注册页、邮件验证码发送接口和生产验收脚本均已验证。
