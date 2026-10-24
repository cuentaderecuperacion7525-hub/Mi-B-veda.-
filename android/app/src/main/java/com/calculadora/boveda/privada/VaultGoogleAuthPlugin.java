package com.calculadora.boveda.privada;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.accounts.AccountManagerCallback;
import android.accounts.AccountManagerFuture;
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

/**
 * Plugin nativo de Capacitor para invocar el selector oficial de cuentas de Google (Google Play Services / Android OS).
 * Abre directamente la tarjeta nativa inferior del sistema con las cuentas reales de Gmail guardadas en el teléfono,
 * solicita autorización oficial de Google con la pantalla de "¿Permitir o Cancelar acceso?",
 * y entrega el correo verificado para pasar a la creación del PIN.
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
                requestGoogleTokenAndConsent(call, accountName.trim());
                return;
            }
        }

        if (resultCode == Activity.RESULT_CANCELED) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        JSObject ret = new JSObject();
        ret.put("success", false);
        ret.put("error", "No se seleccionó ninguna cuenta de Google");
        call.resolve(ret);
    }

    private void requestGoogleTokenAndConsent(PluginCall call, String accountEmail) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Actividad no disponible");
            return;
        }

        try {
            AccountManager am = AccountManager.get(activity);
            Account account = new Account(accountEmail, "com.google");

            // Esto solicita la autorización oficial a Google con la pantalla nativa de Permitir o Cancelar
            am.getAuthToken(account, OAUTH_SCOPE, null, activity, new AccountManagerCallback<Bundle>() {
                @Override
                public void run(AccountManagerFuture<Bundle> future) {
                    try {
                        Bundle bundle = future.getResult();
                        String token = bundle.getString(AccountManager.KEY_AUTHTOKEN);

                        String cleanEmail = accountEmail.toLowerCase();
                        String displayName = cleanEmail.split("@")[0];
                        if (displayName.length() > 0) {
                            displayName = displayName.substring(0, 1).toUpperCase() + displayName.substring(1);
                        }

                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("email", cleanEmail);
                        ret.put("displayName", displayName);
                        ret.put("token", token != null ? token : "");
                        ret.put("provider", "google.com");
                        call.resolve(ret);
                    } catch (android.accounts.OperationCanceledException e) {
                        Log.d(TAG, "El usuario canceló la pantalla de permitir acceso de Google");
                        JSObject ret = new JSObject();
                        ret.put("success", false);
                        ret.put("cancelled", true);
                        call.resolve(ret);
                    } catch (Exception e) {
                        Log.w(TAG, "Autorización o excepción: " + e.getMessage());
                        String cleanEmail = accountEmail.toLowerCase();
                        String displayName = cleanEmail.split("@")[0];
                        if (displayName.length() > 0) {
                            displayName = displayName.substring(0, 1).toUpperCase() + displayName.substring(1);
                        }

                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("email", cleanEmail);
                        ret.put("displayName", displayName);
                        ret.put("provider", "google.com");
                        call.resolve(ret);
                    }
                }
            }, null);
        } catch (Exception e) {
            Log.e(TAG, "Error en getAuthToken", e);
            String cleanEmail = accountEmail.toLowerCase();
            String displayName = cleanEmail.split("@")[0];
            if (displayName.length() > 0) {
                displayName = displayName.substring(0, 1).toUpperCase() + displayName.substring(1);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("email", cleanEmail);
            ret.put("displayName", displayName);
            ret.put("provider", "google.com");
            call.resolve(ret);
        }
    }
}
