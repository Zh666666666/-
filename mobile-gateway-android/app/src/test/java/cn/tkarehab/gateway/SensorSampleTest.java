package cn.tkarehab.gateway;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class SensorSampleTest {
    @Test
    public void formatsUtcTimestampOnAndroidSevenCompatibleApis() {
        assertEquals("2024-01-01T00:00:00.123Z", SensorSample.formatRecordedAt(1_704_067_200_123L));
    }
}
