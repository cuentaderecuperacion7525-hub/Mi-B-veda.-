# Carpeta con PIN Extra y Asistente de Migración con Código QR

Este plan incorpora dos nuevas funciones de privacidad y portabilidad a **Mi Bóveda**: una **Carpeta con PIN extra** (de 4 dígitos independiente) presente dentro de todas las categorías (**Fotos, Videos, Audios, Aplicaciones y Documentos**) para resguardar el contenido más delicado, y un **Asistente paso a paso con Código QR** para migrar toda la bóveda hacia un celular nuevo de forma guiada y cifrada, **sin tocar ninguno de los códigos protegidos**.

---

## Decisiones Confirmadas y Revisión del Usuario

> [!IMPORTANT]
> Ninguno de los módulos criptográficos ni de base de datos protegidos será modificado. Toda la funcionalidad se construye mediante servicios independientes y vistas integradas al diseño actual (Modo Claro y Cian Neón).

- **Ubicación de la Carpeta con PIN Extra (Confirmado)**: Aparecerá fija dentro de la lista de carpetas de **todas las categorías**: *Fotos, Videos, Audios, Aplicaciones y Documentos*.
- **Tipo de PIN Extra (Confirmado)**: Un **PIN de 4 dígitos independiente** del PIN principal de la bóveda. Si el usuario aún no lo ha creado, al tocar la carpeta por primera vez se le guiará para configurarlo en dos pasos (crear y confirmar).
- **Flujo de Migración de Celular (Confirmado)**: **Asistente paso a paso con Código QR y respaldo cifrado**, con dos modos claros (*"Este es mi celular actual"* y *"Este es mi celular nuevo"*).

---

## 1. Concepto General y Valor Principal

- **Qué hace**:
  1. **Carpeta con PIN Extra en cada categoría**: Agrega un álbum blindado llamado **“Carpeta con PIN”** dentro de *Fotos, Videos, Audios, Aplicaciones y Documentos*. Cualquier archivo guardado o movido a esta carpeta queda oculto de la vista de *Archivos Recientes* y de las búsquedas generales, exigiendo siempre el segundo PIN de 4 dígitos para abrirse y bloqueándose automáticamente en cuanto el usuario sale de la carpeta.
  2. **Asistente de Migración con Código QR**: Guía al usuario paso a paso para pasar toda su bóveda (archivos cifrados, álbumes y configuración de Carpeta con PIN) de un teléfono a otro combinando la exportación cifrada `.boveda` con un **Código QR de vinculación y verificación** (y código numérico alternativo) que agiliza la validación en el teléfono nuevo.
- **Beneficio clave**: Máxima privacidad frente a miradas de terceros incluso cuando la bóveda principal está abierta, y cambio de teléfono sin riesgo de perder archivos ni configuraciones.

---

## 2. Experiencia de Usuario y Diseño Visual

### A. Flujo 1: Carpeta con PIN Extra (Fotos, Videos, Audios, Aplicaciones y Documentos)
1. **Presencia en todas las categorías**:
   - Al entrar a *Fotos*, *Videos*, *Audios*, *Aplicaciones* o *Documentos*, junto a la carpeta *General* aparecerá destacada la tarjeta **“Carpeta con PIN”** con un icono de escudo/candado y un indicador de estado (*“Protegida con PIN extra”* o *“Toca para crear tu PIN de 4 dígitos”*).
   - Esta carpeta especial no puede ser eliminada ni renombrada por error, y su contador de archivos permanece oculto (`••• protegidos`) hasta que se desbloquea.
2. **Creación y Desbloqueo con Teclado Táctil**:
   - **Primera vez**: Al tocar **“Carpeta con PIN”**, se abre un modal con el mismo estilo visual limpio de la pantalla de PIN para crear y confirmar el nuevo **PIN Extra de 4 dígitos** (validando que no sea idéntico al PIN principal de la bóveda para garantizar doble barrera real).
   - **Accesos siguientes**: Al tocar la carpeta, solicita el PIN Extra de 4 dígitos mediante el teclado numérico táctil. Al ingresar el cuarto dígito correcto, se abre de inmediato el contenido exclusivo de esa categoría.
   - **Auto-bloqueo inmediato**: Al regresar a la lista de carpetas, cambiar de pestaña o bloquear la app, la *Carpeta con PIN* vuelve a cerrarse automáticamente.
3. **Mover o Añadir Archivos Delicados**:
   - Desde cualquier carpeta normal, al seleccionar uno o varios archivos y tocar **“Mover a carpeta”**, aparecerá la opción **“Carpeta con PIN”** con ícono de candado.
   - Dentro de una *Carpeta con PIN* ya desbloqueada, el botón **“Añadir a esta carpeta”** importará las nuevas fotos, videos, audios, apps o documentos directamente dentro de ese espacio blindado.
   - En la pestaña **Seguridad**, se añadirá un control para **Cambiar PIN de Carpeta Extra** validando el PIN actual.

### B. Flujo 2: Asistente de Migración a Otro Celular con Código QR
1. **Acceso directo**:
   - Disponible desde **Configuración → Copia de Seguridad** (y como acceso rápido **“Migrar a otro celular”**).
2. **Selección de Dispositivo**:
   - El asistente pregunta primero:
     - **Opción 1: “Enviar desde este celular (Celular Actual)”**
     - **Opción 2: “Recibir en este celular (Celular Nuevo)”**
3. **Modo “Celular Actual” (3 pasos guiados)**:
   - **Paso 1 (Preparar paquete cifrado)**: Genera el archivo de respaldo cifrado `.boveda` con barra de progreso en tiempo real (`0%` a `100%`) e incluye los metadatos de carpetas y del PIN extra.
   - **Paso 2 (Enviar archivo al celular nuevo)**: Botones directos para **Compartir archivo** (Quick Share, Bluetooth, WhatsApp, Drive) o **Guardar en Descargas**.
   - **Paso 3 (Mostrar Código QR de Vinculación)**: Muestra en pantalla un **Código QR de alto contraste** junto con una clave corta de verificación para que el celular nuevo valide la autenticidad del respaldo y sincronice los ajustes de la bóveda.
4. **Modo “Celular Nuevo” (2 pasos guiados)**:
   - **Paso 1 (Escanear Código QR o ingresar clave)**: Abre el lector de cámara integrado para escanear el QR del celular anterior (con opción de introducir el código manualmente si la cámara no está disponible).
   - **Paso 2 (Seleccionar respaldo y restaurar)**: Permite elegir el archivo `.boveda` recibido, verifica automáticamente la clave derivada del QR/PIN y restaura todos los archivos y carpetas mostrando la barra de progreso de `0%` a `100%`.

### C. Identidad Visual y Tema
- **Adaptación Dual (Modo Claro y Cian Neón)**:
  - Usa estrictamente las variables semánticas (`--theme-bg-main`, `--theme-bg-card`, `--theme-primary`, `--theme-text-main`, `--theme-border`) para mantener legibilidad total tanto en el tema Claro por defecto como en el tema Cian Neón.
- **Ergonomía Móvil**:
  - Botones de acción con área táctil mínima de `48px`, teclado numérico de 4 dígitos centrado en la zona natural del pulgar y transiciones suaves (`<= 200ms`).

---

## 3. Decisiones de Producto y Ventajas Técnicas

- **Decisión 1: Aislamiento criptográfico del PIN Extra sin alterar la base de datos protegida**
  - *Enfoque elegido*: Almacenar el hash PBKDF2/SHA-256 con sal propia del PIN Extra en un servicio independiente y utilizar el identificador reservado de álbum `__VAULT_EXTRA_PIN__` sobre los registros existentes, filtrando esos elementos fuera de *Archivos Recientes* y búsquedas globales.
  - *Por qué*: Respeta al 100% la regla de no tocar los archivos protegidos de base de datos ni de criptografía, y garantiza que al exportar una copia de seguridad todos los archivos de la *Carpeta con PIN* se conserven intactos en su carpeta blindada.
- **Decisión 2: Generador de Código QR en SVG puro (sin librerías externas pesadas ni conexión a internet)**
  - *Enfoque elegido*: Implementar un codificador QR nativo en TypeScript que renderiza un SVG nítido directamente en pantalla, acompañado de escaneo por cámara (`BarcodeDetector` / video canvas) y código alfanumérico de respaldo.
  - *Por qué*: Funciona 100% sin internet (offline), no envía ningún dato a servidores externos y mantiene la privacidad de conocimiento cero.

---

## 4. Arquitectura Técnica y Flujo de Datos

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        INTERFAZ PRINCIPAL DE BÓVEDA                      │
│   Categorías: [Fotos] [Videos] [Audios] [Aplicaciones] [Documentos]      │
└───────────────────┬──────────────────────────────────────┬───────────────┘
                    │                                      │
                    ▼                                      ▼
┌───────────────────────────────────────┐  ┌───────────────────────────────┐
│     SERVICIO CARPETA CON PIN EXTRA    │  │  ASISTENTE MIGRACIÓN CON QR   │
│  • PIN de 4 dígitos independiente     │  │  • Modo Celular Actual (Emisor)│
│  • Álbum blindado en cada categoría   │  │    1. Empaqueta .boveda       │
│  • Oculto de Recientes y Búsqueda     │  │    2. Comparte archivo        │
│  • Auto-bloqueo al salir de carpeta   │  │    3. Muestra QR SVG + Código │
│  • Cambio de PIN en pestaña Seguridad │  │  • Modo Celular Nuevo         │
└───────────────────┬───────────────────┘  │    1. Escanea QR / Código     │
                    │                      │    2. Restaura 0% -> 100%     │
                    └──────────┬───────────┴───────────────┬───────────────┘
                               ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│         NÚCLEO PROTEGIDO INTACTO (SIN MODIFICACIONES DE CÓDIGO)          │
│       Cifrado AES-GCM 256 bits  ·  Almacenamiento IndexedDB Local        │
└──────────────────────────────────────────────────────────────────────────┘
```

### Mapa de Estados e Interacciones
- **Estado de Carpeta con PIN (`isExtraPinFolderUnlocked`)**:
  - Estado booleano en memoria (nunca persistido en disco) que inicia siempre en `false`.
  - Al tocar la carpeta **“Carpeta con PIN”** en cualquiera de las 5 categorías, si `isExtraPinConfigured()` es `false`, abre el modal de creación de PIN de 4 dígitos; si es `true`, abre el modal de verificación de PIN de 4 dígitos.
  - Al salir de la carpeta (`carpetaActiva = 'todas'`), cambiar de categoría o bloquear la bóveda, `isExtraPinFolderUnlocked` vuelve inmediatamente a `false`.
- **Estado del Asistente de Migración (`MigrationWizardModal`)**:
  - Controla la navegación entre pasos (`select_role` → `sender_step_1` → `sender_step_2` → `sender_step_3_qr` o `receiver_step_1_scan` → `receiver_step_2_restore`), gestionando el progreso de empaquetado/restauración (`0%` a `100%`) y el soporte completo para el botón físico/gesto *Atrás* de Android.
