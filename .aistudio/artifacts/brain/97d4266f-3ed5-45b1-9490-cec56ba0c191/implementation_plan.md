# Sincronización de Fallos Biométricos con Pantalla de Bloqueo Total

## Estado: ¡Implementado y Verificado!

---

### Resumen de la Implementación en `LockVaultView.tsx`:

1. **Conteo Unificado de Fallos**:
   - Cada intento con huella no reconocida o rechazada incrementa la racha de intentos fallidos (`nullvault_failed_streak`).
   - Se registra en el historial con `type: 'failed'` y `method: 'biometric'`.

2. **Bloqueo Total a los 3 Intentos Fallidos**:
   - Al llegar a 3 fallos (ya sea por PIN o por huella digital), la app activa de inmediato la **pantalla de bloqueo total a pantalla completa** con el candado coral `#F87171` y la cuenta regresiva gigante (15s, 20s, 30s).
   - Durante el bloqueo, **se ocultan tanto el teclado del PIN como el botón de huella**, impidiendo cualquier intento hasta que el temporizador finalice.

3. **Detección de Bloqueo Nativo de Android**:
   - Si el hardware de Android desactiva el sensor por exceso de intentos del sistema operativo (`BIOMETRIC_ERROR_LOCKOUT`), la app lo detecta automáticamente y activa la pantalla de bloqueo total.
