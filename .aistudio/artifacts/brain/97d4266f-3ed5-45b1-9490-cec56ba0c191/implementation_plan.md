# Saludo Dinámico según la Hora del Día en la Pantalla de Inicio

Actualizar el saludo de bienvenida de la pantalla de inicio de sesión (`LockVaultView.tsx`) para que, en lugar de mostrar siempre un texto fijo `"Hola, [Nombre]"`, salude dinámicamente con `"Buenos días"`, `"Buenas tardes"` o `"Buenas noches"` de acuerdo con la hora local del dispositivo.

## Decisiones Críticas y Confirmación del Usuario

> [!NOTE]
> **Elección confirmada por el usuario:** Sustituir el saludo fijo por la fórmula horaria basada en el horario local del usuario.
> **Regla de oro de códigos protegidos:** No se modificará ninguna lógica criptográfica (`vaultCrypto.ts`), base de datos (`vaultDb.ts`) ni flujos de sesión. El cambio es 100% cosmético en la vista de presentación.

---

## 1. Visión General & Concepto Central

- **Qué hace:** Detecta la hora del reloj del celular al cargar la pantalla de bienvenida y adapta el saludo inicial de forma natural y cálida:
  - De **05:00 a 11:59**: `Buenos días, [Nombre]`
  - De **12:00 a 19:59**: `Buenas tardes, [Nombre]`
  - De **20:00 a 04:59**: `Buenas noches, [Nombre]`
- **Público Objetivo:** Usuarios registrados de la aplicación que inician sesión en su bóveda privada.
- **Beneficio:** Mayor sensación de personalización, familiaridad y calidad visual similar a aplicaciones bancarias premium (como BBVA / Bancomer).

---

## 2. Experiencia de Usuario & Diseño Visual

- **Flujo Visual:**
  1. Al abrir la app estando registrado, la pantalla de inicio presenta el título `"Iniciar sesión"`.
  2. Inmediatamente debajo se lee el saludo dinámico:
     - Ej. en la mañana: *"Buenos días, Luis Alberto"*
     - Ej. en la tarde: *"Buenas tardes, Luis Alberto"*
     - Ej. en la noche: *"Buenas noches, Luis Alberto"*
  3. A la derecha, el avatar circular con las iniciales o fotografía del perfil.
  4. Abajo se mantienen los dos botones de alto contraste: *"Entra con biometría"* y *"Entra con contraseña"*.
- **Tipografía y Estilos:** Se conserva intacta la tipografía `font-serif font-bold text-white` con el fondo medianoche `#060B14`, resplandor cian y estética limpia.

---

## 3. Decisiones de Producto & Consideraciones Técnicas

- **Cálculo local y en tiempo real:**
  - Se utiliza una función pura y liviana `getGreeting()` que evalúa `new Date().getHours()`.
  - No requiere llamadas de red, APIs externas ni almacenamiento adicional en disco.
- **Mantenimiento del nombre limpio:**
  - Continúa utilizando `userDisplayName` (que ya toma únicamente el primer nombre sin apellidos para esta ventana como se solicitó previamente).

---

## 4. Arquitectura del Componente

```
┌────────────────────────────────────────────────────────┐
│ LockVaultView.tsx (Presentación de Bienvenida)         │
│                                                        │
│  [ Header: "Iniciar sesión" ]                          │
│                                                        │
│  [ new Date().getHours() ] ──> getGreeting()           │
│                                      │                 │
│                                      ▼                 │
│                  "Buenos días / tardes / noches,"      │
│                  + userDisplayName                     │
│                                      │                 │
│                               [ Avatar Circular ]      │
│                                                        │
│  [ Botón 1: "Entra con biometría" ]                   │
│  [ Botón 2: "Entra con contraseña" ]                  │
└────────────────────────────────────────────────────────┘
```

---

## 5. Plan de Verificación

1. **Prueba de renderizado:**
   - Simular diferentes horas (mañana, tarde, noche) para verificar que la cadena de texto cambie de forma correcta y fluida.
2. **Validación de compilación y tipos:**
   - Ejecutar `compile_applet` y `lint_applet` (`tsc --noEmit`).
3. **Sincronización:**
   - Ejecutar `npm run build && npx cap sync android`.
