package com.calculadora.boveda.privada;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQ_CODE = 1001;

    public static void applySystemBarsTheme(final Activity activity, final boolean isDark) {
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            try {
                Window window = activity.getWindow();
                if (window == null) return;
                View decorView = window.getDecorView();

                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
                window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);

                int statusColor = isDark ? Color.parseColor("#060B14") : Color.parseColor("#FFFFFF");
                int navColor = isDark ? Color.parseColor("#0A121D") : Color.parseColor("#FFFFFF");

                window.setStatusBarColor(statusColor);
                window.setNavigationBarColor(navColor);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    window.setNavigationBarDividerColor( isDark ? Color.parseColor("#1E293B") : Color.parseColor("#E2E8F0") );
                }

                WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
                if (controller != null) {
                    controller.setAppearanceLightStatusBars(!isDark);
                    controller.setAppearanceLightNavigationBars(!isDark);
                }
            } catch (Exception ignored) {}
        });
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VaultBiometricsPlugin.class);
        registerPlugin(VaultSecurityPlugin.class);
        registerPlugin(VaultMediaPlugin.class);
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(VaultGoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);

        // Asegurar que el contenido de la ventana respete las barras del sistema de forma uniforme en todas las versiones de Android
        try {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        } catch (Exception ignored) {}

        // Aplicar colores iniciales de barra de estado y navegación (Tema Claro por defecto)
        applySystemBarsTheme(this, false);

        // Bloqueo total a nivel de sistema operativo para capturas y grabaciones de pantalla
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // Solicitar permisos necesarios desde el inicio (Cámara + Acceso Multimedia para MediaStore)
        checkAndRequestAppPermissions();

        // Concesión automática de permisos de cámara al WebView interno y soporte para descargas
        if (getBridge() != null && getBridge().getWebView() != null) {
            final WebView webView = getBridge().getWebView();

            // Sincronizar insets reales con variables CSS para evitar espacios dobles en distintos teléfonos
            ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
                Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
                float density = v.getResources().getDisplayMetrics().density;
                if (density <= 0f) density = 1f;

                int[] loc = new int[2];
                v.getLocationOnScreen(loc);

                // Si loc[1] > 0, Android ya desplazó el WebView debajo de la barra de estado
                float topDp = (loc[1] <= 2) ? (bars.top / density) : 0f;

                int screenHeight = v.getResources().getDisplayMetrics().heightPixels;
                int webViewBottom = loc[1] + v.getHeight();
                // Si el WebView llega hasta el fondo físico de la pantalla, descontar la barra de navegación
                float bottomDp = (webViewBottom > 0 && screenHeight - webViewBottom <= 4) ? (bars.bottom / density) : 0f;

                final String js = String.format(
                    Locale.US,
                    "document.documentElement.style.setProperty('--safe-top','%.1fpx');document.documentElement.style.setProperty('--safe-bottom','%.1fpx');",
                    topDp,
                    bottomDp
                );
                v.post(() -> {
                    try {
                        webView.evaluateJavascript(js, null);
                    } catch (Exception ignored) {}
                });

                return ViewCompat.onApplyWindowInsets(v, windowInsets);
            });

            webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    request.grant(request.getResources());
                }

                @Override
                public boolean onShowFileChooser(
                    android.webkit.WebView view,
                    android.webkit.ValueCallback<android.net.Uri[]> filePathCallback,
                    android.webkit.WebChromeClient.FileChooserParams fileChooserParams
                ) {
                    android.webkit.ValueCallback<android.net.Uri[]> wrappedCallback = uris -> {
                        if (uris != null && uris.length > 0) {
                            try {
                                VaultMediaPlugin.recordPickedUris(getApplicationContext(), uris);
                            } catch (Exception ignored) {}
                        }
                        filePathCallback.onReceiveValue(uris);
                    };
                    return super.onShowFileChooser(view, wrappedCallback, fileChooserParams);
                }
            });

            webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
                try {
                    android.app.DownloadManager.Request request = new android.app.DownloadManager.Request(android.net.Uri.parse(url));
                    request.setMimeType(mimetype != null ? mimetype : "application/json");
                    request.addRequestHeader("User-Agent", userAgent);
                    request.setDescription("Descargando copia de seguridad...");
                    String fileName = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimetype);
                    request.setTitle(fileName);
                    request.allowScanningByMediaScanner();
                    request.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, fileName);
                    android.app.DownloadManager dm = (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    if (dm != null) {
                        dm.enqueue(request);
                    }
                } catch (Exception ignored) {}
            });
        }
    }

    private void checkAndRequestAppPermissions() {
        List<String> neededPermissions = new ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            neededPermissions.add(Manifest.permission.CAMERA);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Android 13+ (API 33+)
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                neededPermissions.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED) {
                neededPermissions.add(Manifest.permission.READ_MEDIA_VIDEO);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                neededPermissions.add(Manifest.permission.READ_MEDIA_AUDIO);
            }
        } else {
            // Android 12 y anteriores
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                neededPermissions.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
            if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                    neededPermissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
                }
            }
        }

        if (!neededPermissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, neededPermissions.toArray(new String[0]), PERMISSION_REQ_CODE);
        }
    }
}

