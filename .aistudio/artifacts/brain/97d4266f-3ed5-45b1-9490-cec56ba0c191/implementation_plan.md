# Plan de Implementación: Lectura del Almacenamiento Físico Real de Cualquier Teléfono (StatFs)

## 1. Diagnóstico del Problema (¿Por qué marcaba 10 GB?)
La función del navegador web `navigator.storage.estimate()` está sujeta a restricciones de seguridad del motor Chromium/WebView, el cual asigna una cuota fija de "caja de arena" (sandbox) de aproximadamente 10 GB para aplicaciones web, sin importar que el teléfono tenga 64 GB, 128 GB o 256 GB de memoria física.

Para que la aplicación lea los **GB reales y físicos de cualquier celular** (el tuyo o el de cualquier familiar):
Debemos consultar directamente el sistema operativo Android usando **`android.os.StatFs`** a través del puente nativo de la aplicación.

---

## 2. Archivos a Modificar y Permiso Requerido
En estricto cumplimiento con la regla:
> *"No se deben tocar ninguno de los códigos protegidos que tenemos, ninguna y en caso de que se requiera hacer modificaciones, avisar y pedir permiso antes de modificar"*

Los archivos específicos que se tocarán de forma puntual son:
1. **`android/app/src/main/java/com/calculadora/boveda/privada/VaultSecurityPlugin.java`**:
   - Añadir el método `@PluginMethod public void getRealDeviceStorage(PluginCall call)`.
   - Utiliza `android.os.StatFs` sobre `Environment.getDataDirectory()` para medir los bytes físicos totales y libres reales del hardware del teléfono.
2. **`src/services/nativeVaultBridge.ts`**:
   - Declarar e invocar la función nativa `getRealDeviceStorage()`.
3. **`src/components/MainVaultView.tsx`**:
   - Usar la respuesta nativa de `getRealDeviceStorage()` cuando la app se ejecute en el teléfono.
   - Si no está en APK nativo (ej. pruebas en navegador web de la PC), usa como respaldo `navigator.storage.estimate()`.

**Garantía de códigos protegidos:**
- Cifrado AES-GCM, derivación de claves PBKDF2, PIN de acceso, contraseñas y base de datos quedan **100% intactos**.

---

## 3. Comportamiento Resultante
- En **cualquier teléfono** donde se instale la app:
  - Leerá directamente la memoria interna libre del celular (ejemplo: `0.19 Mb en bóveda · 48.7 GB libres` o `64.2 GB libres`).
  - El círculo porcentual se mantiene marcando el espacio ocupado por la bóveda (ej. `1%` con tus archivos cifrados).

---

## 4. Verificación
1. Compilar la aplicación web con `compile_applet`.
2. Validar con `lint_applet`.
3. Sincronizar el puente con el proyecto Android.
