package cn.tkarehab.gateway;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import android.util.AttributeSet;
import android.view.View;

/**
 * Lightweight 3D attitude preview driven by Euler angles (degrees).
 * Uses a projected cube + body axis so field testers can see orientation change
 * the way the official app's attitude panel does, without a GL dependency.
 */
public final class AttitudeCubeView extends View {
    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint edgePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint axisPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint gridPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path facePath = new Path();

    private double rollDeg;
    private double pitchDeg;
    private double yawDeg;
    private int accent = 0xFF00897B;

    public AttitudeCubeView(Context context) {
        super(context);
        init();
    }

    public AttitudeCubeView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        edgePaint.setStyle(Paint.Style.STROKE);
        edgePaint.setStrokeWidth(dp(1.5f));
        edgePaint.setColor(0xFFFFFFFF);

        axisPaint.setStyle(Paint.Style.STROKE);
        axisPaint.setStrokeWidth(dp(3f));
        axisPaint.setStrokeCap(Paint.Cap.ROUND);

        textPaint.setColor(0xFFECEFF1);
        textPaint.setTextSize(dp(11));
        textPaint.setFakeBoldText(true);

        gridPaint.setColor(0x22FFFFFF);
        gridPaint.setStrokeWidth(dp(1));
        setMinimumHeight(dp(180));
    }

    void setAccent(int accent) {
        this.accent = accent;
        invalidate();
    }

    void setAttitude(double rollDeg, double pitchDeg, double yawDeg) {
        this.rollDeg = rollDeg;
        this.pitchDeg = pitchDeg;
        this.yawDeg = yawDeg;
        invalidate();
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int width = MeasureSpec.getSize(widthMeasureSpec);
        int height = resolveSize(dp(190), heightMeasureSpec);
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

        // Background panel
        fillPaint.setShader(new LinearGradient(
                0, 0, w, h,
                darken(accent, 0.45f),
                darken(accent, 0.75f),
                Shader.TileMode.CLAMP
        ));
        canvas.drawRoundRect(0, 0, w, h, dp(16), dp(16), fillPaint);
        fillPaint.setShader(null);

        // Soft grid
        for (int i = 1; i < 6; i++) {
            float x = w * i / 6f;
            float y = h * i / 6f;
            canvas.drawLine(x, 0, x, h, gridPaint);
            canvas.drawLine(0, y, w, y, gridPaint);
        }

        float cx = w * 0.5f;
        float cy = h * 0.52f;
        float scale = Math.min(w, h) * 0.22f;

        // Unit cube corners in body frame
        float[][] corners = {
                {-1, -1, -1}, {1, -1, -1}, {1, 1, -1}, {-1, 1, -1},
                {-1, -1, 1}, {1, -1, 1}, {1, 1, 1}, {-1, 1, 1}
        };
        float[][] projected = new float[8][3];
        for (int i = 0; i < 8; i++) {
            projected[i] = project(corners[i][0], corners[i][1], corners[i][2], scale);
        }

        // Faces: each face is 4 corner indices + color
        int[][] faces = {
                {0, 1, 2, 3}, // back
                {4, 5, 6, 7}, // front
                {0, 1, 5, 4}, // bottom
                {2, 3, 7, 6}, // top
                {0, 3, 7, 4}, // left
                {1, 2, 6, 5}  // right
        };
        int[] faceColors = {
                0xAA455A64,
                0xCC80CBC4,
                0xAA5C6BC0,
                0xCCFFCC80,
                0xAAEF9A9A,
                0xAA90CAF9
        };

        // Painter's algorithm: sort by average depth
        Integer[] order = {0, 1, 2, 3, 4, 5};
        java.util.Arrays.sort(order, (a, b) -> Float.compare(avgZ(projected, faces[a]), avgZ(projected, faces[b])));

        for (int faceIndex : order) {
            int[] idx = faces[faceIndex];
            facePath.reset();
            facePath.moveTo(cx + projected[idx[0]][0], cy - projected[idx[0]][1]);
            for (int i = 1; i < 4; i++) {
                facePath.lineTo(cx + projected[idx[i]][0], cy - projected[idx[i]][1]);
            }
            facePath.close();
            fillPaint.setColor(faceColors[faceIndex]);
            canvas.drawPath(facePath, fillPaint);
            canvas.drawPath(facePath, edgePaint);
        }

        // Body axes
        drawAxis(canvas, cx, cy, scale, 1.6f, 0, 0, 0xFFFF5252, "X");
        drawAxis(canvas, cx, cy, scale, 0, 1.6f, 0, 0xFF69F0AE, "Y");
        drawAxis(canvas, cx, cy, scale, 0, 0, 1.6f, 0xFF40C4FF, "Z");

        canvas.drawText(
                String.format(java.util.Locale.US, "R %+6.1f   P %+6.1f   Y %+6.1f", rollDeg, pitchDeg, yawDeg),
                dp(12),
                dp(18),
                textPaint
        );
    }

    private void drawAxis(Canvas canvas, float cx, float cy, float scale, float x, float y, float z, int color, String label) {
        float[] p = project(x, y, z, scale);
        axisPaint.setColor(color);
        canvas.drawLine(cx, cy, cx + p[0], cy - p[1], axisPaint);
        textPaint.setColor(color);
        canvas.drawText(label, cx + p[0] + dp(4), cy - p[1], textPaint);
        textPaint.setColor(0xFFECEFF1);
    }

    private float[] project(float x, float y, float z, float scale) {
        // ZYX intrinsic-like rotation from sensor Euler degrees.
        double roll = Math.toRadians(rollDeg);
        double pitch = Math.toRadians(pitchDeg);
        double yaw = Math.toRadians(yawDeg);

        double cosR = Math.cos(roll);
        double sinR = Math.sin(roll);
        double cosP = Math.cos(pitch);
        double sinP = Math.sin(pitch);
        double cosY = Math.cos(yaw);
        double sinY = Math.sin(yaw);

        // yaw (Z) -> pitch (Y) -> roll (X)
        double x1 = cosY * x - sinY * y;
        double y1 = sinY * x + cosY * y;
        double z1 = z;

        double x2 = cosP * x1 + sinP * z1;
        double y2 = y1;
        double z2 = -sinP * x1 + cosP * z1;

        double x3 = x2;
        double y3 = cosR * y2 - sinR * z2;
        double z3 = sinR * y2 + cosR * z2;

        // Perspective-ish orthographic blend for stable mobile preview.
        float depth = (float) (1.0 + z3 * 0.18);
        return new float[]{
                (float) (x3 * scale * depth),
                (float) (y3 * scale * depth),
                (float) z3
        };
    }

    private static float avgZ(float[][] projected, int[] idx) {
        float sum = 0f;
        for (int i : idx) {
            sum += projected[i][2];
        }
        return sum / idx.length;
    }

    private static int darken(int color, float factor) {
        int a = (color >>> 24) & 0xFF;
        int r = (int) (((color >>> 16) & 0xFF) * factor);
        int g = (int) (((color >>> 8) & 0xFF) * factor);
        int b = (int) ((color & 0xFF) * factor);
        return (a << 24) | (r << 16) | (g << 8) | b;
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
