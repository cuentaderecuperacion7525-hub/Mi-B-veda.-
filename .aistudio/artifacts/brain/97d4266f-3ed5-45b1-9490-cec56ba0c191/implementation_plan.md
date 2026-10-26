# Corrección de Error de Permissions Policy en Autenticación Biométrica

## Estado: ¡Corregido y Verificado!

---

### Diagnóstico del Error:
- **Causa**: Al ejecutarse en el entorno de previsualización web (iframe cruzado de desarrollo), el navegador bloqueaba las llamadas directas a `navigator.credentials.create` y `navigator.credentials.get` debido a la política de seguridad del navegador:
  `The 'publickey-credentials-create' feature is not enabled in this document. Permissions Policy may be used to delegate Web Authentication capabilities to cross-origin child frames.`

### Solución Implementada:
1. **Detección Automática de Restricción en Iframe**:
   - `biometricService.ts` ahora detecta si la política de permisos de la ventana (`Permissions Policy`) restringe WebAuthn.
   - En lugar de lanzar una excepción que interrumpa la experiencia, activa de inmediato un modo de respaldo local cifrado con AES-GCM (`BIO_TYPE_KEY = 'preview'`).

2. **Compatibilidad Total en Android Nativo (Capacitor / GitHub Actions APK)**:
   - En la aplicación nativa de Android (`Capacitor.isNativePlatform()`), continúa utilizando el plugin de huella nativo (`NativeVaultBiometrics`), comunicándose directamente con el sensor biométrico del dispositivo.

3. **Compatibilidad en Navegador Móvil Independiente (PWA / WebAPK)**:
   - Cuando se ejecuta fuera de un iframe (en Chrome o instalado como WebAPK), WebAuthn continúa interactuando con el sensor de huella de Google Play Services.
