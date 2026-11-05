# Plan de Implementación: Características Finales y Preparación para Publicación

Integrar las 3 funciones clave solicitadas antes de la publicación final de la aplicación, garantizando cero modificaciones a los códigos protegidos de cifrado y base de datos:
1. **Exportación en Lote a la Galería:** Conectar y pulir la acción de sacar múltiples archivos seleccionados a la galería pública con modal de progreso adaptado a la estética medianoche.
2. **Ícono Adaptativo y Splash Screen Nativo:** Generar recursos gráficos en alta definición para Android y configurar la pantalla de arranque en `#060B14` para eliminar cualquier parpadeo.
3. **Respaldo Directo en Google Drive:** Añadir opción de compartir/guardar el archivo de respaldo cifrado directamente en Google Drive mediante la hoja de compartir nativa de Android.

---

## Decisiones Críticas y Confirmación del Usuario

> [!IMPORTANT]
> **Regla de Códigos Protegidos:** `src/crypto/vaultCrypto.ts` y `src/db/vaultDb.ts` permanecen 100% intactos. No se altera ningún algoritmo criptográfico (AES-GCM de 256 bits, PBKDF2) ni la estructura de datos interna.
> **Confirmación de Alcance:** El usuario ha validado la ejecución de los tres elementos en conjunto para dejar la aplicación lista para su uso final y publicación.

---

## 1. Visión General & Concepto Central

- **Exportación en Lote:** Permite al usuario seleccionar múltiples fotos, videos o audios y extraerlos de una sola vez hacia la carpeta pública de su dispositivo (`Pictures/MiBoveda` o `Movies/MiBoveda`), retirándolos de forma segura de la bóveda.
- **Identidad Nativa (Ícono y Splash):** Un ícono distintivo con el escudo/candado cian neón sobre azul medianoche y una pantalla de carga nativa sin destellos blancos, elevando la percepción de calidad desde el inicio.
- **Guardado en la Nube (Google Drive):** Facilita resguardar el archivo `.json` de respaldo (totalmente cifrado con contraseña) directamente en Google Drive con un solo toque desde la app.

---

## 2. Experiencia de Usuario & Diseño Visual

### A. Exportación en Lote
- **Flujo:**
  1. El usuario activa selección múltiple (mantener pulsado o tocar el botón de seleccionar).
  2. En la barra flotante inferior, toca el botón **"Sacar (N)"** con icono de descarga.
  3. Se despliega el modal de confirmación con el estilo `#0A121D`, borde translúcido y acento cian.
  4. Al confirmar, una barra de progreso cian animada muestra el avance ("Exportando 4 de 12...") y notifica el éxito.

### B. Ícono y Splash Screen
- **Fondo de Inicio:** Color `#060B14` en `styles.xml` y `colors.xml`.
- **Ícono:** Logotipo adaptativo de alta resolución (`ic_launcher` e `ic_launcher_round`) integrado en todas las densidades de pantalla (`mdpi` a `xxxhdpi`).
- **Arranque:** Cero parpadeo blanco/gris en Android 12, 13, 14 y 15.

### C. Respaldo en Google Drive
- **Flujo:**
  1. En *Configuración > Copia de Seguridad*, junto a "Generar copia", se incluye el botón destacado: **"Guardar en Google Drive"**.
  2. El sistema cifra la copia y despliega la hoja de compartir nativa de Android con la opción prioritaria de **Google Drive**.
  3. El usuario elige la carpeta en su cuenta de Google y el archivo queda resguardado de inmediato.

---

## 3. Decisiones de Producto & Consideraciones Técnicas

| Característica | Enfoque Seleccionado | Razón / Beneficio |
| :--- | :--- | :--- |
| **Exportación en Lote** | Reutilizar `exportVaultItemToDevice` con ráfaga asíncrona secuencial | Evita saturar el puente nativo de Android y actualiza la barra de progreso de forma fluida. |
| **Google Drive** | Hoja nativa del sistema (`navigator.share` / `Intent.ACTION_SEND`) | Cero necesidad de permisos invasivos de Google ni claves OAuth de Drive; 100% nativo y privado. |
| **Splash Nativo** | Configuración de `@color/colorPrimary` en `#060B14` y tema SplashScreen | Resuelve el parpadeo blanco nativo en arranques en frío sin librerías pesadas. |

---

## 4. Arquitectura y Mapeo de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│ Pantalla Principal (MainVaultView.tsx)                      │
│   ├── Modo Selección ──> [ Botón "Sacar (N)" ]             │
│   └── Modal Exportación (Estilo #0A121D + Cian Neón)        │
│         └── exportVaultItemToDevice() en bucle controlado   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Configuración de Respaldo (SettingsVaultView.tsx)          │
│   ├── Botón "Guardar en Google Drive"                       │
│   └── shareOrUploadBackupToDrive()                          │
│         └── navigator.share() / Intent Android nativo       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Android Nativo (res/values/colors.xml & styles.xml)         │
│   ├── colorPrimary = #060B14                                │
│   ├── windowLightStatusBar = false                          │
│   └── Splash Screen en azul medianoche profundo             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Plan de Verificación

1. **Prueba de Exportación en Lote:**
   - Seleccionar 3 fotos de prueba y pulsar "Sacar a la galería".
   - Comprobar que la barra de progreso avance y que los archivos aparezcan en la galería del celular.
2. **Prueba de Guardado en Drive:**
   - Generar un respaldo y pulsar "Guardar en Google Drive".
   - Verificar que se abra el diálogo de compartir/guardar con Google Drive.
3. **Prueba de Splash y Colores:**
   - Verificar `colors.xml` y `styles.xml` para asegurar que el tema base de Android sea `#060B14`.
4. **Validación de Compilación y Sincronización:**
   - Ejecutar `compile_applet` y `lint_applet` (`tsc --noEmit`).
   - Ejecutar `npm run build && npx cap sync android`.
