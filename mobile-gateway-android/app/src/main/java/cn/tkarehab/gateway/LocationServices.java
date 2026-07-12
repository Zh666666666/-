package cn.tkarehab.gateway;

import android.content.Context;
import android.location.LocationManager;
import android.os.Build;
import android.provider.Settings;

/**
 * Location-service checks that work on OEM Android builds.
 *
 * Many Chinese Android skins keep the master location switch on while GPS is off.
 * Official BLE discovery still needs location services enabled on most API levels,
 * so we accept GPS, network, or the master location switch.
 */
final class LocationServices {
    private LocationServices() {
    }

    static boolean isEnabled(Context context) {
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) {
            return true;
        }

        try {
            if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
                    || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                return true;
            }
        } catch (Exception ignored) {
            // Some OEM builds throw for unavailable providers.
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                if (manager.isLocationEnabled()) {
                    return true;
                }
            } catch (Exception ignored) {
                // Fall through to the Settings global flag.
            }
        }

        try {
            return Settings.Secure.getInt(
                    context.getContentResolver(),
                    Settings.Secure.LOCATION_MODE
            ) != Settings.Secure.LOCATION_MODE_OFF;
        } catch (Exception ignored) {
            return false;
        }
    }
}
