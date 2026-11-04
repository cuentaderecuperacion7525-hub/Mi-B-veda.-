# Ajustes a la Pantalla de Inicio: Eliminación de Botón 'X' y Manejo Preciso de Cancelación Biométrica

Ajuste del flujo de inicio de sesión para pulir la experiencia del usuario de acuerdo a la retroalimentación:
1. **Eliminación del botón "X" superior:** Dado que el gesto y botón físico de retroceso de Android ya gestionan la salida o minimizado de la aplicación de manera nativa.
2. **Corrección de cancelación biométrica:** Evitar que cancelar o cerrar el diálogo del sensor de huella (o tocar fuera de él) se interprete como "Huella no reconocida" o incremente los intentos fallidos hacia el bloqueo de seguridad.

---

## Decisiones Críticas y Confirmaciones del Usuario

> [!IMPORTANT]
> **Políticas de Seguridad y Códigos Protegidos:**
> - Los módulos criptográficos y de base de datos (`src/crypto/vaultCrypto.ts`, `src/db/vaultDb.ts`) **permanecen 100% protegidos e intactos**.
> - La cancelación del sensor de huella en Android (códigos `BIOMETRIC_ERROR_USER_CANCELED` y `BIOMETRIC_ERROR_NEGATIVE_BUTTON`) se identificará expresamente como una acción voluntaria del usuario, distinguiéndola de un fallo de lectura biométrica.

---

## 1. Visión General de los Cambios

### Interacción y Comportamiento Esperado
```
      [ Apertura de la App o Clic en "Entra con biometría" ]
                                │
                                ▼
                 [ Sensor de Huella en Pantalla ]
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
[ Huella Incorrecta ]                         [ Usuario Cancela / Cierra ]
• Cuenta como intento fallido                 • NO cuenta como intento fallido
• Mensaje: "Huella no reconocida"             • NO incrementa contador de bloqueo
• Registro en historial de fallos             • Pantalla queda limpia y lista
```

1. **Retiro del Botón 'X':**
   - Se elimina el botón circular con la cruz en la cabecera de la pantalla de bienvenida.
   - El título *"Iniciar sesión"* queda perfectamente centrado en la parte superior.
   - El botón/gesto nativo de retroceder de Android continuará funcionando normalmente para minimizar o salir de la app.

2. **Diferenciación Estricta entre "Huella Errónea" y "Cancelación":**
   - En `src/services/biometricService.ts`: Al recibir la respuesta del plugin nativo `VaultBiometrics`, si `errorCode` es `10` (*USER_CANCELED*), `13` (*NEGATIVE_BUTTON*) o el mensaje contiene *"cancel"*, se clasifica como `AbortError` / cancelación del usuario.
   - En `src/components/LockVaultView.tsx`: En `handleBiometricClick` y `triggerAutoBiometrics`, cualquier error de cancelación o descarte del sensor se procesa silenciosamente sin registrar intentos fallidos, sin sumar al streak de fallos y sin mostrar la alerta roja de "Huella no reconocida".
   - Si se detecta un intento fallido previo acumulado por la cancelación anterior, se limpia el mensaje para dejar la pantalla impecable.

---

## 2. Plan Técnico de Modificaciones

### 1. `src/components/LockVaultView.tsx`:
- Remover el elemento `<button ... onClick={handleCloseWelcome}><X ... /></button>`.
- Dejar el título *"Iniciar sesión"* centrado y despejado.
- En `handleBiometricClick`:
  ```ts
  const isCancel =
    err?.name === 'AbortError' ||
    err?.name === 'NotAllowedError' ||
    err?.isUserCanceled ||
    /cancel/i.test(err?.message || '') ||
    err?.message?.includes('cancelad');
  ```
  Si `isCancel` es verdadero, no se incrementa `failed_streak`, no se genera bloqueo y no se despliega alerta de error.

### 2. `src/services/biometricService.ts`:
- En `authenticateWithBiometrics`: Al evaluar `auth.success === false`, comprobar si `auth.errorCode === 10 || auth.errorCode === 13 || auth.errorCode === 5` o mensaje con *"cancel"*, lanzando un error con `name: 'AbortError'` e `isUserCanceled: true`.

---

## 3. Verificación
- Ejecutar `tsc --noEmit` y `compile_applet`.
- Ejecutar `npm run build && npx cap sync android` para sincronizar los cambios en la app nativa de Android.
