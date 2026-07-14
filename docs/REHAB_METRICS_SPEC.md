# TKA 康复指标与预警公式规范

## 1. 适用范围

本规范定义 Web 端 `src/lib/rehab-metrics.ts` 使用的 ROM、训练过程、数据质量和风险提示公式。
它用于居家康复监测、护士分诊和设备质量检查，不用于自动诊断、自动调整处方或替代医生判断。

只有满足以下条件的样本才进入临床指标：

- 大腿与小腿两只传感器均已绑定并完成零位/轴向校准；
- `kneeAngleMode=DUAL_SENSOR`；
- 单帧 `confidence >= 0.7`；
- 当前窗口至少有 5 个合格角度样本，且数据质量分 `Q >= 55`；
- 单传感器临时角度、Demo 值和未校准数据不得伪装成临床 ROM。

## 2. 膝关节角与 ROM

### 2.1 双传感器关节角

生产目标算法采用校准后的大腿和小腿姿态计算相对旋转：

```text
q_rel(t) = inverse(q_thigh_calibrated(t)) * q_shank_calibrated(t)
theta_knee(t) = project_to_calibrated_flexion_axis(q_rel(t)) - theta_zero
```

当前 Android/共享网关仍使用校准后的矢状面 Pitch 差作为过渡实现：

```text
theta_knee(t) = clamp(abs(pitch_shank(t) - pitch_thigh(t) - theta_zero), 0, 150)
```

双 MIMU 方法的合理流程是：传感器融合、传感器坐标系与肢段坐标系对齐、计算肢段相对姿态，再提取关节角和 ROM。参考验证研究：[A convenient approach for knee kinematics assessment using wearable inertial sensors](https://pmc.ncbi.nlm.nih.gov/articles/PMC10122771/)。

Pitch 差只是当前工程过渡算法。完成真实量角器验证前，不得将其宣传为临床级精度；后续应升级为四元数相对姿态和功能轴校准。

### 2.2 鲁棒 ROM

为避免蓝牙抖动、欧拉角跳变和瞬时尖峰直接污染结果，Web 不使用简单最大值减最小值：

```text
theta_min = P05(theta_knee)
theta_peak = P95(theta_knee)
ROM = max(0, theta_peak - theta_min)
extension_deficit = max(0, theta_min)
target_completion = clamp(theta_peak / patient_target, 0, 1.5) * 100%
```

其中 `P05/P95` 是当前评估窗口的第 5/95 百分位。患者目标来自 `Patient.targetFlexion`，不是统一强制目标。
TKA 屈曲恢复在个体间差异明显，早期改善较快、随后逐步平台化，因此产品使用个体目标和自身趋势，不用单一术后日期阈值替代临床判断。依据：[Reference chart for knee flexion following total knee arthroplasty](https://pmc.ncbi.nlm.nih.gov/articles/PMC7376933/)；[Target range of motion for rehabilitation after TKA](https://pmc.ncbi.nlm.nih.gov/articles/PMC5458350/)。

## 3. 训练过程指标

### 3.1 完整屈伸次数

1. 对膝角执行 3 点中值滤波。
2. 以当前窗口 `P10/P90` 估计动态幅度 `A`。
3. `A < 15°` 时不计为有效屈伸训练。
4. 上行越过 `P10 + max(15°, 0.6A)` 后计一次峰值。
5. 必须回落到 `P10 + max(8°, 0.3A)`，才允许计算下一次。

该滞回规则用于抑制峰值附近抖动造成的重复计数。

### 3.2 有效活动时间与节律

```text
active(t) = abs(delta_angle) >= 2° OR gyro_magnitude >= 10°/s
active_duration = sum(delta_t), 0 < delta_t <= 2s and active(t)
cadence = repetitions / active_duration_minutes
```

超过 2 秒的断帧不计入活动时间，避免网络中断被误算成训练。

## 4. 数据质量门

```text
Q = 45 * mean_confidence
  + 25 * eligible_dual_angle_ratio
  + 15 * freshness_factor
  + 15 * sample_adequacy

freshness_factor = clamp(1 - seconds_since_latest / 120, 0, 1)
sample_adequacy = clamp(eligible_sample_count / 30, 0, 1)
```

- `Q >= 75`：GOOD；
- `55 <= Q < 75` 且合格样本不少于 5：FAIR；
- 其他情况：INSUFFICIENT，不输出 ROM 与综合风险分。

质量分是工程可信度，不代表医学准确度。

## 5. 康复风险分

风险分只在质量门通过后生成：

```text
risk = target_gap_points       # 0..30
     + extension_deficit_points # 0..15
     + regression_points        # 0..20
     + pain_points              # 0..20
     + repetition_points        # 0..15
```

- 目标差距：`clamp((target - P95) / 30, 0, 1) * 30`；
- 伸直缺失：`clamp(P05 / 15, 0, 1) * 15`；
- 趋势回退：最近 3 个临床点均值减此前 3 个；下降越接近 15°，加分越接近 20；
- 疼痛：患者报告超过 3/10 后线性加分，7/10 以上额外触发人工复核预警；
- 有效重复：活动时间达到 60 秒但完整重复少于 3 次，加 15 分。

分层：`0-24 STABLE`、`25-49 WATCH`、`50-100 HIGH`。该分数是任务排序工具，不是疾病严重程度或并发症概率。质量门未通过时风险分保持为空；实验性冲击规则仍可发出独立的人工确认事件，但不得借此生成临床 ROM 或综合风险分。

## 6. 疑似跌倒/强冲击筛查

在 1.2 秒滑动窗内同时出现以下模式时，产生实验性高优先级人工确认：

```text
min(acc_magnitude) < 0.8g
max(acc_magnitude) > 2.5g
max(gyro_magnitude) > 80°/s
```

研究表明跌倒识别通常需要联合加速度、角速度和身体倾角，且阈值随设备位置、对象和算法变化。例如研究使用过 `0.8-0.9g` 的低加速度、约 `30-47.3°/s` 的角速度及 `24.7-30°` 的倾角阈值：[Pre-impact fall detection using an inertial sensor unit](https://pmc.ncbi.nlm.nih.gov/articles/PMC4101685/)；[Evaluation of inertial sensor-based pre-impact fall detection algorithms](https://pmc.ncbi.nlm.nih.gov/articles/PMC6412321/)。

本项目传感器安装在大腿/小腿而不是腰部或胸部，因此当前规则只能叫“疑似跌倒或强冲击”，必须电话/现场确认。完成真实 ADL 与模拟事件数据集验证前，不得自动呼叫急救或宣称跌倒确诊。

## 7. 传感器无法判断的急症

IMU 无法识别发热、切口渗液、切口红肿、单侧小腿肿痛、胸痛或呼吸困难。Web 必须始终显示这一边界，并要求患者主动报告。关节置换术后感染和血栓警示症状参考：[AAOS After Your Joint Replacement Surgery](https://orthoinfo.aaos.org/globalassets/pdfs/after-your-joint-replacement-surgery.pdf)。

出现胸痛、呼吸困难、意识异常等急症表现时，应直接使用当地急救流程，不等待传感器分数。

## 8. 上线前验证要求

1. 在伸直及 30°/60°/90°/最大屈曲位置与量角器重复对照，记录平均绝对误差和 95% 一致性界限。
2. 验证不同安装位置、重新佩戴、零点漂移和日内重复性。
3. 使用真实康复动作、坐下、起立、上下床等 ADL 评估疑似跌倒规则的误报率。
4. 阈值改变必须修改测试、本文档和 `docs/PROJECT_STATUS.md`，并由临床负责人审核。
5. 保存公式版本和输入来源；任何 Demo/回放结果必须显式标记来源。
