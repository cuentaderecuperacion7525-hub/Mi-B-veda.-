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

/**
 * Plugin nativo de Capacitor para invocar el selector oficial de cuentas de Google (Google Play Services / Android OS).
 * Paso 1: Abre la lista nativa del sistema con las cuentas reales de Gmail guardadas en el teléfono.
 * Paso 2: Abre SIEMPRE la pantalla ORIGINAL de Google Play Services ("Permitir / Cancelar"),
 * invalidando y revocando el token tras cada autorización para que nunca se salte la confirmación original.
 */
@CapacitorPlugin(name = "VaultGoogleAuth")
public class VaultGoogleAuthPlugin extends Plugin {
    private static final String TAG = "VaultGoogleAuth";
    private static final String OAUTH_SCOPE = "oauth2:https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";

    @PluginMethod
    public void chooseGoogleAccount(PluginCall call) {
        try {
            Activity activity = getActivity();
            if (activity == null) {
                call.reject("Actividad principal de Android no disponible");
                return;
            }

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
            call.reject("No se pudo abrir el selector de Google: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void handleAccountChoice(PluginCall call, ActivityResult result) {
        if (call == null) return;

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
                    resolveCancelled(call);
                    return;
                }

                requestOriginalGoogleConsent(activity, call, cleanEmail, displayName, false);
                return;
            }
        }

        if (resultCode == Activity.RESULT_CANCELED) {
            resolveCancelled(call);
            return;
        }

        JSObject ret = new JSObject();
        ret.put("success", false);
        ret.put("error", "No se seleccionó ninguna cuenta de Google");
        call.resolve(ret);
    }

    private void requestOriginalGoogleConsent(
        final Activity activity,
        final PluginCall call,
        final String cleanEmail,
        final String displayName,
        final boolean isRetryAfterRevoke
    ) {
        try {
            final Account account = new Account(cleanEmail, "com.google");
            final AccountManager am = AccountManager.get(activity);
            final long startTime = System.currentTimeMillis();

            am.getAuthToken(
                account,
                OAUTH_SCOPE,
                null,
                activity,
                new AccountManagerCallback<Bundle>() {
                    @Override
                    public void run(AccountManagerFuture<Bundle> future) {
                        new Thread(new Runnable() {
                            @Override
                            public void run() {
                                try {
                                    Bundle bundle = future.getResult();
                                    long elapsed = System.currentTimeMillis() - startTime;

                                    if (bundle != null) {
                                        final String token = bundle.getString(AccountManager.KEY_AUTHTOKEN);
                                        String confirmedAccount = bundle.getString(AccountManager.KEY_ACCOUNT_NAME);
                                        final String finalEmail = (confirmedAccount != null && !confirmedAccount.trim().isEmpty())
                                            ? confirmedAccount.trim().toLowerCase()
                                            : cleanEmail;

                                        // Si respondió en menos de 450ms en el primer intento, significa que Android devolvió
                                        // un token viejo guardado en caché sin mostrar la ventana original de Google.
                                        // Lo invalidamos y revocamos de inmediato y volvemos a lanzar la ventana original de Google.
                                        if (!isRetryAfterRevoke && elapsed < 450 && token != null && !token.isEmpty()) {
                                            am.invalidateAuthToken("com.google", token);
                                            revokeGoogleTokenSync(token);
                                            activity.runOnUiThread(new Runnable() {
                                                @Override
                                                public void run() {
                                                    requestOriginalGoogleConsent(activity, call, cleanEmail, displayName, true);
                                                }
                                            });
                                            return;
                                        }

                                        // Si el usuario ya confirmó en la ventana original de Google,
                                        // invalidamos y revocamos el token en segundo plano para que la próxima vez
                                        // vuelva a aparecer siempre la ventana original de Google de Permitir / Cancelar.
                                        if (token != null && !token.isEmpty()) {
                                            am.invalidateAuthToken("com.google", token);
                                            revokeGoogleTokenSync(token);
                                        }

                                        resolveSuccess(call, finalEmail, displayName);
                                        return;
                                    }
                                } catch (OperationCanceledException oce) {
                                    Log.i(TAG, "Usuario canceló en la pantalla oficial de Google de Permitir/Cancelar");
                                    resolveCancelled(call);
                                    return;
                                } catch (Exception e) {
                                    Log.w(TAG, "Aviso al obtener autorización de Google: " + e.getMessage());
                                    resolveCancelled(call);
                                    return;
                                }

                                resolveCancelled(call);
                            }
                        }).start();
                    }
                },
                null
            );
        } catch (Exception e) {
            Log.e(TAG, "Fallo al solicitar getAuthToken original de Google", e);
            resolveCancelled(call);
        }
    }

    /**
     * Revoca el token OAuth2 en los servidores de Google para que la cuenta no quede pre-autorizada
     * y Google Play Services muestre siempre el cuadro original de "Permitir / Cancelar".
     */
    private void revokeGoogleTokenSync(String token) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL("https://oauth2.googleapis.com/revoke?token=" + token);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(2500);
            conn.setDoOutput(true);
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

    private void resolveSuccess(PluginCall call, String email, String displayName) {
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("email", email);
        ret.put("displayName", displayName);
        ret.put("provider", "google.com");
        call.resolve(ret);
    }

    private void resolveCancelled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("success", false);
        ret.put("cancelled", true);
        call.resolve(ret);
    }
}


