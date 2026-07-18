# 项目状态与 Agent 交接

最后更新：2026-07-18

本文件是所有本地和云端 Agent 的统一进度来源。每次代码任务结束前，
必须更新“已完成事项”“当前状态”“下一步任务”和“Agent 工作记录”，
并将本文件与代码放在同一个提交或 Pull Request 中。

## 总体目标

建设一套可直接交付使用的 TKA 术后膝关节康复产品，形成以下闭环：

1. WT9011DCL-BT50 等真实传感器采集患者动作数据。
2. 患者附近的手机、电脑或硬件网关解析、缓存并上传真实数据。
3. 系统进行训练评估、异常预警和数据追踪。
4. 护士查看患者、处理预警、填写 SOAP 护理记录并下发指导。
5. 家属查看训练结果、护理指导、设备状态并发起预约。
6. 所有关键操作可验证、可追踪，并能稳定部署到正式服务器。

## 已完成事项

### 产品与业务闭环

- 已建立家属端、护士端、角色登录和路由保护。
- 已完成患者资料、家属指导、护理预约、异常预警和 SOAP 护理记录流程。
- 已提供 AI 分析与本地规则分析的回退机制。
- 已提供无数据库时可运行的 Demo 模式。
- 已将家属端、护士端、设备演示页与共享控件升级为统一的临床工作台视觉：白底、海军蓝、医疗青绿、紧凑信息卡和移动端底部导航；修复硬件演示页首屏时间导致的 hydration 与重复列表键警告。
- 已实现邀请码保护的家属邮箱注册：6 位验证码、10 分钟过期、60 秒重发、频率/错误次数限制、验证码哈希、PBKDF2 密码哈希、数据库账号与注册后自动登录；护士账号不开放公开注册。

### 维特智能硬件基础

- 已加入设备、绑定、校准、采集会话和传感器样本的数据模型及迁移。
- 已完成设备绑定、校准、心跳、采集会话和样本上传 API。
- 已完成双传感器硬件演示页和本地 API 模拟器。
- 已在家属端和护士端增加硬件页面入口。
- 已保留数据来源字段，用于区分模拟数据与真实硬件数据。
- 已将默认设备型号调整为 `WT9011DCL-BT50`，同时保留后台对旧型号字符串的兼容。
- 已完成官方 BLE SDK 输出键的标准化契约、双传感器配对核心、离线队列参考实现和上传客户端。
- 已为 BLE 记录、WIT 数据帧和断网队列增加自动化测试。
- 已创建原生 Android BLE 网关工程：封装官方 SDK 的扫描、连接、双传感器位置分配和零点命令；读取官方实时键值后先写入加密离线日志，再调用平台设备、绑定、会话和样本 API 上传。
- 已配置 JDK 17、Android Platform 35、Build Tools、ADB 与 Gradle 8.7 Wrapper；官方 WitSDK 支持 Git 或 GitHub API 同步，Android Debug APK 已在 Windows 完整编译成功并核验包名、SDK 版本和蓝牙权限。
- 已完成 Android 网关 v0.2 稳定性修复：首次授权后自动续扫、蓝牙/定位前置检查、SDK 监听器释放、重复连接清理、Android 7 时间格式兼容、每传感器 10Hz 限流、15 秒离线补传、损坏队列隔离，以及按样本原患者恢复设备绑定与采集会话。
- 已增加 Android 无 USB 云端验证和发布加固：JVM 测试、Android Lint、Debug/Release 构建、R8 混淆与资源缩减、zipalign，以及 APK v2/v3 与 v4 `.idsig` 签名生成和核验脚本。
- 已增加 Android 安装自检：在无需 USB 的手机安装场景中逐项显示 BLE 硬件、蓝牙、权限、定位、加密离线队列和平台配置是否就绪；自检通过只代表可以开始扫描，不会把未连接的传感器误标记为可用。
- 已修复硬件演示来源污染：模拟器会话、原始样本和派生康复记录统一标记为 `DEMO`，模拟设备使用 `SIM-` 序列号；真实 Android BLE 网关仍使用 `HARDWARE`，避免模拟值伪装为真实设备数据。
- 已归档 WT9011DCL-BT50 官方规格书、BLE 5.0 协议、SDK 与操作资料的项目化摘要：包含字段缩放、寄存器读取、命令安全边界、坐标系、双传感器验收和来源规则，后续 Agent 不必重新从官方目录开始检索。
- 已加固 Android 启动诊断：崩溃记录改为同步 `commit()` 并额外写入本地文件；增加 pending-launch 标记，覆盖 native 崩溃/系统杀进程且无 Java 堆栈的情况；`MainActivity` 先渲染界面再初始化 SDK，避免启动期黑屏即退。
- 已修复真机扫描链路：定位服务检测兼容国产机（GPS/网络/总开关）；从系统设置返回后自动继续扫描；权限回调以真实权限状态为准；设备名过滤兼容 `WT`/`BWT`/`901`；扫描状态文案区分“缺定位”和“缺权限”。
- 已在用户 Android 真机完成单只实物扫描与连接验收：发现广播名 `WT901BLE67`、地址 `D7:0F:8A:DA:BE:DB`，并成功连接。
- 已修复“连接后看不到持续数据”：实时读数改为连接后直接显示，不再依赖“开始采集”。
- 已将 Android 网关主界面改为接近官方维特数据页的实时看板：大腿/小腿分卡，分别显示 Acc / Gyro / Angle 的 X/Y/Z，连接状态与帧数摘要置顶。
- 已增加官方风格可视化：每传感器 3D 姿态立方体（欧拉角驱动）、Acc/Gyro/Angle 三路滚动波形、圆角临床风 UI 与状态色条。
- 已为 Android 与共享网关生成稳定 `gatewaySampleId`，并在数据库增加唯一约束；样本、会话计数、设备心跳、临床聚合和预警在同一事务中提交，断网重试不会重复入库或重复计数。
- 已增加生产网关 Bearer Token 边界：`APP_MODE=production` 必须配置至少 24 字符的 `GATEWAY_API_TOKEN`，采集会话与样本写接口会拒绝未授权上传；Demo/LAN 联调保持无令牌可用。
- 已将运行时、网关、样本幂等与临床数据边界测试纳入 `npm test` 和 GitHub Build 门禁。
- 已新增 Web 康复指标引擎：以双传感器质量门为前提，计算鲁棒 ROM、峰值屈曲、伸直缺失、完整屈伸次数、有效活动时间、目标完成度、近期趋势与可解释风险分；疑似跌倒/强冲击仅作为实验性人工复核提示，公式与临床安全边界归档于 `docs/REHAB_METRICS_SPEC.md`。
- 已建立无需服务器的单传感器证据闭环：Android v0.4 可在连接真实 BT50 后独立开始/结束本地任务，以 2Hz 将真实 Acc/Gyro/Angle 与连接、数据间断、长时间静止、强运动等工程事件加密持久化；中断任务会在下次启动恢复并封存，用户可显式导出标准 JSON 证据包。Web `/evidence` 可严格校验 `HARDWARE` 证据包、回放姿态、核对统计、确认/处理事件，并导出带处理记录的闭环报告。契约、阈值与验收流程归档于 `docs/LOCAL_EVIDENCE_LOOP.md`。
- 用户已确认 Android App 可同时连接两只传感器，并能在 App 与网站看到实时数据；在此基础上已完成同帧可信链路：大腿/小腿分别以 2Hz 独立入队，每帧携带稳定 `gatewaySampleId` 与设备内 `captureSequence`，服务器回传接收时间和 9 个原始运动数值，App 逐项校验一致后才删除离线队列；同一 ID 若携带不同数值会返回冲突。
- Web `/sensor-live` 已升级为事件流触发、1 秒轮询兜底的实时看板，明确展示 App 样本 ID、序号、手机采集时间、服务器接收时间、采集到网页的端到端延迟和完整性状态；两只传感器都来自 `HARDWARE`、回执为 `MATCHED` 且当前帧不超过 2 秒时才显示“实时达标”，超时会显式降级。
- Web 已加入 Three.js 双传感器实时 3D 姿态，模型与数值卡均读取同一回执样本的 Roll/Pitch/Yaw、Acc 和 Gyro；风险区域改为“基础输入→质量门→风险加分→结果与人工动作”的可追踪链路。Android 默认界面改为三步普通用户流程，专业 Acc/Gyro/Angle 曲线和管理员平台配置默认收起，保留按需展开能力。

### Agent 与云端开发

- 已创建项目级 `AGENTS.md`。
- 已创建并同步 `.agents/skills` 与 `.codex/skills` 项目技能。
- 已配置 GitHub Codespaces、Node.js 22 和自动开发服务。
- 已配置 GitHub Actions 自动执行依赖安装、代码规范检查和正式构建。
- 已完成 GitHub 推送和手机 Codex 的 GitHub 授权。
- 已启动 Codex Cloud 环境验证，电脑无需持续在线。

### 安全边界

- `.env`、软件著作权材料、研究数据和 PPT 临时文件不会上传公开仓库。
- GitHub 仓库当前为公开仓库，真实密钥必须放入受控环境配置。
- WT9011DCL-BT50 的 BLE 连接必须由患者附近的 Android 手机完成，云端容器不能直接读取蓝牙。

## 当前状态

- 默认分支与当前交付基线：`main`；实时可信链路与生产验收自动化已分别通过 PR #23、PR #24 合并。
- GitHub 仓库：`https://github.com/Zh666666666/-`
- 运行时边界：`APP_MODE=demo` 始终走内存数据；生产缺数据库、网关令牌或完整的本地/Supabase 认证配置时 fail-closed（503）。
- 健康检查：`/api/health/live` 与 `/api/health/ready` 已可用。
- 验证状态：37 项运行时/网关/API 测试、`lint`、生产 `build` 与 Android Debug 构建通过；PR #23 的 Linux GitHub Build 和 Android verify 全部通过，涵盖 JVM 测试、Android Lint、Debug/Release、R8、zipalign 与 v2/v3/v4 签名校验。浏览器使用真实双传感器格式并发帧完成 2 秒链路验收。
- 云端无密钥时：使用 Demo 模式。
- 目标型号：传感器外壳已确认标注为 `WT9011DCL-BT50`；用户已确认项目 Android 网关可同时连接两只实物，并在 App 与网站看到实时数据。已知其中一只广播名为 `WT901BLE67`、地址为 `D7:0F:8A:DA:BE:DB`；地址与广播名仍不能当作已验证的厂商序列号。
- Android 网关：v0.4.0（`versionCode=4`），最低 Android 7.0（API 24）、目标 API 35；Debug 包名 `cn.tkarehab.gateway.debug`。本地证据任务不要求平台配置；Debug 仍允许可选的局域网 HTTP 上传，Release 继续禁止明文 HTTP。
- Android v0.3 保留升级前的加密离线队列并继续补传；不得因无法区分测试/真实数据而自动删除旧样本。新采集样本使用稳定幂等 ID。
- 单传感器 `confidence=0.35` 只保存原始 `HARDWARE` 样本，不生成临床趋势或预警；双传感器可信角度（>=0.7）按 10 秒聚合，ROM 同类预警 30 分钟冷却。
- 网站实时看板：`/sensor-live` 使用同进程 SSE 样本事件立即触发刷新，并以 1 秒轮询兜底；当前单实例生产形态可工作，多实例扩容前需把事件总线迁移到 Redis/Postgres/Supabase。页面展示双传感器 Three.js 3D、Acc/Gyro/Angle、同帧 ID/序号、服务端回执与端到端延迟。
- Web 指标公式：`GET /api/sensor-samples` 同步返回 `metrics`；至少 5 个置信度不低于 0.7 的双传感器角度且质量分不低于 55 时才输出 ROM 和风险分。当前阈值已完成软件测试，尚未完成第二只实物传感器、量角器和真实 ADL/跌倒误报验证。
- 本机联调地址：`http://192.168.31.203:3000`；Demo 患者 ID：`demo-patient-1`。
- Android 35 模拟器内已实际点击“测试平台连接”和“开始采集上传”，分别显示 `平台连通正常：ready / mode=demo` 与 `平台已连通（demo），开始上传队列 0 条…`。
- 平台侧硬件上传链路已通过：device → binding → HARDWARE session → sample → live board / dashboard；781 条低置信积压通过真实 HTTP API 验证不会生成临床记录/告警，高置信数据按 10 秒聚合。
- 正式服务器：`103.242.13.17` 已部署 Docker Compose 生产栈（PostgreSQL、Next.js、Caddy），本地签名角色会话、业务 API 保护、网关 Bearer Token、日志轮转、每日备份、防火墙与仅密钥 SSH 均已验证；系统安全更新和重启恢复通过。`www.dorianaistudio.cloud` 已解析至正式服务器并取得有效 HTTPS 证书，裸域自动跳转至 `www`。
- 实时可信链路已部署到正式服务器：部署前数据库备份成功，容器重建后健康；生产验收脚本已通过健康、角色隔离、受保护数据、网关鉴权、登录态 `/sensor-live` 页面和 SSE `ready` 事件检查。软件格式双路并发验收约 0.37-0.41 秒入库、约 1.17 秒到网页；该结果不能替代用户手机网络下的连续实物验收。
- 当前可安装的 Android Debug APK 为 `mobile-gateway-android/app/build/outputs/apk/debug/app-debug.apk`，大小 6,330,513 字节，SHA256 为 `4E74AC16C1F8207DF5BBBF534977F7182C81AFD71C573982D287B88F19400891`。2026-07-18 最终核验时生产 `sensor_samples` 表为 0 条，说明最新版 App 尚未向正式服务器提交实物帧；在双实物 10 分钟验收完成前，不得把软件格式帧或历史 Demo 显示描述为真实回传已达标。
- 生产数据边界：数据库只初始化正式患者骨架，不包含模拟传感器样本；家属/护士账号分离，业务 API 需有效会话，硬件上传使用独立 Bearer Token。
- 邮箱注册已在生产启用并由用户确认合格：`updates.dorianaistudio.cloud` 的 Resend DKIM/SPF 已验证，API Key、发件地址和随机照护邀请码仅保存在服务器/本机私密环境；家属验证码注册、自动登录与再次登录链路可用。
- 仓库结构缺口：外层仓库将 `tka-rehab-platform` 记为 gitlink，且缺少 `.gitmodules`，交付时需固定到应用仓库提交。
- 当前产品性质：已具备单传感器、无服务器的软件闭环能力；真机扫描、连接和实时读数已由用户确认，新版“采集→加密封存→导出→Web 回放→事件处理→报告”仍需在用户现有实物上完成一次端到端验收。该闭环只输出工程事件和原始姿态证据，不宣称临床 ROM、跌倒诊断或医疗预警有效性。

## 下一步任务

按优先级从上到下执行：

1. **P0 - 安装最新版 Android APK 并完成双实物验收**
   - 代码、CI 与生产部署已完成；安装本轮 Android APK，使用两只实物连续训练至少 10 分钟，逐只核对 App 与 Web 的样本序号、ID 尾号和 Acc/Gyro/Angle，统计 2 秒达标率、断网补传和重连恢复情况。
   - 若手机与服务器时钟偏差超过 1 秒，先启用系统自动时间；不得用隐藏负延迟或放宽阈值的方式伪造达标。
2. **P0 - 双传感器 ROM 对照验收**
   - 固定大腿/小腿安装轴向，完成双设备归零；用量角器在 0°、30°、60°、90°、110° 各重复 5 次，记录偏差并调整安装/标定，不直接用风险公式掩盖姿态误差。
3. **P0 - 真实风险链路验收**
   - 使用真实双传感器训练样本验证“基础输入→质量门→风险因子→预警动作”；分别制造数据中断、低幅无完整重复和趋势下降测试条件，确认原因、分值和处置文案可回溯，疑似跌倒仅做人工复核实验。
4. **P1 - 本地证据与 Web 处理真机验收**
   - 结束一段双传感器任务并导出证据包，在 `/evidence` 导入、处理事件、刷新并导出复核报告，保存原包与报告 SHA256。
5. **P1 - 单机任务管理与交付易用性**
   - 增加本机历史任务列表、存储占用、删除确认和导出失败提示；整理一页式安装/采集/导入说明，避免交付时依赖开发人员口头指导。

## Agent 工作记录

| 日期 | 已完成事项 | 当前状态 | 下一步任务 | 验证 |
| --- | --- | --- | --- | --- |
| 2026-07-18 | 核对 GitHub 合并状态、正式健康检查和本地 APK 交付物，并记录 APK 哈希与生产样本边界 | `main` 已包含 PR #23/#24；生产 ready，实时页/SSE 自动验收通过；生产库当前 0 条实物样本，因此真实双传感器回传仍明确标记为待验收 | 将指定哈希的最新版 APK 安装到 Android 手机，连接两只 BT50 后连续上传 10 分钟并核对网页同帧凭证 | `git status` clean；PR #23/#24 merged；`/api/health/ready` 200；生产 SQL `sensor_samples` = 0；APK SHA256 已核对 |
| 2026-07-18 | 合并并部署实时可信链路；生产重建前完成数据库备份，并把登录态实时页与 SSE `ready` 事件加入生产验收脚本 | PR #23 的 Build/Android verify 全绿；生产健康、角色隔离、网关鉴权和实时入口通过，软件双路链路约 1.17 秒；两只实物连续运行仍需用户手机验收 | 安装最新版 APK，完成双实物 10 分钟、断网补传、重连恢复和量角器验收 | GitHub Actions Build 1m7s、Android verify 3m2s；`verify-production.mjs` 通过；`/api/health/ready` 200；备份 `tka-rehab-20260718T071005Z.dump` |
| 2026-07-18 | 修复双传感器共用上传节流，建立样本 ID/序号/9 个原值的服务器回执与 App 严格校验；新增 SSE+1 秒兜底、2 秒实时状态、Three.js 双 3D、风险四步链路和 Android 普通模式 | 软件闭环通过；本地并发帧接收约 0.37–0.41 秒、网页约 1.17 秒并显示双路一致；生产与两只实物连续运行尚待本 PR 合并部署后复验 | 推送 PR、通过 Linux Android CI，随后部署生产并做双实物 10 分钟/量角器验收 | `npm test` 37/37、Lint、Next Build、Android Debug BUILD SUCCESSFUL；Android JVM 测试使用真实 `org.json`；390px 无横向溢出，WebGL 画布 343×330，浏览器同帧双路 2 秒达标 |
| 2026-07-18 | 验证 Resend 发信子域并在生产配置 Sending-only API Key、发件地址和随机照护邀请码，重新构建并开放家属邮箱注册；清除传输临时文件和测试验证码记录 | 生产容器/数据库健康，登录客户端已编译注册链接，邀请码门禁返回 403，Resend 官方投递测试地址返回 200 且响应不泄露验证码 | 用户使用真实邮箱完成收码、注册、自动登录和再次密码登录验收 | `verify-production.mjs` 通过；生产健康 200；客户端开关均为 `true`；Resend 测试发送 200；测试记录 `DELETE 1` |
| 2026-07-17 | 实现家属邮箱验证码注册、数据库账号、邀请码门禁、验证码/密码哈希、频率限制、自动登录和登录页入口；护士注册保持关闭 | 36 项测试、Lint 和 40 路由生产构建通过；生产邮件开关等待 Resend 域名/API Key | 配置 Resend 发送子域并完成真实邮箱端到端验收 | `npm test` 36/36、`npm run lint`、`npm run build`、`npm run db:generate` |
| 2026-07-17 | 完成 Cloudflare DNS 切换、`www` 自动 HTTPS、裸域证书及永久跳转，并从公网复验正式健康检查和角色登录闭环 | 生产域名已上线，DNS、TLS、数据库、认证和网关鉴权正常 | 使用 Android 网关将平台地址切换为正式 HTTPS 并完成真实样本上传验收 | Cloudflare DoH：根域/`www` 均为 `103.242.13.17`；HTTPS 200、证书校验 0；外网生产验收脚本通过 |
| 2026-07-17 | 建立香港云服务器自托管生产环境：PostgreSQL、Next.js、Caddy、本地签名角色认证、API/网关鉴权、正式空数据种子、日志轮转、每日备份、防火墙、仅密钥 SSH 与系统安全更新 | IP 生产闭环及重启恢复已通过；`www` DNS 仍指向旧 Vercel，HTTPS 等待 DNS 修改 | 修改 `www` A 记录并完成域名 HTTPS、浏览器与 Android 网关验收 | Linux Docker 生产构建；`verify-production.mjs` 两次通过；最新内核启动、0 待更新包、容器/备份定时器自动恢复 |
| 2026-07-09 | 建立 BWT901CL 数据模型、API、模拟器、硬件演示页和双端入口 | 硬件软件骨架可演示，尚未接入实物 | 开发真实硬件接入助手并等待设备联调 | `npm run lint`、`npm run build` 通过 |
| 2026-07-09 | 配置 AGENTS、项目 Skills、Codespaces、Codex Cloud 和 GitHub CI | 手机可启动云端任务，电脑可离线 | 验证云端修改、测试和 PR 闭环 | GitHub Actions 通过 |
| 2026-07-09 | 增加统一项目状态文档和强制更新检查 | 后续代码任务必须同步进度记录 | 在下一次云端编码任务中验证 Agent 遵循规则 | 本地检查及 GitHub CI 全部通过 |
| 2026-07-09 | 目标传感器调整为 WT9011DCL-BT50，并将接入方案从蓝牙串口改为 Android BLE 5.0 | 后台兼容两种型号，BLE 数据契约、离线队列和上传核心已建立，原生 Android 壳尚未开发 | 集成官方 `wit-sdk.aar` 并完成双设备连接页面 | 6 项网关测试、状态检查、Lint、构建及移动页面检查通过 |

| 2026-07-10 | 创建 `mobile-gateway-android` 原生网关：官方 SDK 封装、双设备位置分配、零点校准、加密离线日志和平台 API 上传 | 代码尚未在 Android SDK/JDK 或实物 WT9011DCL-BT50 上编译验证；Next.js 侧网关测试可运行 | 同步官方 SDK，在 Android Studio 编译并于传感器到货后完成真机联调 | `npm run gateway:test`、`npm run check:status`、`npm run lint`；Android 构建待本机安装 Android 工具链 |
| 2026-07-10 | 升级共享视觉基座及家属端、护士端、设备演示页为临床工作台风格 | 已在桌面与手机视口检查核心页面；保留原有业务与硬件演示行为 | 继续完善其余业务页并结合真实账号、服务器和硬件进行交付验收 | `npm run lint`、`npm run build`、桌面与手机浏览器检查 |
| 2026-07-10 | 建立 Android 本地工具链与可重复构建：修复非 ASCII 路径、Library 插件、Kotlin 依赖和加密文件异常声明，生成 Gradle Wrapper 与 Debug APK | APK 已编译并核验清单，当前没有连接 Android 真机，传感器也尚未到货 | 安装 APK 到 Android 手机，随后用单只 WT9011DCL-BT50 验证扫描、连接和真实样本上传 | `build-debug.ps1 -SkipSdkSync`、`aapt dump badging`、`adb devices -l` |
| 2026-07-10 | 修复 Android 首次扫描、系统开关、监听器、重复连接、Android 7 时间、离线重试及跨患者队列问题；增加中文操作界面、R8 与 v2/v3/v4 签名及无 USB Actions；将网关测试改为无 IPC 启动 | 代码与脚本静态检查及 6 项网关测试通过，Android Actions 与签名产物待 PR 验证；仍未做手机和传感器实测 | 完成 PR 云端构建，配置长期 release keystore，并在手机安装产物验证真实 BLE | `npm run gateway:test`（6/6）、`npm run lint`、`npm run check:status`、`bash -n`、`git diff --check`；Android CI 待运行 |
| 2026-07-10 | 生成长期 Release 签名证书并将密钥材料配置为 GitHub Secrets；云端流水线生成可安装 APK、v2/v3 签名凭据和 v4 `.idsig`，本地以 Android APK 签名库实际验证 v4 | 远端签名产物已验证；新增加的脚本化 v4 校验待本 PR 的 Android Actions 验证；没有 USB 时仅能验证构建与安装包，BLE 真机行为仍待手机和传感器 | 完成 v4 校验 PR；从 Actions 下载 APK 到手机进行无需 USB 的启动、权限和基础页面检查 | `Android Gateway #29083371917` 成功；`VerifyV4Signature` 输出 `Overall verified: true`、`Verified using v4 scheme: true` |
| 2026-07-10 | 合并 APK v4 签名校验脚本；云端完整执行临时与长期证书签名、R8、zipalign、v2/v3 和 `.idsig` 的密码学校验，并上传无 USB 测试包及正式 Release 产物 | Release APK 已由长期证书签名；尚未安装到 Android 手机，亦未与真实传感器联调 | 从 GitHub Actions 下载 Debug 或 Release APK 到手机，验证启动、权限与基础页面；传感器到货后执行 BLE 实机验收 | `Android Gateway #29085556867` 两个 job 成功；产物 `TKA-Gateway-v0.2.0.apk.v4-verify.txt` 为 `Overall verified: true`、`Verified using v4 scheme: true` |
| 2026-07-10 | 增加 Android 安装自检和 JVM 覆盖：将 BLE、蓝牙开关、权限、定位、离线队列及平台配置的状态集中显示，明确区分“可扫描”与“已连接真实传感器” | 已通过 Android CI；尚未在 Android 手机或实物 WT9011DCL-BT50 上运行 | 从 Actions 下载新 APK，在手机运行安装自检并保存结果；设备到货后再验证扫描、连接和上传 | `Android Gateway #29087162196` 成功；JVM 测试、Lint、Debug/Release 构建和 v4 校验通过 |
| 2026-07-10 | 使用长期 Release 证书重新构建包含安装自检的 APK | 已生成可下载的正式签名 APK；仍只验证了云端构建，未把真实设备状态伪装为已验证 | 在 Android 手机安装 Release，依次运行安装自检、授权扫描和实际 WT9011DCL-BT50 联调 | `Android Gateway #29087347840` 的 `verify` 与 `signed-release` 均成功 |
| 2026-07-10 | 修复硬件模拟器将生成值标记为 `HARDWARE` 的来源污染；为会话、样本和康复记录统一传递 `DEMO`，并增加来源解析回归测试 | 已通过本地网关回归、Prisma 生成、Lint、生产构建和 GitHub Build；历史生成记录不应被重新宣称为真实硬件数据，生产库仍待执行迁移 | 服务器恢复后执行 `npm run db:deploy`；传感器到货后用 Android BLE 网关生成首批 `HARDWARE` 实测样本 | `gateway:test`（8/8）、`npm run db:generate`、`npm run lint`、`npm run build`、PR #6 Build 成功 |
| 2026-07-11 | 读取并归档 WT9011DCL-BT50 官方规格书与 BLE 5.0 协议，记录真实设备已在官方 App 成功连接的证据、协议歧义和项目验收步骤 | 官方 App 已证明一只设备可输出实时数据；项目 Android 网关、两传感器同步、安装轴向、零点校准和真实上传尚未验证 | 按归档中的单设备验收记录采集真实 SDK/原始帧证据，再进行双传感器膝关节校准 | `docs/WITMOTION_WT9011DCL_BT50_REFERENCE.md`；官方规格书与 BLE 协议页面人工核对 |
| 2026-07-11 | 收到 Android Debug APK 真机启动即退反馈；将官方 WitSDK 启动期初始化改为可隔离、可展示错误原因的路径，防止 SDK 异常直接关闭界面 | 新 APK 尚待同一台 Android 真机安装复测；当前不能声称 BLE 已可用 | 构建新 Debug APK，确认应用可打开并收集安装自检或 SDK 初始化错误信息 | Android 编译、JVM 测试、Lint 与 GitHub Actions 待本次变更完成后验证 |
| 2026-07-11 | 在 Android 15 模拟器安装 Debug APK 后复现启动失败：先定位 `cn.tkarehab.gateway.debug.MainActivity` 不存在，再由 `logcat` 定位 `AppCompatActivity` 使用非 AppCompat 主题；已改为完整 Activity 类名和 `Theme.AppCompat.Light.NoActionBar` | 正在重新进行模拟器冷启动验收；真机尚待复测 | 验证 Debug 首屏可存活后生成新的 Actions 测试 APK，再在用户手机复测 | `adb install`、`adb shell am start` 与 `logcat` 复现 `Error type 3` 和 `You need to use a Theme.AppCompat theme` |
| 2026-07-11 | Android 15 模拟器已通过冷启动、首屏渲染与安装自检，但用户实机仍报告立即退出；新增本地未捕获启动异常记录和下次启动诊断页 | 新诊断 APK 尚待实机安装；未确认任何新的 BLE 或上传行为 | 让用户安装诊断 APK，若再次退出则第二次打开并回传本机诊断堆栈 | Android 模拟器：进程、前台 Activity、首屏和自检均通过；实机异常堆栈待采集 |
| 2026-07-12 | 加固启动诊断落盘：`SharedPreferences` 改为同步 `commit()`，并额外写 `last-startup-crash.txt`；增加 pending-launch 标记覆盖无 Java 堆栈的进程退出；`MainActivity` 先渲染 UI 再初始化加密队列/WitSDK；本地同步 WitSDK 并成功编译 Debug APK | 本机无 USB 真机连接；诊断 APK 已产出，待用户安装回传 | 真机安装新 APK：秒退则二次打开截诊断页；能进入则跑安装自检 | `sync-wit-sdk.ps1 -ApiOnly`；`build-debug.ps1 -SkipSdkSync` BUILD SUCCESSFUL；APK 位于桌面 `TKA-Gateway-debug-diagnostics.apk` |
| 2026-07-13 | 真机确认可启动；自检显示定位服务未开，扫描反复跳设置且扫不到设备。修复：定位检测兼容 GPS/网络/总开关；设置返回后自动续扫；权限结果以真实状态复核；设备名过滤兼容 WT/BWT/901 | 新扫描修复 APK 待真机安装；尚未确认扫到实物 | 安装新 APK，开启定位后扫描 WT 设备并回传结果 | 代码已改；待本地 `build-debug.ps1` 产出新 APK |
| 2026-07-13 | 用户真机安装扫描修复版后成功发现并连接实物：`WT901BLE67` / `D7:0F:8A:DA:BE:DB`；同步更新项目状态并推送启动诊断与扫描修复 | 单只真实传感器扫描+连接已验收；双传感器、样本上传、生产部署未完成 | 验证实时 SDK 读数与归零，再推进双传感器和上传 | 用户真机回传连接成功；本地 `build-debug.ps1`、`gateway:test` 8/8 |
| 2026-07-13 | 修复连接后无持续数据可见：实时读数改为连接后直接渲染，不依赖“开始采集”；新增角度/加速度/角速度预览区 | 新预览 APK 待真机确认读数随转动变化 | 用户安装后反馈是否看到持续变化的 Ang/Acc/As | 代码已改；待重新编译 Debug APK |
| 2026-07-13 | 主界面改为官方 App 风格实时看板：大腿/小腿双卡片，Acc/Gyro/Angle 三行 X/Y/Z 大字刷新，连接状态与帧数摘要置顶 | 看板 APK 待真机安装确认 | 用户安装后确认转动时 X/Y/Z 是否实时变化 | 待 `build-debug.ps1` 产出 |
| 2026-07-13 | 增加 3D 姿态立方体、Acc/Gyro/Angle 波形曲线，并美化圆角临床风 UI；更新状态文档并推送 GitHub | 可视化 APK 待真机安装确认立方体与曲线 | 用户安装最新 APK，转动传感器验证 3D/波形/数值同步 | 待本地编译与 push |
| 2026-07-13 | 收口运行时数据边界：`APP_MODE` fail-closed、生产不再自动注入 Demo、API 统一 readiness 分流、健康检查 live/ready、家属端仅 Demo 自动上传且来源标记 `DEMO`、补 `test:runtime` 与 env 模板；Demo API 冒烟通过上传→预警→处理→SOAP→预约 | 本地分支 `claude/milestone-0-data-boundary` 已通过静态/网关/API 冒烟；生产部署、RLS、API 鉴权、真实硬件闭环未完成 | 推进浏览器角色闭环回归与硬件验收 | `test:runtime` 3/3、`lint`、`build`、`check:status`、`gateway:test` 8/8；Demo API 闭环 200 |
| 2026-07-13 | 打通真机上传准备：网关允许局域网 HTTP、Debug cleartext、单传感器临时膝角、样本显式 `HARDWARE`；设备页展示可复制患者 ID；本地 platform 上传冒烟与 Debug APK 已产出 | 待用户安装 `TKA-Gateway-debug-upload-ready.apk` 完成手机实机上传；双传感器/归零/离线补传未验收 | 用户真机上传验收后推进双传感器与离线补传 | 本地 API 冒烟 device→session→sample→dashboard `HARDWARE 48.6`；`build-debug.ps1` 成功；APK 已复制到桌面 |
| 2026-07-13 | 真机反馈“上传暂缓/队列积压”：服务端无任何手机 POST，判定为 Windows 防火墙/局域网入站阻断；网关增加连通性探测、真实错误回显、上传降采样与批量冲刷；提供管理员防火墙脚本 | 需用户管理员放行 3000 端口后重装新 APK 再测；队列中旧数据会在连通后自动补传 | 用户执行防火墙脚本 + 安装新 APK + 点“测试平台连接” | 服务仅有本机访问日志；防火墙改规则需提升权限 |
| 2026-07-13 | 防火墙与手机浏览器 health 已通，但 App 报 Cleartext HTTP not permitted；修复 Debug `network_security_config` 允许局域网 HTTP（`networkSecurityConfig` 会覆盖 `usesCleartextTraffic`）并重建 APK | 待用户安装最新桌面 APK 后点“测试平台连接/开始采集上传” | 用户重装 APK 验收上传；队列旧数据应自动补传 | Debug APK 已重建到桌面 `TKA-Gateway-debug-upload-ready.apk` |
| 2026-07-13 | 完成 Android v0.3 局域网上传发布候选：Debug/Release 网络策略分离、App 内连接/启动上传实测、旧测试队列一次性清理、低置信单传感器与临床趋势隔离、高置信双传感器 10 秒聚合及告警冷却；新增 Windows 中文路径 Android 验证脚本 | 唯一桌面 APK 待用户真机覆盖安装；真实单传感器上传结果待回传，双传感器仍未联调 | 真机安装 v0.3 并验证新采集上传；之后推进双传感器 | Android 35：连接与开始上传 PASS、旧队列 3→0；HTTP 781 条低置信无临床记录/告警；runtime 8/8、gateway 8/8、Android JVM/Lint、Debug/Release、Next build/lint 全通过 |
| 2026-07-13 | 网站实时看板闭环：Demo 持久化完整 Acc/Gyro/Angle 原始样本；`GET /api/sensor-samples` 返回 live snapshot；新增 `/sensor-live` 实时页（1.5s 轮询、大腿/小腿分卡、原始波形与临床趋势分离）；`/api/ai-analyses` 优先 HARDWARE 临床记录并标注来源边界；导航与设备页入口已接通 | 用户确认平台连接成功；网站已可显示与 App 同口径实时原始数据；双传感器临床分析仍待第二只传感器 | 真机持续上传时打开 `/sensor-live` 验收；推进双传感器 | runtime 8/8、lint、build；HTTP 冒烟：低置信 raw-only、高置信生成临床+告警、live snapshot dualActive、ai-analyses 标明真实硬件、`/sensor-live` 200 |
| 2026-07-14 | 审查并整合 PR #15；加入稳定样本 ID、数据库唯一约束和事务化幂等；生产网关要求 Bearer Token；移除会误删真实离线样本的 v0.3 自动清队列逻辑；统一 v0.3.0 签名产物名称；新增回归测试并接入 CI | 本地软件验证全绿，正式服务器和整合 APK 真机上传仍待验收；单传感器不能形成临床膝角 | 推送整合 PR 并通过 CI；真机验证断网补传与幂等后，购买第二只同型号传感器推进双传感器量角器对照 | `npm test` 21/21、`npm run lint`、`npm run build`、`npm run db:generate`、Android Debug `BUILD SUCCESSFUL` |
| 2026-07-14 | 建立 Web 康复指标与预警引擎：鲁棒 ROM、伸直缺失、重复计数、活动时长、质量门、趋势、疼痛与实验性冲击筛查均由统一 API 输出，并在 `/sensor-live` 展示公式、证据和人工处置要求 | 单传感器会 fail-closed；软件公式与边界已测试，真实双传感器精度、重复计数和冲击误报率尚未临床验证 | 第二只传感器到位后完成四元数相对姿态、量角器误差与真实 ADL 阈值验证 | 全量测试、Lint、生产 Build、状态门禁通过；桌面/390px 手机视口无横向溢出，浏览器控制台 0 错误 |
| 2026-07-14 | 建立 Android v0.4 无服务器本地证据任务：加密样本/事件持久化、中断恢复、标准 JSON 导出；新增 Web `/evidence` 严格导入、姿态回放、事件确认/处理和复核报告导出；补契约测试与闭环验收文档 | 软件闭环已通过自动化和浏览器验收；真实 BT50 导出包尚待用户手机完成一次端到端验收 | 安装 CI APK，用现有传感器采集并导出真实包，再在 `/evidence` 完成处理和报告验收 | `npm test` 29/29、`npm run lint`、`npm run build`、`npm run check:status`；Android JVM/Lint/Debug `BUILD SUCCESSFUL`；浏览器完成导入→处理→刷新持久化，桌面/390px 无横向溢出 |

## Agent 更新规则

每个 Agent 完成代码任务时必须：

1. 更新“已完成事项”，只记录已经实现的事实。
2. 更新“当前状态”，明确通过、失败、阻塞或尚未验证。
3. 调整“下一步任务”的优先级，删除已经完成的动作。
4. 在“Agent 工作记录”末尾追加一行，包含验证命令或测试结果。
5. 运行 `npm run check:status`、相关测试、`npm run lint` 和
   `npm run build`。
6. 将本文件与代码放入同一个提交或 Pull Request。

不得把计划写成已完成，不得删除其他 Agent 的有效历史记录，也不得在
没有验证证据时声称真实硬件或生产环境已经可用。
