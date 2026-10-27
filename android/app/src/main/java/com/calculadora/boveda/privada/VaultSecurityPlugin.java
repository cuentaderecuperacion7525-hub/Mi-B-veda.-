package com.calculadora.boveda.privada;

import android.view.WindowManager;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "VaultSecurity")
public class VaultSecurityPlugin extends Plugin {

    @PluginMethod
    public void enableScreenshotBlock(PluginCall call) {
        FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity != null) {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    activity.getWindow().setFlags(
                        WindowManager.LayoutParams.FLAG_SECURE,
                        WindowManager.LayoutParams.FLAG_SECURE
                    );
                }
            });
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void disableScreenshotBlock(PluginCall call) {
        FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity != null) {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                }
            });
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void setSystemBarsTheme(PluginCall call) {
        final boolean isDark = Boolean.TRUE.equals(call.getBoolean("isDark", false));
        FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity != null) {
            MainActivity.applySystemBarsTheme(activity, isDark);
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
}

