# 项目状态与 Agent 交接

最后更新：2026-07-26

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
- 已完成全站视觉系统统一：此前站内并存「蓝色医疗」与「暖色墨绿」两套互相冲突的配色，基础组件跟随蓝色系而页面跟随暖色系。现已合并为单一设计系统（墨绿 ink / 米砂 sand / 黄铜 brass / 苔绿 sage），并重构登录页、首页、注册页与找回密码页；家属端、护士端、实时页与设备页统一使用同一套深色主视觉材质。业务逻辑、状态、接口调用与表单校验属性均未改动。

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
- 已按“小白家属体验官 + 专业姿态分析师”双角色完成 Web 信息与算法复核：家属实时页默认只展示安全状态、下一步动作、设备状态和训练完成情况，患者选择、SSE、P95/P05、Acc/Gyro/Angle、原始帧、公式与 3D 诊断保留在可展开的“专业详情”；家属首页明确区分上次测量与当前实时数据，系统分析不再冒充护士结论。
- 康复指标采用“观察值与正式结论分层”：真实 HARDWARE 在形成双路同步对并达到最短观察时长后，可显示 ROM、峰值、次数和活动时间的实测预览；正式关注优先级和训练结论仍要求匹配当前大腿/小腿设备的 GOOD 校准、200ms 内双路同步、至少 6 对/3 秒连续观察、合理角速度与完整屈伸周期。正式质量门失败时风险结论保持为空并返回可追溯原因码。实验性强晃动提示按同一设备连续三帧判断，不把单传感器提示升级成临床风险分。
- 服务端临床记录物化不再信任客户端单帧置信度：仅当当前设备绑定、GOOD 校准、相反位置设备和 200ms 同步帧均由服务器核对成功时，才使用两帧角度均值生成 10 秒聚合记录；单路、错绑、错校准或不同步样本只保留原始证据。
- 家属设备页已加入三步基础校准引导：确认安装位置和方向、舒适伸直位、双设备连接并静止后才允许保存；页面明确该记录只用于佩戴零点，不替代医疗量角器校准，重新佩戴或交换设备后需重做。
- 已修复真机“App 有实时帧但 Web 无上传”的状态机断点：大腿/小腿实际连接成功后自动启动本地证据与网页上传；平台预检同时验证 Bearer Token 和患者 ID，不再以公开健康接口产生成功假象；Token 由 Android Keystore 加密保存。旧队列缺失样本 ID 时生成确定性稳定 ID，不可恢复的 400/409/422 样本会隔离而不阻塞后续实时帧，鉴权和网络错误仍保留原数据重试。
- Web 实时页支持显式患者选择和 `?patientId=` 固定监测对象，家属设备页、家属仪表盘和护士工作台均链接到同一患者的实时原始帧；数据状态按真实 HARDWARE 帧龄显示，不再无条件宣称在线。设备页已改为正式域名与现有双实物流程，并移除“等待到货”和模拟硬件主入口。
- 已补齐患者隔离收尾：Web 切换患者会取消旧样本请求、立即清空旧帧并切换对应分析，旧请求即使稍后返回也不能覆盖当前患者；Android 的“测试平台连接”不再改写活动上传配置，双路重连或补填 Token 后可重新预检并恢复当前任务上传。
- 已完成 v0.4.3 实时吞吐改造：Android 将 BLE 采集、批量网络上传和证据封存拆为独立后台队列；最多 80 帧一次上传并逐帧校验回执，Web 合并样本事件并只追踪最新采集时间，避免历史补传拖慢实时页面。
- Android 结束训练和证据导出已移出界面线程，3D/波形渲染限频并在断开或换绑时清空旧流；长任务不再在按钮点击时同步读取数千个加密文件。
- Web 指标窗口按大腿/小腿各自均衡抽取，不再被单路积压挤掉另一侧；ROM、峰值、次数和活动时间可在双路同步后显示“实测预览”，正式风险结论仍必须通过 GOOD 校准、连续性、动作周期和可信质量门。

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

- 默认分支与当前交付基线：`main`；批量实时链路、后台证据处理、双路均衡指标窗口和易懂版实测预览已通过 PR #35 合并，生产部署提交为 `32ec37c`。
- v0.4.3 真机复测确认 App 采集更新及时、导出与 Web 回放可用，但实时闭环仍未达标：手机到服务器约 272 秒、采集到网页约 279 秒，App 队列可积压约 230 条；正常屈膝任务仍产生大量待处理事件和疑似强晃动误报。完整事实、边界与验收清单见 `docs/V043_FIELD_TEST_REMEDIATION.md`。
- P0 第一检查点已在改造分支实现：Android 上传批次同时处理最新实时帧和最旧补传帧，批量服务端并发提高；强运动必须满足三样本低加速度→冲击→高角速度序列，数据断帧、静止和设备断开不再进入待处理。软件门禁通过，真机延迟与误报率仍待新 APK 验收。
- 账号和资料闭环存在回归/缺口：生产邮箱注册能力已存在但登录页入口不可见；资料页缺少退出、修改密码，登录页缺少忘记密码；设备绑定持久化、历史训练/异常回顾和真实电量来源仍待实现。
- GitHub 仓库：`https://github.com/Zh666666666/-`
- 运行时边界：`APP_MODE=demo` 始终走内存数据；生产缺数据库、网关令牌或完整的本地/Supabase 认证配置时 fail-closed（503）。
- 健康检查：`/api/health/live` 与 `/api/health/ready` 已可用。
- 验证状态：43 项运行时/网关/API 测试、`lint` 和 42 路由生产 `build` 通过；PR #35 的 GitHub Build `30185084701` 与 Android verify `30185084724` 通过。Android 发布门禁涵盖 JVM 测试、Android Lint、Debug/Release、R8、zipalign 与 v2/v3/v4 签名校验；浏览器使用双传感器格式并发帧完成指标和响应式验收。
- 云端无密钥时：使用 Demo 模式。
- 目标型号：传感器外壳已确认标注为 `WT9011DCL-BT50`；用户已确认项目 Android 网关可同时连接两只实物，并在 App 与网站看到实时数据。已知其中一只广播名为 `WT901BLE67`、地址为 `D7:0F:8A:DA:BE:DB`；地址与广播名仍不能当作已验证的厂商序列号。
- Android 网关版本：v0.4.4（`versionCode=8`，含品牌视觉统一，功能与 v0.4.3 一致），最低 Android 7.0（API 24）、目标 API 35；Debug 包名 `cn.tkarehab.gateway.debug`。长期签名 Release 由 GitHub Actions `30200048340`（`main` 提交 `74a409a`）生成，安装文件 `TKA-Gateway-v0.4.4.apk`，大小 1,556,358 字节，SHA256 `E0C70E48CE26CFAA482BC557A94CA4270CE1544A2EC64769E4CB55F25A9BFCFD`；v2/v3 验证 `true`，独立 v4 验证 `Overall verified: true`，签名者为长期证书 `CN=TKA Rehab Gateway`（证书 SHA-256 `ede8a7a5...fe0d801a`）。安装文件与 `.idsig` 已复制到 `D:\网站项目\`。上一版 v0.4.3（`versionCode=7`）长期签名包由 GitHub Actions `30185485509` 生成，安装文件 `TKA-Gateway-v0.4.3.apk`，SHA256 `A3FA169C3C398E649A0A18A08D23A7915738F901CB2499F962DD88D41D870CEE`，v2/v3 与独立 v4 验证均通过。
- Android v0.3 保留升级前的加密离线队列并继续补传；不得因无法区分测试/真实数据而自动删除旧样本。新采集样本使用稳定幂等 ID。
- 单传感器 `confidence=0.35` 只保存原始 `HARDWARE` 样本，不生成临床趋势或预警；双传感器可信角度（>=0.7）按 10 秒聚合，ROM 同类预警 30 分钟冷却。
- 网站实时看板：`/sensor-live` 使用同进程 SSE 样本事件立即触发刷新，并以 1 秒轮询兜底；当前单实例生产形态可工作，多实例扩容前需把事件总线迁移到 Redis/Postgres/Supabase。页面展示双传感器 Three.js 3D、Acc/Gyro/Angle、同帧 ID/序号、服务端回执与端到端延迟。
- Web 指标公式：`GET /api/sensor-samples` 同步返回 `metrics`；双路同步后可显示 ROM、峰值、次数与活动时间的实测预览，只有真实来源、匹配 GOOD 校准、200ms 内双路同步、至少 6 对/3 秒、采样连续、动作合理且完成至少一次完整屈伸后才输出关注优先级和正式训练结论。当前阈值已完成软件测试，尚未完成四元数相对姿态、功能轴校准、量角器对照和真实 ADL/强晃动误报验证。
- 本机联调地址：`http://192.168.31.203:3000`；Demo 患者 ID：`demo-patient-1`。
- Android 35 模拟器内已实际点击“测试平台连接”和“开始采集上传”，分别显示 `平台连通正常：ready / mode=demo` 与 `平台已连通（demo），开始上传队列 0 条…`。
- 平台侧硬件上传链路已通过：device → binding → HARDWARE session → sample → live board / dashboard；781 条低置信积压通过真实 HTTP API 验证不会生成临床记录/告警，高置信数据按 10 秒聚合。
- 正式服务器：`103.242.13.17` 已部署 Docker Compose 生产栈（PostgreSQL、Next.js、Caddy），当前源码标记为 GitHub `main` 提交 `32ec37c`；本地签名角色会话、业务 API 保护、网关 Bearer Token、日志轮转、每日备份、防火墙与仅密钥 SSH 均已验证。`www.dorianaistudio.cloud` 已解析至正式服务器并取得有效 HTTPS 证书，裸域自动跳转至 `www`。
- 实时可信链路已部署到正式服务器：部署前数据库备份成功，容器重建后健康；生产验收脚本已通过健康、角色隔离、受保护数据、网关鉴权、登录态 `/sensor-live` 页面和 SSE `ready` 事件检查。软件格式双路并发验收约 0.37-0.41 秒入库、约 1.17 秒到网页；该结果不能替代用户手机网络下的连续实物验收。
- Android v0.4.1 正式签名包来自合并提交 `f1ec633` 的 GitHub Actions 运行 `29676758183`，产物名 `android-gateway-release-f1ec6334b9fa78662c4dd204af54a567e714ebfa`，安装文件 `TKA-Gateway-v0.4.1.apk`，大小 1,548,166 字节，SHA256 `8484EF4EA43FECD01263FC14AD62AB5316E4269348F7EC4734A968E609C72788`；v2/v3 与独立 v4 验证均通过。该包包含双路连接后自动上传、`startRequested` 预检竞态保护、受保护患者预检、Keystore Token、旧队列迁移与隔离、重连恢复和活动患者保护。此前日志中的 `48A3F349...D1402E4E` 文件不在本机或 GitHub，不再作为交付依据。部署后生产 `sensor_samples` 表仍为 0 条，因此真实双传感器连续回传仍待用户手机验收。
- 生产数据边界：数据库只初始化正式患者骨架，不包含模拟传感器样本；家属/护士账号分离，业务 API 需有效会话，硬件上传使用独立 Bearer Token。
- 邮箱注册已在生产启用并由用户确认合格：`updates.dorianaistudio.cloud` 的 Resend DKIM/SPF 已验证，API Key、发件地址和随机照护邀请码仅保存在服务器/本机私密环境；家属验证码注册、自动登录与再次登录链路可用。
- 仓库结构缺口：外层仓库将 `tka-rehab-platform` 记为 gitlink，且缺少 `.gitmodules`，交付时需固定到应用仓库提交。
- 视觉基线：全站已收敛为单一设计系统，设计令牌集中在 `src/app/globals.css`（色阶、圆角、阴影、缓动、字体栈），基础组件 `src/components/ui/*` 与品牌资产 `src/components/brand.tsx` 均由令牌驱动。拉丁字形通过 `next/font` 加载 Inter，中文交给 PingFang SC / 鸿蒙 / 雅黑 系统字体，不额外下载中文字体包。该改动仅覆盖表现层，未部署到正式服务器。
- 当前产品性质：已具备单传感器、无服务器的软件闭环能力；真机扫描、连接和实时读数已由用户确认，新版“采集→加密封存→导出→Web 回放→事件处理→报告”仍需在用户现有实物上完成一次端到端验收。该闭环只输出工程事件和原始姿态证据，不宣称临床 ROM、跌倒诊断或医疗预警有效性。

## 下一步任务

按优先级从上到下执行：

1. 按 `docs/V043_FIELD_TEST_REMEDIATION.md` 的 P0 顺序定位并修复上传吞吐、实时优先级和历史补传阻塞，使 App 到 Web 最新帧 P95 不超过 2 秒且在线队列收敛。
2. 分离数据质量与患者风险，修复正常屈膝的强晃动/高风险误报；为正常缓慢屈伸建立确定性回归数据和规则级可追溯测试。
3. 从 BT50 官方资料、WitSDK/GATT 核验真实电量能力；读取不到时显示未知，禁止固定或推算电量。持久化设备位置、患者绑定和校准版本。
4. 增加训练历史、异常回顾、账号退出、修改密码、忘记密码与邮箱注册入口，并完善资料页。
5. 重构家属默认视图的信息层级，只突出“有没有问题、现在做什么、最近是否变好”，专业指标保留在可展开详情。

### 2026-07-23 实物测试后改造计划（进行中）

本轮以工程闭环可信可测为目标，不宣称医疗器械或临床诊断精度。用户已
实测确认两只 BT50 均可连接、App 与 Web 可收到真实原始帧、关闭任一
传感器后对应数据会停止；同时复现以下问题：

- App 10Hz 实时更新导致整个页面重排抖动，“结束本次训练”触摸不稳定；
- App 的大腿/小腿分配未成为服务器唯一有效绑定，网页仍使用旧固定映射；
- 真机归零没有形成可见、持久且参与上传/计算的软件零点；
- Web 收到单路或旧会话帧，出现绑定校准不匹配、0 对同步帧和大幅延迟，
  因此质量门正确拒绝输出 ROM、完整屈伸和有效时长；
- Firefox 宽屏下双传感器 3D 取景异常，断帧状态与模型更新不清晰；
- 生产 `/hardware-demo` 仍可独立生成模拟值，容易与真实硬件混淆；
- AI 尚未建立“确定性质量门和指标先通过，再由用户手动生成解释”的
  数据边界。

实施顺序与验收条件：

1. Android 保持 BT50 默认 10Hz 可视刷新，固定实时区域尺寸并将网络、
   证据写入和控件状态分离；结束操作必须单击可靠且幂等。
2. App 分配位置后原子更新服务器绑定，自动结束旧会话并创建带绑定版本
   的新会话；旧位置、旧校准和旧会话样本不得混入当前计算。
3. 为每只设备保存软件零点；界面立即归零，上传同时保留原始姿态、校准
   后姿态和校准版本，重新佩戴或换位必须重新归零。
4. 服务端按同一患者、会话、绑定版本和 200ms 窗口配对双路帧；使用完整
   训练会话计算 ROM、峰值屈曲、完整屈伸、有效时长与质量原因。
5. Web 只显示真实 App 数据；某路超过 2 秒无新帧时冻结最后姿态并标记
   离线。生产硬件演示页不得生成模拟帧。
6. 修复 Firefox/移动端双 3D 取景和刷新；原始帧、波形、3D 与指标必须
   能追溯到同一会话和样本。
7. 用户点击“生成分析”后，只有质量门通过才调用服务端 Responses API；
   AI 读取确定性指标和必要原始片段，仅输出康复状态分析、人工复核提示
   与建议，不输出疾病诊断。
8. 通过 Web/Android 自动化、Firefox 和移动布局、双路/断路/换位/归零/
   断网补传场景后，发布长期签名 v0.4.2、部署正式服务器并更新本日志。

1. **P0 - 发布 v0.4.1 并完成双实物验收**
   - 通过 PR、Web 与 Android CI 后部署 `/api/gateway/ready`、患者选择和实时页面；下载并核对同一提交的 Android Gateway APK 产物。填写正式域名、同一患者 ID 与 Token 后连接两只实物，确认 App 自动显示“上传已启动”。连续训练至少 10 分钟，逐只核对 App 与 Web 的样本序号、ID 尾号和 Acc/Gyro/Angle，统计 2 秒达标率、断网补传和重连恢复情况。
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
| 2026-07-26 | 合并 PR #38（Web 两轮视觉 + Android 视觉统一 + v0.4.4 版本升级）至 main；用户触发长期证书签名，产出并核验 `TKA-Gateway-v0.4.4.apk` | Web 与 Android 视觉已统一在 main；签名包可交付；正式服务器尚未部署本次 Web 改版，真机观感待用户确认 | 用户安装 v0.4.4 确认观感；择期备份数据库后部署 Web 改版到正式服务器 | 合并后 main：Build `30198816777`、Android `30198816776` 通过，`npm test` 44/44；签名运行 `30200048340` 两 job 成功；APK SHA256 `E0C70E48...A9BFCFD`，v2/v3 true、v4 `Overall verified: true`，签名者 `CN=TKA Rehab Gateway` |
| 2026-07-26 | Android 网关 UI 移植品牌设计系统：80 处色彩映射、衬线眉题、发丝描边卡片、accent 渐变卡头、品牌三色轴线/波形、主题与状态栏 | 视觉与 Web 端统一，功能零改动；Debug 构建通过，真机观感与正式签名包待验收 | 用户真机安装 Debug 包确认观感，满意后走 Actions 长期证书签名 | Android JVM 测试、Lint、assembleDebug 全过（BUILD SUCCESSFUL）；diff 功能扫描为空 |
| 2026-07-26 | 视觉第二轮打磨：Fraunces 衬线点缀、大而轻标题、面板 vignette、按钮渐变+扫光、仪表盘度数标签、表单悬浮卡片、首页收尾 CTA；修复 twMerge 吞实色兜底问题 | 表现层完成且门禁通过，功能零改动；未截图评审、未部署生产 | 用户浏览器确认观感后合并 PR #38 并随下次发布部署 | `npm test` 44/44；ESLint 0 告警；48 路由构建；16 项对比度/布局审计全过；390×844 登录/注册无滚动 |
| 2026-07-26 | 统一全站设计系统并重构登录页/首页；重建 UI 组件基座；归并双色板、字重、圆角与阴影；修复 `*` 描边规则未分层导致语义描边失效的缺陷 | 表现层改造完成且软件门禁通过，功能未改动；尚未部署生产，也未做人工截图评审 | 由用户在桌面与手机浏览器确认观感，再随下一次发布部署 | `npm test` 44/44；ESLint 0 告警；48 路由生产构建通过；对比度脚本在 1280px 与 390px 下覆盖 9 个页面 0 项低于 WCAG AA、0 横向溢出 |
| 2026-07-26 | 完成 P0 第一检查点：实时/补传平衡队列、批量并发提升、强运动三样本判定、技术事件退出待处理 | Web 与 Android 软件门禁通过；生产和新 APK 尚未发布，2 秒真机延迟与正常屈膝误报仍待验证 | 继续实现会话历史/保留策略、自动分析、账号资料与双层视图后统一发布 | `npm test` 43 项通过；Android JVM 单测、Lint、Debug 构建通过 |
| 2026-07-26 | 记录 v0.4.3 双 BT50 实物复测结果，建立实时积压、算法误报、真实电量、设备持久化、历史回顾、账号闭环和家属信息架构的分级改造清单 | App 实时采集和导出可用；Web 延迟仍达数分钟、队列积压、正常屈膝可能误报，产品闭环尚未验收 | 先完成 P0 实时链路吞吐诊断与风险/质量分层，再推进账号、历史和家属视图 | 用户截图与真机观测：手机→服务器约 272 秒、采集→网页约 279 秒、队列约 230 条；774 秒任务 867 样本/1.12Hz、95 项待处理事件 |
| 2026-07-26 | 合并 PR #35，部署批量实时链路到生产服务器，并生成长期签名 v0.4.3 APK | Web/API 与签名 APK 已交付；30 分钟双实物、断网补传、结束/导出和 3D 重连仍需用户手机验收 | 安装指定 SHA256 的 v0.4.3 APK，按 30 分钟、断网、完整屈伸和二次重连清单实测 | PR Build `30185084701`、Android verify `30185084724`、签名运行 `30185485509` 通过；备份 `tka-rehab-20260726T025001Z.dump` 为 598,828 字节；容器健康、`verify-production.mjs`、公网 ready 200、裸域 301、batch 未授权 401；APK SHA256 `A3FA169C...D870CEE`，v2/v3/v4 通过 |
| 2026-07-25 | 实现 Android/Web 批量实时链路、采集/上传/证据线程隔离、后台结束与导出、3D 重连复位、SSE 合并刷新、双路均衡指标窗口和易懂版实测预览；签名工作流产物名同步升级到 v0.4.3 | 本地代码与 Debug APK 已通过自动化；尚未部署生产或完成 30 分钟双实物验收 | 推送分支并通过 GitHub CI，生成长期签名 v0.4.3；随后备份部署生产并按 30 分钟/断网/重连清单实测 | Web 28 runtime + 9 gateway + 6 API（含 batch）通过；ESLint、42 路由 build 通过；Android ASCII 路径 JVM/Lint/Debug `BUILD SUCCESSFUL` |
| 2026-07-22 | 将 PR #28 的家属易读视图、专业姿态质量门和可信记录物化完整部署至正式服务器；部署前生成数据库备份，并持久修正服务器 Docker Hub DNS 解析 | 正式站运行 GitHub `main` 提交 `a33e929`，PostgreSQL、Next.js、Caddy 均健康；生产环境变量与历史备份未被发布包覆盖 | 使用两只实物连续训练至少 10 分钟，核对 App/Web 同帧 ID、2 秒达标率、断网补传、校准质量门和 ROM 对照结果 | PR #28 Build `29933119386` 通过；备份 `tka-rehab-20260722T153020Z.dump`；41 路由生产构建、10 项迁移无待执行；`verify-production.mjs` 通过健康、角色隔离、受保护数据、网关鉴权、实时页和 SSE；外网 ready 200、裸域 301 保留路径和查询参数 |
| 2026-07-22 | 以小白家属体验官和专业姿态分析师双角色复核并改良家属首页、实时页、设备校准与指标引擎；保留 3D/原始帧/公式等专业功能并默认收起；质量门与服务端记录物化均改为校准、双路同步、连续性、合理性和完整周期通过后才输出结论 | 家属默认视图已去除主要技术术语和虚假“无预警”；专业详情保留完整诊断；当前角度仍为双传感器 Pitch 差值训练预览，不冒充临床量角器 | Android 增加四元数原始姿态和功能轴校准契约，再以量角器完成 0°/30°/60°/90°/110° 对照与阈值标定 | 41/41 运行时/网关/API 测试、ESLint、41 路由生产构建通过；浏览器验证家属患者隔离、默认/专业双层视图、3D/公式保留、390×844 无横向溢出、设备三步校准及控制台 0 error/warning |
| 2026-07-19 | 接管并完成 `fix/realtime-sensor-web-polish`：修复 Web 患者切换串帧/分析串用、Android 活动配置污染与重连恢复，发布 v0.4.1；PR #26 合并后备份并部署生产，生成同提交长期签名 APK | 软件闭环、GitHub CI、生产部署和可追溯 APK 均完成；生产健康、角色隔离、网关鉴权、实时页和 SSE 通过，数据库仍为 0 条实物样本 | 在 Android 手机安装 SHA256 `8484EF4E...C72788` 的 APK，连接两只 BT50 连续运行 10 分钟，核对 App/Web 同帧 ID、2 秒达标率、断网补传与重连 | 本地 39/39、lint、41 路由 build、Android JVM/lint/Debug build 和 390x844 浏览器通过；PR #26 Build 1m3s、Android verify 2m17s；Actions `29676758183` 正式签名成功；备份 `tka-rehab-20260719T063932Z.dump`；`verify-production.mjs`、外网 ready 200、无效/有效网关 Token 401/200 |
| 2026-07-18 | 收口实时链路：`startRequested` 竞态、硬件演示页到货文案清除、Chrome 桌面/移动验收截图；重建含网关修复的 Debug APK | 本地代码、测试和浏览器布局曾验收；生产部署与双 BT50 实物 e2e 未做；记录的 APK 文件后续核查时已不存在 | 由后续 Agent 重跑门禁、重新生成可追溯 APK 后再部署和实测 | Web lint + 39 测试与 Android verify-debug 曾报告成功；原记录 APK 哈希无法从本机或 GitHub 复核，已撤销交付资格 |
| 2026-07-18 | 修复 BLE 连接仅预览、不启动上传的状态机；增加 Token+患者受保护预检、Keystore Token、旧队列稳定 ID/坏样本隔离；Web 增加患者选择、真实帧龄状态、正式域名指引并升级实时数据页视觉 | 代码与本地软件链路已完成；需部署 Web/API 并安装新 APK 后进行两只实物连续验收 | 部署本分支，安装指定 SHA256 APK，连接双实物验证自动上传、1–2 秒更新、断网补传和重连 | Web 39 项测试通过、Lint、41 路由 Build；Android ASCII 路径 `:app:testDebugUnitTest :app:lintDebug :app:assembleDebug` 成功 |
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

### 2026-07-23 改造中间检查点

已完成：

- 数据库与 API 增加 `placementRevision`；样本只允许进入同患者、同会话、同设备、同佩戴位置、同版本链路。
- Android 升级到 `0.4.2`（versionCode 6）：官方默认 10Hz 每帧采集上传、稳定页面、可靠结束会话、持久化软件零点、原始角度保留、换绑版本隔离和自动 GOOD 校准上报。
- Web 只用最新硬件会话计算；3D 单侧断帧冻结并显示离线；生产 `/hardware-demo` 禁止模拟数据。
- AI 改为手动触发的 Responses API，确定性质量门不通过时返回 422 且不调用模型。
- 家属可见的质量失败原因改为可执行中文提示。

已验证：

- Web 运行时、网关和 API 共 41 项测试通过，ESLint 与 41 路由生产构建通过。
- Android 子任务报告 23 项 JVM 测试、Lint、Debug、Release/R8 通过。
- 3D 子任务报告 1600px 与 390px 视口双模型完整、无横向溢出和控制台错误。

待完成：

- GitHub Actions 使用长期证书生成并核验 APK v2/v3/v4 签名；本机没有发布密钥，不在本地伪造正式包。
- 将 AI 提供方配置写入服务器私有环境。无 Authorization 的最小请求返回 401，凭据不得进入 Git。
- 提交并推送代码，部署数据库迁移与 Web，运行生产验收。
- 安装新 APK 后完成换绑、归零、单侧断开、结束会话、断网补传、质量门和手动 AI 分析真机验收。

### 2026-07-23 v0.4.2 本地发布检查点

已完成：

- Android 本地构建链已复核；Debug 与 Release/R8 均成功，发布脚本和 GitHub Actions 的产物名已统一为 `TKA-Gateway-v0.4.2`。
- Web、API、数据库迁移与 AI 质量门代码已进入同一改造分支，等待 GitHub CI 和生产部署。

当前状态：

- Debug APK：`mobile-gateway-android/app/build/outputs/apk/debug/app-debug.apk`。
- Debug APK SHA256：`8EB9F5F2DB86C7BA8C7FFF23B04DA78377F9066DCDAE51F93E6863E3D5B2391A`。
- 未签名 Release APK SHA256：`32910CAE97F164675FFD6990904C981C71530958BADE90486C016547B4D6FC2E`；该文件仅用于构建核验，不可作为正式升级包交付。

验证：

- `npm test`：41/41 通过。
- `npm run lint`：通过。
- `npm run build`：41 路由生产构建通过。
- `powershell -ExecutionPolicy Bypass -File scripts/verify-debug.ps1 -SkipSdkSync`：Android JVM、Lint、Debug 构建通过。
- `gradlew.bat assembleRelease --no-daemon`：Release、R8、资源压缩通过。

下一步：

- 推送改造分支并等待 Build 与 Android Gateway CI；下载长期证书签名的 v0.4.2 产物，核对 v2/v3/v4 和 SHA256。
- 合并后备份并部署生产数据库迁移/Web，私密写入 AI Responses API 配置，执行健康、来源边界、演示禁用和 AI 质量门验收。
- 用户安装正式 v0.4.2 后完成两只 BT50 的真实换绑、归零、断开、结束、断网补传、质量门和 AI 人工触发验收。

### 2026-07-23 v0.4.2 合并与部署交接检查点

已完成：

- PR #31 已 squash 合并到 `main`，生产候选提交为 `c3a0729e598e1c67ef94960920c08236d794564e`。
- GitHub Build `30022323013` 通过；Android Gateway `30022323161` 的 JVM、Lint、Debug、Release/R8 与临时 v2/v3/v4 签名验证通过。
- 手动正式签名流水线 `30022615165` 使用长期证书成功生成 `TKA-Gateway-v0.4.2.apk`、`.idsig` 和签名验证凭据。
- 正式 APK SHA256：`CE6D2E19619076D1E330A70D4C7ADD4093BBA759FA5572D071DAD4F0BE5862BE`。
- 正式 APK 签名凭据：v2 `true`、v3 `true`、独立 v4 验证 `Overall verified: true` / `Verified using v4 scheme: true`。
- 本地生产构建浏览器验收：1280px 专业详情无横向溢出；390x844 家属摘要无横向溢出；移动端 3D 画布为 343x338，包含大腿与小腿双模型标签。

当前生产状态：

- `https://www.dorianaistudio.cloud/api/health/ready` 返回 200，现有生产版本、PostgreSQL、认证和网关鉴权仍健康。
- 新提交尚未部署。服务器 `103.242.13.17:22` TCP 可达，但 SSH 在密钥交换前持续由远端关闭；多次密钥连接和 `ssh-keyscan` 均复现，未执行数据库迁移或容器重建。
- 自定义 Responses API 使用授权后已越过 401，但最小无患者数据请求返回 HTTP 400 `upstream_error`。项目保持 fail-closed，不会生成伪造分析；生产配置不得因此改用假数据或静默本地结论。

恢复后的准确执行顺序：

1. 从云控制台重启 SSH 服务或服务器，并先验证新的密钥会话可进入；不要关闭仍可用的控制台会话。
2. 在 `/opt/tka-rehab` 运行 `sh deploy/backup.sh`，确认新备份非空。
3. 将 `AI_RESPONSES_BASE_URL`、`AI_RESPONSES_MODEL`、`AI_RESPONSES_REASONING_EFFORT`、`AI_RESPONSES_API_KEY` 和 `AI_RESPONSES_ACTOR_AUTHORIZATION` 写入服务器私有 `.env.production`；不得输出或提交凭据。
4. 拉取 `main` 的 `c3a0729`，运行 `docker compose -f compose.production.yml up -d --build`；启动过程执行 Prisma 迁移。
5. 运行容器内 `node deploy/verify-production.mjs`，再从公网核验 ready、根域跳转、生产 `/hardware-demo` 禁止模拟、实时页和 AI 质量门。
6. 部署证据通过后更新本日志并合并本交接分支。

用户侧最终实物验收：

- 安装 SHA256 为 `CE6D...62BE` 的正式 v0.4.2 APK。
- 使用两只 BT50 验证 App 手动换绑后 Web 同步换位、软件归零、单侧关机冻结、结束训练停止上传、断网补传、质量门通过后的手动 AI 调用。
- AI 提供方若仍返回 `upstream_error`，记录请求时间与供应商响应 ID，联系该兼容服务提供方；不得把供应商故障解释为传感器数据不可信。

### 2026-07-24 OpenRouter 免费模型与隐私检查点

已完成：

- 从 OpenRouter 实时模型目录选择 `nvidia/nemotron-3-super-120b-a12b:free`：免费、262144 上下文，支持 reasoning、response format 与 structured outputs。
- 使用项目相同的 `/api/v1/responses` 请求格式完成无患者数据兼容测试，模型成功返回 `report` / `recommendation` 严格 JSON。
- 新增 AI 外发证据最小化：删除患者 ID、设备 ID、会话 ID、绝对采集时间和手术日期，仅发送目标角度、侧别、相对时间、质量指标及运动学证据。
- 新增回归测试，确保外发 JSON 不包含标识符或绝对日期。

当前状态：

- 本地 42 项 Web/网关/API 测试、ESLint 和 41 路由生产构建通过。
- OpenRouter API Key 仅用于本机兼容测试，未写入代码、Git 或日志；生产环境尚未配置。
- 服务器重启后 HTTPS ready 仍正常，但 `103.242.13.17:22` 仍在 SSH 密钥交换前由远端关闭，尚不能备份、部署或写入私密环境变量。

下一步：

1. 从量芯云网页远程终端检查 `sshd -t`、`systemctl status ssh`、`journalctl -u ssh` 和 22 端口监听，恢复密钥 SSH。
2. 备份数据库后部署本分支并将 OpenRouter base URL、模型、`medium` reasoning effort 和 API Key 写入服务器私有 `.env.production`。
3. 验收质量门不通过时不调用模型、质量门通过时匿名证据调用成功，以及生产页面不暴露凭据。
4. 完成后轮换本次在对话中暴露过的 OpenRouter Key。

### 2026-07-24 OpenRouter 生产部署与 SSH 恢复

已完成事项：

- PR #33 已合并到 `main`，生产部署提交为
  `0633071aca51f19c55a8a82e2bdfd0740d10d638`。
- 部署前已生成并校验非空数据库备份
  `/opt/tka-rehab/backups/tka-rehab-20260724T123007Z.dump`，大小 143,798 字节。
- 服务器私有 `.env.production` 已配置 OpenRouter Responses API：
  `https://openrouter.ai/api/v1`、模型
  `nvidia/nemotron-3-super-120b-a12b:free`、推理强度 `medium`；API Key
  未写入代码、Git 或日志。
- `docker compose -f compose.production.yml up -d --build` 已完成，PostgreSQL、
  Next.js 与 Caddy 容器均启动，数据库与应用健康检查通过。
- 容器内 `node deploy/verify-production.mjs` 已通过健康检查、家属/护士角色隔离、
  受保护数据、网关鉴权、实时页和 SSE 实时流验收；公网
  `https://www.dorianaistudio.cloud/api/health/ready` 返回 HTTP 200。
- 从生产应用容器直接调用 OpenRouter Responses API 返回 HTTP 200，并获得有效输出。
- 对 `prod-patient-1` 调用生产 AI 分析入口返回 HTTP 422
  `QUALITY_GATE_FAILED`；当前数据不满足确定性质量门，因此没有调用模型或生成诊断，
  fail-closed 链路符合设计。
- SSH 22 端口因公网未认证扫描占满握手队列而持续 banner 超时；已增加抗突发参数与
  备用端口 2222，并用项目密钥验证直连成功。已安装 `deploy/sshd-tka.conf`，
  禁用 SSH 密码和交互式认证，仅保留密钥登录；noVNC 控制台仍可用于紧急恢复。

当前状态：

- Web v0.4.2、双传感器实时链路、匿名化 AI 证据构造和 OpenRouter 生产配置均已上线。
- AI 服务可用，但只有完成双传感器同步、匹配校准、连续采样和完整动作周期后，
  质量门才允许生成分析；本次未伪造一段“合格”患者数据来强行通过。
- 本次 Docker 构建显示依赖审计存在 3 个 moderate 与 5 个 high 项；构建、类型检查
  与运行验收不受影响，但应另开安全维护任务逐项确认可利用性和兼容升级范围。

下一步任务：

1. 使用两只 BT50 完成一次真实完整训练：确认 App 手动换绑同步到 Web、归零后保持
   静止、连续屈伸至少一个完整周期并点击“结束本次训练”。
2. 在 Web 复核双路同步帧、校准匹配、连续观察时长、ROM、峰值屈曲、完整屈伸次数和
   数据质量；质量门通过后手动点击 AI 分析，核对报告仅引用匿名化的本次证据。
3. 实测手机断网采集、恢复联网补传、去重与时间顺序，并确认补传不会把已结束会话
   重新标记为实时。
4. 轮换本次曾在对话中暴露的 OpenRouter API Key 和服务器 root 密码；轮换后只更新
   服务器私有配置，不提交凭据。
5. 审计 `npm audit` 的 8 个依赖项，优先修复可远程利用且不需要破坏性主版本升级的项。

验证记录：

- `npm test`：43 项通过（28 runtime + 9 gateway + 6 API）；`npm run lint`：通过；`npm run build`：42 路由通过。
- Android ASCII 路径验证：JVM 单元测试、Android Lint 与 Debug 构建通过；v0.4.3 Debug APK SHA256 为 `9D007D8640DE1F9AB2E98C55C7A2A6544B4C2FF625916ACCCD89BBE6C7ABD42F`。
- 浏览器验收：成对批量上传 28 帧无失败，得到 14 对同步帧；易懂版显示 ROM 84°、峰值 89°、完整屈伸 1 次、有效活动 7 秒，正式风险结论因缺少 GOOD 校准保持关闭；1280px 与 390px 视口均无横向溢出。
- GitHub Build `30089904911`：通过。
- 生产容器验收：通过；公网 ready：HTTP 200；OpenRouter 容器内兼容测试：HTTP 200。
- 生产 AI 质量门拒绝测试：HTTP 422 `QUALITY_GATE_FAILED`，未生成虚假分析。
- 密钥 SSH 新会话：`KEY_ONLY_SSH_OK`。

### 2026-07-26 v0.4.3 账号、历史、结果与真实电量检查点

已完成事项：

- 账号闭环已补齐：家属邮箱注册入口重新可见，支持验证码忘记密码、登录后修改密码、
  退出登录；数据库账号优先于环境默认账号，修改密码后旧密码失效。
- 资料页支持姓名、联系方式、家属关系、通知偏好、护士科室/职称，并按登录账号隔离；
  家属不能修改医疗字段。
- 家属与护士均可查看近 15 天训练记录并切换易懂/专业视图；易懂版只显示
  “正常/需要关注/数据不足”和下一步，专业版保留 ROM、次数、质量、异常证据和 AI。
- 结束训练后保存完整会话摘要并自动触发分析；每次训练保留结果，数据质量只影响
  高/中/低置信度，不再要求软件零点校准通过才生成结果。
- 原始逐帧数据自动保留 72 小时，训练摘要、异常证据和智能解读保留 15 天。
- 疑似冲击规则改成同一设备内“低重力→冲击→高角速度”的有序模式并 10 秒去重；
  数据断帧、静止和断连不计入患者风险。
- Android 读取 WitMotion SDK 官方 `Electricity` 结果作为真实电量；没有结果时显示未知。
  3D/波形/文字刷新限为每传感器最高 10Hz，采集和上传仍保留原始 SDK 帧。

当前状态：

- 软件门禁已通过：44 项 Web/网关/API 测试、ESLint、48 路由生产构建，以及 Android
  JVM、Lint、Debug APK 构建。
- 本地 Debug APK：`mobile-gateway-android/app/build/outputs/apk/debug/app-debug.apk`，
  SHA256 `D7938540A18FEBE79BDD7A774B5BF0C1B209D3F5277D58162EC9368B34D969D5`。
- 当前分支为 `codex/v043-field-remediation`；P0 第一检查点为 `9bcdd59`，本轮功能提交
  已随提交 `61acb87` 部署到生产。GitHub Build `30188926622` 与 Android Gateway
  `30188926619` 均通过。
- 生产部署前已生成并用 `pg_restore -l` 校验数据库备份
  `/opt/tka-rehab/backups/tka-rehab-20260726T054700Z.dump`，大小 1,450,785 字节。
  数据库迁移 `20260726153000_add_account_recovery_and_session_results` 已成功应用；
  PostgreSQL、Next.js 与 Caddy 容器均正常，应用健康状态为 `healthy`。
- 容器内生产验收已通过健康检查、家属/护士角色隔离、受保护数据、网关鉴权、实时页
  和传感器流；公网 ready 接口返回 HTTP 200，登录页返回 HTTP 200，裸域返回 301。
- 真实双传感器的 30 分钟队列收敛、App 到 Web P95 小于 2 秒、真实电量变化和正常屈伸
  零误报仍需安装本轮 APK 后复测，不能用自动化结果代替。

下一步任务：

1. 审查并合并 PR #37；合并后使用长期证书工作流生成正式签名 APK。
2. 安装正式 APK，用两只 BT50 连续训练 30 分钟，验证队列收敛、实时延迟、真实电量、
   结束训练、历史摘要、正常屈伸误报和单侧断开。
3. 真机验收后再决定是否将冲击筛查升级为正式告警；当前仍是需要人工核对的实验性提示。

Agent 工作记录：

| 日期 | 已完成 | 当前状态 | 下一步 | 验证 |
| --- | --- | --- | --- | --- |
| 2026-07-26 | 备份生产数据库并部署 v0.4.3 账号、历史、训练结果、保留策略与真实电量改造，应用新增数据库迁移 | 生产运行分支提交 `61acb87`；Web/API/数据库已上线，PR #37 尚待合并，真实双 BT50 长测待执行 | 合并 PR #37，生成长期签名 APK 并完成 30 分钟双实物验收 | 备份 1,450,785 字节且 `pg_restore -l` 可读；迁移成功；3 个容器正常；`verify-production.mjs` 通过；公网 ready/login 200、裸域 301 |
| 2026-07-26 | 补齐邮箱找回/修改密码/退出、账号资料、15 天训练历史、72 小时原始帧保留、完整会话总结、自动 AI、真实 SDK 电量、低负载渲染和有序冲击规则 | 本地与 GitHub 软件门禁通过；生产部署和双实物长测待执行 | 合并 PR #37，部署迁移与 Web，再安装长期证书签名 APK 真机验收 | 本地 `npm test` 44/44、Lint、48 路由 Build、Android JVM/Lint/Debug；GitHub Build `30188926622`、Android `30188926619` 通过 |

### 2026-07-26 Android 网关视觉统一检查点

将 Web 端设计系统移植到 Android 网关（Java 代码构建的 UI，无 XML 布局）。
仅改颜色、字体、圆角、描边与内边距；diff 扫描确认无监听器、网关调用、
状态控制或存储逻辑变更。

已完成：

- 全部界面色彩从旧「蓝色医疗系」（海军蓝/青绿/亮蓝/霓虹轴色）迁移到品牌
  墨绿/米砂/黄铜/苔绿：画布 `F7F4EC`、主视觉墨绿渐变 `1B3129→0B1512`、
  大腿 accent 苔绿 `497A62`、小腿 accent 灰蓝 `2F6076`、成功 `27684D`、
  警示黄铜 `6F4C1C/FBF1DD`、危险陶土红 `B04338`，共 80 处映射，全部按
  WCAG AA 预先校算对比度。
- 主界面 hero 加衬线斜体眉题「TKA CARE OS · GATEWAY」（系统 serif），
  标题改 sans-serif-medium 26sp，与网页端「编辑级点缀」同一气质。
- 横幅与设备行统一为发丝描边卡片（1dp 8% 墨色描边 + 16dp 圆角）；部位
  卡头部改为 accent→深墨斜向渐变，呼应网页 panel-ink 材质。
- 3D 姿态立方体面色与 XYZ 轴色、波形线色改为品牌三色（珊瑚/苔绿/黄铜），
  波形深色底从蓝黑改为墨黑 `0B1512→1B3129`；角度指标从紫色改为黄铜。
- 主题：colorAccent/colorPrimary/状态栏/窗口底色接入品牌色。
- 启动诊断页同步画布色、标题字重与墨绿重试按钮。

已验证：

- Android JVM 单测、Lint、Debug APK 构建全部通过（`BUILD SUCCESSFUL`，
  86 任务），产物 `app-debug.apk` 7,285,261 字节。
- 环境注意事项：本机会话若 `TEMP` 指向含 `~` 短文件名的路径，JDK17 NIO
  Selector 的 AF_UNIX 管道会报 `Unable to establish loopback connection`；
  将 `TEMP/TMP` 指向短 ASCII 路径（如 `C:\tka-tmp`）即可，与代码无关。

尚未完成：

- 未在真机安装查看实际观感；未生成正式签名包（应走 GitHub Actions 长期
  证书流程）。

### 2026-07-26 视觉系统第二轮打磨检查点

用户对第一轮的评价是「比之前好看一点了，但依然不够高级大气」。本轮仍只改
表现层，功能零改动（diff 扫描确认无 onClick / fetch / useState / 表单校验
属性变更）。

已完成：

- 引入 Fraunces 衬线体（next/font，仅拉丁字形）做点缀排印：区块编号、度数
  标签、英文引语使用衬线斜体，正文与标题保持无衬线；新增 `.serif-accent`。
- 大标题改为「大而轻」：display-xl 字重 600 → 500，首页主标题提升到
  xl:6rem，登录页提升到 xl:4.6rem。
- 深色面板材质加层：panel-ink 增加边缘 vignette 压暗层；主按钮与黄铜按钮
  改为纵向微渐变加内高光，黄铜主 CTA 附 hover 扫光（`.sheen`）。
- 关节活动度仪表盘精细化：新增八向度数标签（衬线斜体）、外环 120 秒慢速
  旋转，强化精密仪器氛围。
- 登录/注册表单升级为悬浮卡片（白色 80% + 背景模糊 + e4 阴影），与暖色画布
  拉开层次；身份卡未选中态改为砂色底。
- 首页节奏拉开（区块 py-20 → lg:py-32），能力卡与流程区改用衬线大编号，新增
  收尾 CTA 大区块（panel-ink 圆角面板 + 仪表盘背景 + 双按钮）。
- 修复 tailwind-merge 会吞掉「实色兜底 + 渐变」组合的问题：新增
  `.btn-solid-ink` / `.btn-solid-brass` 工具类，保证渐变失效时按钮仍有实色。

已验证：

- `npm test` 44/44；ESLint 零告警；48 路由生产构建通过。
- 对比度与布局审计覆盖 11 个页面 × 桌面 1280px 与移动 390px（共 16 项）：
  0 项文本低于 WCAG AA，0 横向溢出；登录与注册在 390×844 下整页高度恰为
  844px，无滚动。
- Fraunces 已确认在浏览器中解析生效；功能安全扫描（diff 级）为空。

尚未完成：

- 仍未做人工截图评审与 Firefox / Safari / 真机验收；未部署生产。

### 2026-07-26 全站视觉系统重构检查点

本轮只改表现层，不改任何业务行为。所有 state、事件处理函数、`fetch` 调用、
路由跳转、条件渲染分支和表单校验属性（`type` / `autoComplete` / `required` /
`maxLength` / `minLength` / `inputMode`）均保持原样。

问题定位：

- 站内并存两套配色。`globals.css` 定义的是蓝色医疗风（`#12304a` / `#087e8b`），
  但首页与登录页使用暖米色加墨绿加金（`#f4efe5` / `#17251f` / `#f2c36b`），
  而 Button、Input、Card 等基础组件跟随蓝色系，导致奶油色卡片里嵌蓝色输入框。
- `--font-sans` 声明了 Inter 但从未真正加载，实际回落到系统中文字体。
- 全站 85 处 `font-black`、82 处 `font-bold`，缺少字重层级。
- 9 种互不成比例的任意圆角与大模糊单层阴影混用。
- `* { border-color }` 写在任何 `@layer` 之外。未分层规则优先级高于 Tailwind
  工具类，因此全站 `border-red-200`、`border-white/15` 之类的语义描边一直被
  统一覆盖为同一个灰色，属于既有缺陷。

已完成：

- 建立设计令牌层：墨绿 / 米砂 / 黄铜 / 苔绿四组色阶、语义色、圆角阶梯、
  多层薄阴影与缓动曲线，集中在 `src/app/globals.css`。
- 通过 `next/font` 真正加载 Inter，中文交由 PingFang SC / 鸿蒙 / 雅黑，
  不引入体积很大的中文字体包。
- 重构登录页为整屏分栏：左侧深色品牌面板含关节活动度测量盘主视觉，
  右侧登录区改为并排双身份卡加勾选角标，新增密码显隐切换与错误态
  `role="alert"`；移动端收成紧凑顶栏，390×844 下整页不滚动。
- 重构首页为「主视觉 → 平台能力 → 平台流程 → 页脚」结构。
- 重建 Button / Input / Card / Badge / Dialog / Textarea / Separator，
  全部由令牌驱动；新增 `src/components/brand.tsx` 提供标志与主视觉图形。
- 归并 407 处旧色值、收敛 171 处字重、39 处圆角与 25 处阴影；
  另在 `@theme` 层把约 500 处 Tailwind 默认色（slate / emerald / amber /
  red / sky）整体映射进品牌色系，语义不变且不改调用点。
- 将基础重置规则移入 `@layer base`，修复上述描边失效缺陷。
- 按对比度审计结果调低次级/三级文字与徽章文字亮度。本产品使用者包含
  年长家属，可读性优先于弱对比的装饰效果。

已验证：

- `npm test` 44 项通过（运行时 29、网关 9、API 6）。
- `npm run lint` 零告警；`npm run build` 48 路由生产构建通过。
- 对比度与布局脚本在 1280px 与 390px 两种视口覆盖首页、登录、注册、家属端、
  护士端、证据回放、预约、实时页与设备页：0 项文本低于 WCAG AA，0 横向溢出。
- 浏览器实测确认 Inter 已生效、设计令牌解析正确、描边工具类恢复正常。

尚未完成：

- 未做人工截图评审。本轮视觉结论来自渲染后的计算样式、布局盒模型与对比度
  脚本，不能替代用户在真实浏览器中的观感确认。
- 未在 Firefox、Safari 与真实手机上验收。
- 未部署正式服务器，线上仍是改造前的界面。

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

