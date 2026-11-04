# Pantalla de Bienvenida e Inicio de Sesión Personalizada (Estilo Banca Móvil)

Implementación de una pantalla de bienvenida moderna inspirada en el flujo de banca móvil para usuarios registrados en la **Bóveda de Seguridad**, con saludo personalizado, insignia de usuario con iniciales, activación automática del sensor de huella en segundo plano, botón para reintentar biometría y botón para desplegar el teclado numérico del PIN maestro.

---

## Decisiones Críticas y Confirmaciones del Usuario

> [!IMPORTANT]
> **Políticas de Integridad y Código Protegido:**
> 1. **Cero modificaciones en código protegido:** Los módulos criptográficos (`src/crypto/vaultCrypto.ts`, derivación PBKDF2, cifrado AES-GCM 256-bit y comprobación de claves) y de base de datos (`src/db/vaultDb.ts`) **permanecen 100% intactos**.
> 2. **Identidad visual de la app:** La estética sigue la paleta oscura de la bóveda (`#060b14` / `#0a121d`), acentos cian neón (`#00e5ff`), superficies translúcidas (*glassmorphism*) y tipografía nítida de alta legibilidad, en lugar de tonos ajenos.
> 3. **Sensor biométrico automático:** Al cargar la pantalla, si el usuario tiene huella configurada en su Android/dispositivo, el sensor se despliega de inmediato sin necesidad de pulsar nada.

---

## 1. Visión General y Flujo de Usuario

### Flujo de la Experiencia
```
                ┌──────────────────────────────────────────────┐
                │             Apertura de la App               │
                └──────────────────────┬───────────────────────┘
                                       │
                      ¿Usuario Registrado y con PIN?
                                       │
                   ┌───────────────────┴───────────────────┐
                   ▼                                       ▼
        [ Pantalla de Bienvenida ]              [ Teclado de PIN ]
        • "Iniciar sesión" (arriba)             (Si no está registrado
        • "Hola, Jose Manuel" + Avatar (JM)     o si prefiere PIN)
        • Sensor de huella auto-iniciado
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
[ Entra con biometría ]  [ Entra con contraseña ]
  (Relanza el sensor)     (Abre suavemente el PIN)
         │                         │
         ▼                         ▼
   Acceso concedido       Acceso concedido (o volver)
```

1. **Estado Inicial (Usuario Registrado):**
   - Al abrir la app, se detecta el perfil local mediante `userProfileService.getUserProfile()`.
   - Se muestra el encabezado superior con *"Iniciar sesión"*.
   - En la sección central izquierda se presenta el saludo personalizado en texto destacado: **"Hola, [Nombre]"** (ej. *Hola, Jose Manuel*).
   - A la derecha se muestra la insignia circular con las iniciales del usuario (ej. **"JM"**) con un degradado en sintonía con la paleta de la aplicación.
   - En la parte inferior se colocan dos botones ergonómicos de fácil alcance con el pulgar:
     - **"Entra con biometría"**: Botón primario de alto contraste que lanza o reintenta la autenticación biométrica nativa de Android.
     - **"Entra con contraseña"**: Botón secundario estilizado que conmuta de forma instantánea y suave a la vista del teclado numérico PIN.

2. **Apertura Automática del Sensor de Huella:**
   - Tan pronto como la pantalla se monta en el dispositivo, el plugin biométrico (`authenticateWithBiometrics(true)`) es invocado automáticamente si la biometría está registrada.
   - Si el usuario pone su dedo, la bóveda se desbloquea al instante.
   - Si cancela el diálogo de huella nativo de Android, la pantalla de bienvenida permanece visible para que el usuario pueda pulsar *"Entra con biometría"* para reintentarlo o *"Entra con contraseña"* para escribir su PIN.

3. **Vista de Teclado Numérico ("Entra con contraseña"):**
   - Muestra el teclado táctil de 4 dígitos ya pulido y auditado.
   - Incluye un botón discreto en la parte superior izquierda (o enlace) para regresar a la pantalla de bienvenida con saludo.
   - Conserva intacto el flujo de recuperación de PIN por correo ("¿Olvidaste tu PIN?").

---

## 2. Diseño Visual y Ergonomía Táctil

- **Paleta de Colores:**
  - Fondo general: `--theme-bg-main` (`#060b14` en modo oscuro / adaptable por tema).
  - Tarjeta y superficies: Fondo profundo con borde fino `rgba(51, 65, 85, 0.5)`.
  - Botón "Entra con biometría": Superficie prominente blanca / cian de alto contraste con texto oscuro nítido y radio `rounded-2xl` (altura táctil de 52px).
  - Botón "Entra con contraseña": Superficie oscura translúcida con borde fino de acento y texto claro, manteniendo la misma altura ergonómica.
  - Avatar circular: Círculo de 56px de diámetro con iniciales en mayúsculas negrita, con fondo degradado cian/azul neón.

---

## 3. Plan Técnico de Modificaciones

### Archivo a Modificar: `src/components/LockVaultView.tsx`
- **Sin tocar funciones criptográficas:** Únicamente se incorporará el estado de conmutación de vista:
  ```ts
  const [authViewMode, setAuthViewMode] = useState<'welcome' | 'pin'>('welcome');
  ```
- **Integración con perfil:**
  - Se importa `userProfileService` para extraer `firstName`, `lastName` y las iniciales calculadas.
  - Si el usuario no tiene perfil o no está registrado, se muestra por defecto la vista de PIN habitual.
- **Acción "Entra con biometría":** Invoca la función existente `handleBiometricClick()`.
- **Acción "Entra con contraseña":** Cambia `authViewMode` a `'pin'`.
- **Retorno al saludo:** En el modo PIN, un botón en la barra superior o cabecera permite volver a `'welcome'`.

### Verificación
- Ejecutar `tsc --noEmit` para asegurar cero errores de tipos TypeScript.
- Ejecutar `npm run build` para confirmar empaquetado exitoso.
- Ejecutar `npx cap sync android` para actualizar la carpeta nativa de Android.
