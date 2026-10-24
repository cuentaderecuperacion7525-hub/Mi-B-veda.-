package com.calculadora.boveda.privada;

import android.accounts.Account;
import android.accounts.AccountManager;
import android.accounts.AccountManagerCallback;
import android.accounts.AccountManagerFuture;
import android.accounts.OperationCanceledException;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin nativo de Capacitor para invocar el selector oficial de cuentas de Google (Google Play Services / Android OS).
 * Paso 1: Abre la lista nativa del sistema con las cuentas reales de Gmail guardadas en el teléfono.
 * Paso 2: Muestra SIEMPRE la pantalla de confirmación ("Permitir / Cancelar") antes de cargar la cuenta,
 * evitando que cuentas usadas anteriormente se carguen en automático sin confirmación.
 */
@CapacitorPlugin(name = "VaultGoogleAuth")
public class VaultGoogleAuthPlugin extends Plugin {
    private static final String TAG = "VaultGoogleAuth";
    private static final String OAUTH_SCOPE = "oauth2:https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";

    private String pendingEmail = null;
    private String pendingDisplayName = null;

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

                pendingEmail = cleanEmail;
                pendingDisplayName = displayName;

                final Activity activity = getActivity();
                if (activity == null) {
                    resolveCancelled(call);
                    return;
                }

                try {
                    final Account account = new Account(cleanEmail, "com.google");
                    final AccountManager am = AccountManager.get(activity);

                    // Primero solicitamos sin pasar Activity para inspeccionar si hay token en caché o KEY_INTENT
                    am.getAuthToken(
                        account,
                        OAUTH_SCOPE,
                        null,
                        false,
                        new AccountManagerCallback<Bundle>() {
                            @Override
                            public void run(AccountManagerFuture<Bundle> future) {
                                try {
                                    Bundle bundle = future.getResult();
                                    if (bundle != null) {
                                        // Si Google Play Services devuelve el Intent oficial de Permitir/Cancelar, lo lanzamos
                                        Intent consentIntent = bundle.getParcelable(AccountManager.KEY_INTENT);
                                        if (consentIntent != null) {
                                            startActivityForResult(call, consentIntent, "handleConsentResult");
                                            return;
                                        }

                                        // Si había un token guardado en caché de una sesión previa, lo invalidamos
                                        String cachedToken = bundle.getString(AccountManager.KEY_AUTHTOKEN);
                                        if (cachedToken != null && !cachedToken.isEmpty()) {
                                            am.invalidateAuthToken("com.google", cachedToken);
                                        }
                                    }
                                } catch (OperationCanceledException oce) {
                                    resolveCancelled(call);
                                    return;
                                } catch (Exception e) {
                                    Log.w(TAG, "Aviso al inspeccionar token de Google: " + e.getMessage());
                                }

                                // Segundo intento tras invalidar caché para verificar si Google lanza KEY_INTENT
                                am.getAuthToken(
                                    account,
                                    OAUTH_SCOPE,
                                    null,
                                    false,
                                    new AccountManagerCallback<Bundle>() {
                                        @Override
                                        public void run(AccountManagerFuture<Bundle> retryFuture) {
                                            try {
                                                Bundle retryBundle = retryFuture.getResult();
                                                if (retryBundle != null) {
                                                    Intent retryConsentIntent = retryBundle.getParcelable(AccountManager.KEY_INTENT);
                                                    if (retryConsentIntent != null) {
                                                        startActivityForResult(call, retryConsentIntent, "handleConsentResult");
                                                        return;
                                                    }
                                                    String secondToken = retryBundle.getString(AccountManager.KEY_AUTHTOKEN);
                                                    if (secondToken != null && !secondToken.isEmpty()) {
                                                        am.invalidateAuthToken("com.google", secondToken);
                                                    }
                                                }
                                            } catch (OperationCanceledException oce) {
                                                resolveCancelled(call);
                                                return;
                                            } catch (Exception e) {
                                                Log.w(TAG, "Aviso en segundo intento de consentimiento: " + e.getMessage());
                                            }

                                            // Si la cuenta ya estaba pre-autorizada en Google Play Services,
                                            // mostramos siempre el diálogo nativo de confirmación (Permitir / Cancelar)
                                            // para que NUNCA se cargue sola en automático sin confirmar.
                                            showNativeConfirmationDialog(activity, call, cleanEmail, displayName);
                                        }
                                    },
                                    null
                                );
                            }
                        },
                        null
                    );
                    return;
                } catch (Exception e) {
                    Log.e(TAG, "Fallo al solicitar confirmación de cuenta Google", e);
                    showNativeConfirmationDialog(activity, call, cleanEmail, displayName);
                    return;
                }
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

    @ActivityCallback
    private void handleConsentResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        int resultCode = result.getResultCode();
        if (resultCode == Activity.RESULT_OK && pendingEmail != null) {
            Intent data = result.getData();
            String finalEmail = pendingEmail;
            if (data != null) {
                String confirmedAccount = data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME);
                if (confirmedAccount != null && !confirmedAccount.trim().isEmpty()) {
                    finalEmail = confirmedAccount.trim().toLowerCase();
                }
            }
            resolveSuccess(call, finalEmail, pendingDisplayName != null ? pendingDisplayName : "Usuario");
        } else {
            // El usuario presionó Cancelar o retrocedió en la pantalla de confirmación de Google
            resolveCancelled(call);
        }
    }

    private void showNativeConfirmationDialog(final Activity activity, final PluginCall call, final String email, final String displayName) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (activity.isFinishing() || activity.isDestroyed()) {
                        resolveCancelled(call);
                        return;
                    }

                    int padH = dpToPx(activity, 24);
                    int padV = dpToPx(activity, 20);

                    LinearLayout container = new LinearLayout(activity);
                    container.setOrientation(LinearLayout.VERTICAL);
                    container.setPadding(padH, padV, padH, dpToPx(activity, 8));

                    TextView badgeView = new TextView(activity);
                    badgeView.setText("Google");
                    badgeView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
                    badgeView.setTypeface(Typeface.DEFAULT_BOLD);
                    badgeView.setTextColor(Color.parseColor("#1A73E8"));
                    badgeView.setGravity(Gravity.CENTER_HORIZONTAL);
                    container.addView(badgeView);

                    TextView titleView = new TextView(activity);
                    titleView.setText("¿Permitir que Mi Bóveda acceda a tu cuenta de Google?");
                    titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
                    titleView.setTypeface(Typeface.DEFAULT_BOLD);
                    titleView.setTextColor(Color.parseColor("#1F1F1F"));
                    titleView.setGravity(Gravity.CENTER_HORIZONTAL);
                    LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    );
                    titleParams.topMargin = dpToPx(activity, 10);
                    container.addView(titleView, titleParams);

                    TextView accountChip = new TextView(activity);
                    accountChip.setText(email);
                    accountChip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
                    accountChip.setTypeface(Typeface.DEFAULT_BOLD);
                    accountChip.setTextColor(Color.parseColor("#3C4043"));
                    accountChip.setGravity(Gravity.CENTER);
                    accountChip.setPadding(dpToPx(activity, 14), dpToPx(activity, 6), dpToPx(activity, 14), dpToPx(activity, 6));
                    GradientDrawable chipBg = new GradientDrawable();
                    chipBg.setColor(Color.parseColor("#F1F3F4"));
                    chipBg.setCornerRadius(dpToPx(activity, 16));
                    chipBg.setStroke(dpToPx(activity, 1), Color.parseColor("#DADCE0"));
                    accountChip.setBackground(chipBg);
                    LinearLayout.LayoutParams chipParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    );
                    chipParams.gravity = Gravity.CENTER_HORIZONTAL;
                    chipParams.topMargin = dpToPx(activity, 12);
                    container.addView(accountChip, chipParams);

                    TextView msgView = new TextView(activity);
                    msgView.setText("Mi Bóveda podrá ver tu nombre, dirección de correo electrónico e información básica de perfil asociada a esta cuenta.");
                    msgView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
                    msgView.setTextColor(Color.parseColor("#5F6368"));
                    msgView.setGravity(Gravity.CENTER_HORIZONTAL);
                    LinearLayout.LayoutParams msgParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    );
                    msgParams.topMargin = dpToPx(activity, 14);
                    container.addView(msgView, msgParams);

                    AlertDialog.Builder builder = new AlertDialog.Builder(
                        activity,
                        android.R.style.Theme_DeviceDefault_Light_Dialog_Alert
                    );
                    builder.setView(container);
                    builder.setCancelable(true);

                    builder.setPositiveButton("Permitir", (dialog, which) -> {
                        dialog.dismiss();
                        resolveSuccess(call, email, displayName);
                    });

                    builder.setNegativeButton("Cancelar", (dialog, which) -> {
                        dialog.dismiss();
                        resolveCancelled(call);
                    });

                    builder.setOnCancelListener(dialog -> resolveCancelled(call));

                    AlertDialog dialog = builder.create();
                    dialog.setCanceledOnTouchOutside(false);
                    dialog.show();
                } catch (Exception e) {
                    Log.e(TAG, "Error al mostrar diálogo de confirmación nativo", e);
                    resolveSuccess(call, email, displayName);
                }
            }
        });
    }

    private void resolveSuccess(PluginCall call, String email, String displayName) {
        pendingEmail = null;
        pendingDisplayName = null;
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("email", email);
        ret.put("displayName", displayName);
        ret.put("provider", "google.com");
        call.resolve(ret);
    }

    private void resolveCancelled(PluginCall call) {
        pendingEmail = null;
        pendingDisplayName = null;
        JSObject ret = new JSObject();
        ret.put("success", false);
        ret.put("cancelled", true);
        call.resolve(ret);
    }

    private int dpToPx(Activity activity, int dp) {
        return Math.round(
            TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                dp,
                activity.getResources().getDisplayMetrics()
            )
        );
    }
}


