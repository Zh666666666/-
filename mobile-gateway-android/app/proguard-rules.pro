# The upstream SDK owns BluetoothGatt callbacks and device listener interfaces.
-keep class com.wit.witsdk.** { *; }
-dontwarn com.wit.witsdk.**

# Tink references these compile-time annotations but does not require them at runtime.
-dontwarn javax.annotation.**

# Remove log calls from release builds without changing control flow.
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}
