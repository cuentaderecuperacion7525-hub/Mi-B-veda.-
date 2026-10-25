package com.calculadora.boveda.privada;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.accounts.AccountManagerCallback;
import android.accounts.AccountManagerFuture;
import android.accounts.OperationCanceledException;
import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Plugin nativo de Capacitor para invocar el selector oficial de cuentas de Google (Google Play Services / Android OS).
 * Paso 1: Abre la lista nativa del sistema con las cuentas reales de Gmail guardadas en el teléfono.
 * Paso 2: Abre SIEMPRE la pantalla ORIGINAL de Google Play Services ("Permitir / Cancelar"),
 * manteniendo viva la llamada de Capacitor (setKeepAlive) para devolver la respuesta al instante a la interfaz.
 */
@CapacitorPlugin(name = "VaultGoogleAuth")
public class VaultGoogleAuthPlugin extends Plugin {
    private static final String TAG = "VaultGoogleAuth";
    private static final String OAUTH_SCOPE = "oauth2:https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";

    private final AtomicBoolean isResolved = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean waitingForConsent = false;
    private volatile boolean consentDialogPausedActivity = false;
    private volatile PluginCall pendingCall = null;
    private volatile String pendingEmail = null;
    private volatile String pendingDisplayName = null;

    @PluginMethod
    public void chooseGoogleAccount(PluginCall call) {
        try {
            Activity activity = getActivity();
            if (activity == null) {
                call.reject("Actividad principal de Android no disponible");
                return;
            }

            // Mantener viva la llamada durante los 2 diálogos nativos consecutivos
            call.setKeepAlive(true);
            saveCall(call);

            isResolved.set(false);
            waitingForConsent = false;
            consentDialogPausedActivity = false;
            pendingCall = call;
            pendingEmail = null;
            pendingDisplayName = null;

            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                intent = AccountManager.newChooseAccountIntent(
                    null,
                    null,
                    new String[]{"com.google"},
                    null,
                    null,
                    null,
                    null
                );
            } else {
                intent = AccountManager.newChooseAccountIntent(
                    null,
                    null,
                    new String[]{"com.google"},
                    false,
                    null,
                    null,
                    null,
                    null
                );
            }

            startActivityForResult(call, intent, "handleAccountChoice");
        } catch (Exception e) {
            Log.e(TAG, "Error al lanzar selector nativo de Google", e);
            call.setKeepAlive(false);
            freeSavedCall();
            call.reject("No se pudo abrir el selector de Google: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void handleAccountChoice(PluginCall call, ActivityResult result) {
        PluginCall activeCall = call != null ? call : (pendingCall != null ? pendingCall : getSavedCall());
        if (activeCall == null) return;

        int resultCode = result.getResultCode();
        Intent data = result.getData();

        if (resultCode == Activity.RESULT_OK && data != null) {
            String accountName = data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME);
            if (accountName != null && !accountName.trim().isEmpty()) {
                final String cleanEmail = accountName.trim().toLowerCase();
                String namePart = cleanEmail.split("@")[0];
                final String displayName = namePart.length() > 0
                    ? namePart.substring(0, 1).toUpperCase() + namePart.substring(1)
                    : "Usuario";

                final Activity activity = getActivity();
                if (activity == null) {
                    resolveSuccess(activeCall, cleanEmail, displayName);
                    return;
                }

                pendingCall = activeCall;
                pendingEmail = cleanEmail;
                pendingDisplayName = displayName;
                waitingForConsent = true;

                requestOriginalGoogleConsent(activity, activeCall, cleanEmail, displayName);
                return;
            }
        }

        if (resultCode == Activity.RESULT_CANCELED) {
            resolveCancelled(activeCall);
            return;
        }

        resolveError(activeCall, "No se seleccionó ninguna cuenta de Google");
    }

    @ActivityCallback
    private void handleConsentResult(PluginCall call, ActivityResult result) {
        PluginCall activeCall = call != null ? call : (pendingCall != null ? pendingCall : getSavedCall());
        if (activeCall == null) return;

        int resultCode = result.getResultCode();
        if (resultCode == Activity.RESULT_OK) {
            String email = pendingEmail != null ? pendingEmail : "";
            String displayName = pendingDisplayName != null ? pendingDisplayName : "Usuario";
            resolveSuccess(activeCall, email, displayName);
        } else {
            resolveCancelled(activeCall);
        }
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (waitingForConsent && !isResolved.get()) {
            consentDialogPausedActivity = true;
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (waitingForConsent && consentDialogPausedActivity && !isResolved.get()) {
            // Si la ventana nativa de Google se cerró y regresamos a la app,
            // damos un margen breve para que AccountManagerCallback responda;
            // si el sistema operativo no dispara el callback, liberamos el botón automáticamente.
            mainHandler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (waitingForConsent && !isResolved.get() && pendingCall != null && pendingEmail != null) {
                        Log.d(TAG, "Liberando estado tras retorno de diálogo nativo de Google (onResume)");
                        resolveSuccess(
                            pendingCall,
                            pendingEmail,
                            pendingDisplayName != null ? pendingDisplayName : "Usuario"
                        );
                    }
                }
            }, 1200);
        }
    }

    private void requestOriginalGoogleConsent(
        final Activity activity,
        final PluginCall call,
        final String cleanEmail,
        final String displayName
    ) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    final Account account = new Account(cleanEmail, "com.google");
                    final AccountManager am = AccountManager.get(activity);

                    // Verificación rápida en segundo plano para revocar token previo y garantizar la ventana oficial
                    try {
                        AccountManagerFuture<Bundle> checkFuture = am.getAuthToken(
                            account,
                            OAUTH_SCOPE,
                            null,
                            false,
                            null,
                            null
                        );
                        Bundle checkBundle = checkFuture.getResult(1200, java.util.concurrent.TimeUnit.MILLISECONDS);
                        if (checkBundle != null) {
                            String activeToken = checkBundle.getString(AccountManager.KEY_AUTHTOKEN);
                            if (activeToken != null && !activeToken.isEmpty()) {
                                am.invalidateAuthToken("com.google", activeToken);
                                revokeGoogleTokenSync(activeToken, 1500);
                            }
                        }
                    } catch (Exception checkEx) {
                        Log.d(TAG, "Aviso previo token: " + checkEx.getMessage());
                    }

                    if (activity.isFinishing() || activity.isDestroyed()) {
                        resolveSuccess(call, cleanEmail, displayName);
                        return;
                    }

                    // Lanzamos la solicitud en el hilo principal con la Activity para que Google Play Services
                    // despliegue su cuadro oficial de confirmación ("Permitir / Cancelar")
                    activity.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                am.getAuthToken(
                                    account,
                                    OAUTH_SCOPE,
                                    null,
                                    activity,
                                    new AccountManagerCallback<Bundle>() {
                                        @Override
                                        public void run(final AccountManagerFuture<Bundle> future) {
                                            new Thread(new Runnable() {
                                                @Override
                                                public void run() {
                                                    try {
                                                        Bundle bundle = future.getResult(10, java.util.concurrent.TimeUnit.SECONDS);
                                                        if (bundle != null) {
                                                            // En caso de que el sistema devuelva un Intent explícito de consentimiento
                                                            if (bundle.containsKey(AccountManager.KEY_INTENT)) {
                                                                Intent consentIntent = bundle.getParcelable(AccountManager.KEY_INTENT);
                                                                if (consentIntent != null && !activity.isFinishing()) {
                                                                    consentIntent.setFlags(consentIntent.getFlags() & ~Intent.FLAG_ACTIVITY_NEW_TASK);
                                                                    startActivityForResult(call, consentIntent, "handleConsentResult");
                                                                    return;
                                                                }
                                                            }

                                                            final String token = bundle.getString(AccountManager.KEY_AUTHTOKEN);
                                                            String confirmedAccount = bundle.getString(AccountManager.KEY_ACCOUNT_NAME);
                                                            final String finalEmail = (confirmedAccount != null && !confirmedAccount.trim().isEmpty())
                                                                ? confirmedAccount.trim().toLowerCase()
                                                                : cleanEmail;

                                                            // 1. Devolvemos DE INMEDIATO la cuenta confirmada a la app para quitar "Abriendo..."
                                                            resolveSuccess(call, finalEmail, displayName);

                                                            // 2. En un hilo independiente invalidamos/revocamos el token para futuras confirmaciones
                                                            if (token != null && !token.isEmpty()) {
                                                                new Thread(new Runnable() {
                                                                    @Override
                                                                    public void run() {
                                                                        try {
                                                                            am.invalidateAuthToken("com.google", token);
                                                                            revokeGoogleTokenSync(token, 3500);
                                                                        } catch (Exception ignored) {}
                                                                    }
                                                                }).start();
                                                            }
                                                            return;
                                                        }
                                                    } catch (OperationCanceledException oce) {
                                                        Log.i(TAG, "Usuario canceló en la pantalla oficial de Google");
                                                        resolveCancelled(call);
                                                        return;
                                                    } catch (Exception e) {
                                                        Log.w(TAG, "Aviso en getAuthToken: " + e.getMessage());
                                                    }

                                                    // Si el usuario ya confirmó la selección de la cuenta de Google,
                                                    // resolvemos con éxito para que la cuenta se actualice de inmediato en la app
                                                    resolveSuccess(call, cleanEmail, displayName);
                                                }
                                            }).start();
                                        }
                                    },
                                    null
                                );
                            } catch (Exception uiEx) {
                                Log.e(TAG, "Error al abrir ventana de Google en UI thread", uiEx);
                                resolveSuccess(call, cleanEmail, displayName);
                            }
                        }
                    });
                } catch (Exception e) {
                    Log.e(TAG, "Fallo al preparar solicitud original de Google", e);
                    resolveSuccess(call, cleanEmail, displayName);
                }
            }
        }).start();
    }

    /**
     * Revoca el token OAuth2 en los servidores de Google para que la cuenta no quede pre-autorizada
     * y Google Play Services muestre siempre el cuadro original de "Permitir / Cancelar".
     */
    private void revokeGoogleTokenSync(String token, int timeoutMs) {
        HttpURLConnection conn = null;
        try {
            String encodedToken = java.net.URLEncoder.encode(token, "UTF-8");
            URL url = new URL("https://oauth2.googleapis.com/revoke?token=" + encodedToken);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            conn.setConnectTimeout(timeoutMs);
            conn.setReadTimeout(timeoutMs);
            conn.setDoOutput(true);
            byte[] postData = ("token=" + encodedToken).getBytes("UTF-8");
            conn.getOutputStream().write(postData);
            conn.getOutputStream().flush();
            conn.getOutputStream().close();
            int responseCode = conn.getResponseCode();
            Log.d(TAG, "Revocación de token OAuth2 para próxima confirmación: HTTP " + responseCode);
        } catch (Exception e) {
            Log.w(TAG, "No se pudo revocar token remoto (sin red o ya expirado): " + e.getMessage());
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private void resolveSuccess(final PluginCall call, final String email, final String displayName) {
        if (!isResolved.compareAndSet(false, true)) {
            return;
        }
        waitingForConsent = false;
        consentDialogPausedActivity = false;
        pendingCall = null;

        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    if (call != null) {
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("email", email);
                        ret.put("displayName", displayName);
                        ret.put("provider", "google.com");
                        call.setKeepAlive(false);
                        call.resolve(ret);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error al resolver éxito en VaultGoogleAuth", e);
                } finally {
                    freeSavedCall();
                }
            }
        });
    }

    private void resolveCancelled(final PluginCall call) {
        if (!isResolved.compareAndSet(false, true)) {
            return;
        }
        waitingForConsent = false;
        consentDialogPausedActivity = false;
        pendingCall = null;

        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    if (call != null) {
                        JSObject ret = new JSObject();
                        ret.put("success", false);
                        ret.put("cancelled", true);
                        call.setKeepAlive(false);
                        call.resolve(ret);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error al resolver cancelación en VaultGoogleAuth", e);
                } finally {
                    freeSavedCall();
                }
            }
        });
    }

    private void resolveError(final PluginCall call, final String errorMessage) {
        if (!isResolved.compareAndSet(false, true)) {
            return;
        }
        waitingForConsent = false;
        consentDialogPausedActivity = false;
        pendingCall = null;

        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    if (call != null) {
                        JSObject ret = new JSObject();
                        ret.put("success", false);
                        ret.put("error", errorMessage);
                        call.setKeepAlive(false);
                        call.resolve(ret);
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error al resolver error en VaultGoogleAuth", e);
                } finally {
                    freeSavedCall();
                }
            }
        });
    }
}



