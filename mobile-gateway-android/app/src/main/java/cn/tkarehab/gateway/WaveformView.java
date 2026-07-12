package cn.tkarehab.gateway;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import android.util.AttributeSet;
import android.view.View;

import java.util.ArrayDeque;
import java.util.Locale;

/** Multi-series scrolling waveform for live Acc/Gyro/Angle channels. */
public final class WaveformView extends View {
    private static final int CAPACITY = 120;

    private final ArrayDeque<float[]> series = new ArrayDeque<>(CAPACITY);
    private final Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint gridPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint axisPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();

    private String title = "波形";
    private String unit = "";
    private float fixedRange = 0f;
    private final int[] colors = {0xFFFF5252, 0xFF69F0AE, 0xFF40C4FF};
    private final String[] labels = {"X", "Y", "Z"};

    public WaveformView(Context context) {
        super(context);
        init();
    }

    public WaveformView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        gridPaint.setColor(0x22FFFFFF);
        gridPaint.setStrokeWidth(dp(1));
        axisPaint.setColor(0x55FFFFFF);
        axisPaint.setStrokeWidth(dp(1.2f));
        linePaint.setStyle(Paint.Style.STROKE);
        linePaint.setStrokeWidth(dp(2.2f));
        linePaint.setStrokeJoin(Paint.Join.ROUND);
        linePaint.setStrokeCap(Paint.Cap.ROUND);
        textPaint.setColor(0xFFECEFF1);
        textPaint.setTextSize(dp(11));
        setMinimumHeight(dp(132));
    }

    void configure(String title, String unit, float fixedRange) {
        this.title = title;
        this.unit = unit;
        this.fixedRange = fixedRange;
        invalidate();
    }

    void clear() {
        series.clear();
        invalidate();
    }

    void push(float x, float y, float z) {
        if (series.size() >= CAPACITY) {
            series.removeFirst();
        }
        series.addLast(new float[]{x, y, z});
        invalidate();
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int width = MeasureSpec.getSize(widthMeasureSpec);
        int height = resolveSize(dp(140), heightMeasureSpec);
        setMeasuredDimension(width, height);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float w = getWidth();
        float h = getHeight();
        if (w <= 0 || h <= 0) {
            return;
        }

        bgPaint.setShader(new LinearGradient(
                0, 0, 0, h,
                0xFF102027,
                0xFF263238,
                Shader.TileMode.CLAMP
        ));
        canvas.drawRoundRect(0, 0, w, h, dp(14), dp(14), bgPaint);
        bgPaint.setShader(null);

        float left = dp(10);
        float right = w - dp(10);
        float top = dp(28);
        float bottom = h - dp(18);
        float plotW = right - left;
        float plotH = bottom - top;

        for (int i = 1; i < 4; i++) {
            float y = top + plotH * i / 4f;
            canvas.drawLine(left, y, right, y, gridPaint);
        }
        canvas.drawLine(left, top + plotH / 2f, right, top + plotH / 2f, axisPaint);

        canvas.drawText(title + (unit.isEmpty() ? "" : "  (" + unit + ")"), left, dp(16), textPaint);

        if (series.isEmpty()) {
            textPaint.setColor(0x99FFFFFF);
            canvas.drawText("等待数据…", left, top + plotH / 2f, textPaint);
            textPaint.setColor(0xFFECEFF1);
            return;
        }

        float range = fixedRange > 0f ? fixedRange : autoRange();
        if (range < 0.5f) {
            range = 0.5f;
        }

        int count = series.size();
        float step = count <= 1 ? 0f : plotW / (count - 1f);

        for (int channel = 0; channel < 3; channel++) {
            path.reset();
            int index = 0;
            for (float[] sample : series) {
                float x = left + step * index;
                float normalized = sample[channel] / range; // -1..1-ish
                if (normalized > 1f) {
                    normalized = 1f;
                } else if (normalized < -1f) {
                    normalized = -1f;
                }
                float y = top + plotH * 0.5f - normalized * (plotH * 0.45f);
                if (index == 0) {
                    path.moveTo(x, y);
                } else {
                    path.lineTo(x, y);
                }
                index += 1;
            }
            linePaint.setColor(colors[channel]);
            canvas.drawPath(path, linePaint);
        }

        // Legend + latest values
        float[] latest = series.peekLast();
        float legendX = right - dp(118);
        for (int i = 0; i < 3; i++) {
            linePaint.setColor(colors[i]);
            float y = dp(12 + i * 12);
            canvas.drawLine(legendX, y, legendX + dp(14), y, linePaint);
            textPaint.setColor(colors[i]);
            canvas.drawText(
                    String.format(Locale.US, "%s %+6.2f", labels[i], latest[i]),
                    legendX + dp(18),
                    y + dp(3),
                    textPaint
            );
        }
        textPaint.setColor(0xFFECEFF1);
        canvas.drawText(String.format(Locale.US, "±%.1f", range), left, bottom + dp(12), textPaint);
    }

    private float autoRange() {
        float max = 0.01f;
        for (float[] sample : series) {
            max = Math.max(max, Math.abs(sample[0]));
            max = Math.max(max, Math.abs(sample[1]));
            max = Math.max(max, Math.abs(sample[2]));
        }
        return max * 1.25f;
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
