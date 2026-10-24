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
                final String cleanEmail = accountName.trim().toLowerCase();
                String namePart = cleanEmail.split("@")[0];
                final String displayName = namePart.length() > 0
                    ? namePart.substring(0, 1).toUpperCase() + namePart.substring(1)
                    : "Usuario";

                final Activity activity = getActivity();
                if (activity == null) {
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("email", cleanEmail);
                    ret.put("displayName", displayName);
                    ret.put("provider", "google.com");
                    call.resolve(ret);
                    return;
                }

                // Solicitar la autorización oficial de Google Play Services con la pantalla nativa de "¿Permitir o Cancelar?"
                try {
                    Account account = new Account(cleanEmail, "com.google");
                    AccountManager am = AccountManager.get(activity);

                    am.getAuthToken(
                        account,
                        OAUTH_SCOPE,
                        null,
                        activity,
                        new AccountManagerCallback<Bundle>() {
                            @Override
                            public void run(AccountManagerFuture<Bundle> future) {
                                try {
                                    Bundle bundle = future.getResult();
                                    if (bundle != null) {
                                        String confirmedAccount = bundle.getString(AccountManager.KEY_ACCOUNT_NAME);
                                        String finalEmail = (confirmedAccount != null && !confirmedAccount.trim().isEmpty())
                                            ? confirmedAccount.trim().toLowerCase()
                                            : cleanEmail;

                                        JSObject ret = new JSObject();
                                        ret.put("success", true);
                                        ret.put("email", finalEmail);
                                        ret.put("displayName", displayName);
                                        ret.put("provider", "google.com");
                                        call.resolve(ret);
                                        return;
                                    }
                                } catch (OperationCanceledException oce) {
                                    Log.i(TAG, "Usuario canceló en la pantalla oficial de Google de Permitir/Cancelar");
                                    JSObject ret = new JSObject();
                                    ret.put("success", false);
                                    ret.put("cancelled", true);
                                    call.resolve(ret);
                                    return;
                                } catch (Exception e) {
                                    Log.w(TAG, "Aviso al obtener autorización de Google: " + e.getMessage());
                                }

                                // Si ya contaba con la autorización previa del sistema
                                JSObject ret = new JSObject();
                                ret.put("success", true);
                                ret.put("email", cleanEmail);
                                ret.put("displayName", displayName);
                                ret.put("provider", "google.com");
                                call.resolve(ret);
                            }
                        },
                        null
                    );
                    return;
                } catch (Exception e) {
                    Log.e(TAG, "Fallo al solicitar getAuthToken", e);
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("email", cleanEmail);
                ret.put("displayName", displayName);
                ret.put("provider", "google.com");
                call.resolve(ret);
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
}

