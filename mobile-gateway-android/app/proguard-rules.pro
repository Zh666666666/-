# The upstream SDK owns BluetoothGatt callbacks and device listener interfaces.
-keep class com.wit.witsdk.** { *; }
-dontwarn com.wit.witsdk.**

# Remove log calls from release builds without changing control flow.
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}
