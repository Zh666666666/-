# 项目状态与 Agent 交接

最后更新：2026-07-10

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
- 已创建 iOS BLE 网关工程：SwiftUI 现场操作界面、Core Bluetooth 双设备接入、BLE5 二进制解析、Keychain 加密离线队列、HTTPS 上传与 iPhone 无 USB 自检；macOS CI 已完成 Swift 核心测试和未签名模拟器构建。

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

- 默认分支：`main`
- GitHub 仓库：`https://github.com/Zh666666666/-`
- 本地 `npm run lint`：通过
- 本地 `npm run build`：通过
- GitHub Actions：通过
- 云端无密钥时：使用 Demo 模式
- 目标型号：已调整为更具性价比的 `WT9011DCL-BT50`，购买或换货状态待确认
- Android 网关：v0.2 最低 Android 7.0（API 24）、目标 API 35；Debug 包名改为 `cn.tkarehab.gateway.debug` 以便与正式版共存，Release 保持 `cn.tkarehab.gateway`；GitHub Actions 已生成长期证书签名的 v2/v3/v4 Release APK，并以 Android APK 签名库验证 v4 `.idsig`；安装自检已通过 Android CI，尚未连接 Android 手机或实物传感器验证
- iOS 网关：已建立最低 iOS 17 的独立工程，面向 iPhone 15 Pro（iOS 26.5.2）设计；macOS CI 已通过 Swift 核心测试和未签名模拟器构建，尚未通过 TestFlight 或真实 WT9011DCL-BT50 验证
- 正式服务器：暂不可用，尚未部署生产环境
- 当前产品性质：可演示、可云端开发；演示数据与真实硬件数据已在来源链上隔离，生产服务器恢复后需先执行新增的传感器样本来源迁移，尚未完成真实硬件与生产部署验收
- 视觉系统：核心工作台已完成临床化 UI 收敛，其他业务页面继续复用共享卡片、按钮、输入框和导航样式

## 下一步任务

按优先级从上到下执行：

1. **P0 - 验证手机 Codex 闭环**
   - 确认云端任务能读取 `AGENTS.md` 和本文件。
   - 确认云端任务能修改分支、运行检查并创建 Pull Request。
2. **P0 - 编译与验证 Android BLE 硬件接入助手**
   - 从 GitHub Actions 下载无 USB 测试 APK，在 Android 真机确认应用启动、蓝牙权限和基础页面。
   - 提供或确认长期保存的 Android release keystore，将其配置为仓库 Secrets 后生成可持续升级的 v2/v3/v4 正式签名 APK。
   - 在真机上确认 WT9011DCL-BT50 的搜索、连接、SDK 输出键、采样频率和权限流程。
   - 设备到货后确认物理序列号；当前 `BLE-...` 仅是手机端网关标识，不能作为已验证的厂商序列号。
   - 通过断网采集和恢复网络验证加密离线队列与 API 补传。
3. **P0 - 编译与验证 iOS BLE 硬件接入助手**
   - 在 iPhone 15 Pro 上安装开发或 TestFlight 包，确认蓝牙授权、安装自检和基础页面。
   - 用 WT9011DCL-BT50 确认 GATT UUID、通知包、双传感器配对、归零、断网补传和角度对照。
4. **P0 - WT9011DCL-BT50 到货实机联调**
   - 确认 BLE 设备标识、SDK 输出键、采样频率、坐标轴方向和通知数据。
   - 完成双传感器安装、零点校准和膝关节角度算法验证。
   - 对照维特工具记录原始数据，证明系统使用的是真实采集值。
5. **P1 - 自动化测试**
   - 为硬件 API、数据校验、重复样本和离线补传增加测试。
   - 增加家属端与护士端关键流程的浏览器回归测试。
6. **P1 - 正式服务器部署**
   - 恢复服务器后配置数据库、环境变量、HTTPS、迁移和备份。
   - 验证家属端、护士端、Realtime 和硬件上传链路。
7. **P1 - 产品安全与交付**
   - 完善真实账号权限、审计日志、患者隐私和告警升级规则。
   - 编写安装、校准、使用、故障处理和交付验收文档。

## Agent 工作记录

| 日期 | 已完成事项 | 当前状态 | 下一步任务 | 验证 |
| --- | --- | --- | --- | --- |
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
| 2026-07-10 | 新建 iOS 网关：Core Bluetooth、WT BLE5 解析、Keychain 加密队列、平台上传、SwiftUI 无 USB 自检与 macOS CI | iPhone 15 Pro 是首台目标测试机；工程和 CI 已验证，未宣称真实 BLE 已连接 | 在 iPhone 和 WT9011DCL-BT50 完成协议、权限、双设备、归零与补传验收 | GitHub Actions `iOS Gateway #29097444308`：`swift test`、未签名 iPhone Simulator `xcodebuild` 均通过 |

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
