import { cn } from "@/lib/utils";

/* --------------------------------------------------------------------------
   几何工具：0° 指向正上方，顺时针增大
   -------------------------------------------------------------------------- */

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: +(cx + r * Math.cos(rad)).toFixed(2), y: +(cy + r * Math.sin(rad)).toFixed(2) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/* --------------------------------------------------------------------------
   标志：膝关节屈曲角 —— 股骨段、关节点、胫骨段与活动弧
   -------------------------------------------------------------------------- */

export function BrandMark({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" | "brass" }) {
  const tile = tone === "dark" ? "var(--ink-900)" : tone === "brass" ? "var(--brass-400)" : "#ffffff";
  const stroke = tone === "dark" ? "var(--brass-300)" : tone === "brass" ? "var(--ink-900)" : "var(--ink-900)";
  const arc = tone === "dark" ? "rgba(237,211,163,0.45)" : "rgba(20,35,30,0.35)";

  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9.5" fill={tile} />
      <g fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round">
        <path d="M10 22.5 V9.5" />
        <path d="M10 22.5 L22 16.2" />
      </g>
      <path d="M10 15 A7 7 0 0 1 16.26 18.87" fill="none" stroke={arc} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="22.5" r="2.4" fill={tile} stroke={stroke} strokeWidth="1.8" />
    </svg>
  );
}

export function BrandLockup({
  className,
  tone = "dark",
  subtitle = "术后康复监测平台",
}: {
  className?: string;
  tone?: "dark" | "light";
  subtitle?: string | null;
}) {
  const onDark = tone === "light";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark tone={onDark ? "brass" : "dark"} className="size-9" />
      <div className="leading-tight">
        <p
          className={cn(
            "text-[0.9375rem] font-semibold tracking-[-0.01em]",
            onDark ? "text-[#f6f2e8]" : "text-ink-900",
          )}
        >
          TKA Care OS
        </p>
        {subtitle ? (
          <p className={cn("text-[0.6875rem] tracking-[0.02em]", onDark ? "text-white/45" : "text-[var(--subtle-foreground)]")}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   主视觉：关节活动度测量盘
   同心轨道 + 刻度环 + 活动区间弧 + 扫描线
   -------------------------------------------------------------------------- */

const CX = 240;
const CY = 240;
const TICKS = Array.from({ length: 72 }, (_, index) => index * 5);
const DEGREE_LABELS = [0, 45, 90, 135, 180, 225, 270, 315];

export function RangeOfMotionDial({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 480" aria-hidden="true" className={cn("h-full w-full", className)}>
      <defs>
        <radialGradient id="rom-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(221,180,116,0.22)" />
          <stop offset="55%" stopColor="rgba(91,139,114,0.10)" />
          <stop offset="100%" stopColor="rgba(11,21,18,0)" />
        </radialGradient>
        <linearGradient id="rom-active" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brass-300)" />
          <stop offset="100%" stopColor="var(--sage-400)" />
        </linearGradient>
        <linearGradient id="rom-sweep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(237,211,163,0)" />
          <stop offset="100%" stopColor="rgba(237,211,163,0.85)" />
        </linearGradient>
      </defs>

      <circle cx={CX} cy={CY} r="232" fill="url(#rom-glow)" />

      {/* 轨道 */}
      <circle cx={CX} cy={CY} r="92" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" strokeDasharray="2 7" />
      <circle cx={CX} cy={CY} r="146" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
      <g className="spin-slow" style={{ ["--spin-origin" as string]: `${CX}px ${CY}px` }}>
        <circle cx={CX} cy={CY} r="200" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="2 7" />
      </g>

      {/* 度数标签：精密仪器的氛围来自这些小字 */}
      <g fill="rgba(255,255,255,0.30)" fontSize="11" fontStyle="italic" fontFamily="var(--font-serif)" textAnchor="middle">
        {DEGREE_LABELS.map((deg) => {
          const pos = polar(CX, CY, 184, deg);
          return (
            <text key={deg} x={pos.x} y={pos.y + 3.5}>
              {deg}°
            </text>
          );
        })}
      </g>

      {/* 刻度环 */}
      <g stroke="rgba(255,255,255,0.22)" strokeLinecap="round">
        {TICKS.map((deg) => {
          const major = deg % 30 === 0;
          const inner = polar(CX, CY, major ? 210 : 216, deg);
          const outer = polar(CX, CY, 222, deg);
          return (
            <line
              key={deg}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              strokeWidth={major ? 1.6 : 1}
              opacity={major ? 0.75 : 0.3}
            />
          );
        })}
      </g>

      {/* 活动区间：0°–125° 屈曲 */}
      <path
        d={arcPath(CX, CY, 146, -8, 117)}
        fill="none"
        stroke="url(#rom-active)"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="arc-trace"
        style={{ ["--trace-length" as string]: "420" }}
      />
      <path
        d={arcPath(CX, CY, 92, 8, 96)}
        fill="none"
        stroke="rgba(237,211,163,0.35)"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="arc-trace"
        style={{ ["--trace-length" as string]: "260" }}
      />

      {/* 扫描线 */}
      <g className="arc-sweep" style={{ ["--sweep-origin" as string]: `${CX}px ${CY}px` }}>
        <line x1={CX} y1={CY} x2={CX} y2={CY - 222} stroke="url(#rom-sweep)" strokeWidth="1.5" />
        <circle cx={CX} cy={CY - 146} r="4.5" fill="var(--brass-300)" />
        <circle cx={CX} cy={CY - 146} r="10" fill="rgba(237,211,163,0.16)" />
      </g>

      {/* 关节中心 */}
      <circle cx={CX} cy={CY} r="6" fill="rgba(246,242,232,0.9)" />
      <circle cx={CX} cy={CY} r="16" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
    </svg>
  );
}

/* --------------------------------------------------------------------------
   副视觉：康复趋势脊线，用于卡片留白处
   -------------------------------------------------------------------------- */

const RIDGE = [8, 26, 18, 42, 34, 58, 49, 72, 63, 86, 78, 96];

export function TrendRidge({ className }: { className?: string }) {
  const points = RIDGE.map((value, index) => {
    const x = (index / (RIDGE.length - 1)) * 240;
    const y = 64 - (value / 100) * 56;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 240 64" aria-hidden="true" className={cn("w-full", className)} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ridge-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(221,180,116,0.30)" />
          <stop offset="100%" stopColor="rgba(221,180,116,0)" />
        </linearGradient>
      </defs>
      <polygon points={`0,64 ${points} 240,64`} fill="url(#ridge-fill)" />
      <polyline points={points} fill="none" stroke="var(--brass-300)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
