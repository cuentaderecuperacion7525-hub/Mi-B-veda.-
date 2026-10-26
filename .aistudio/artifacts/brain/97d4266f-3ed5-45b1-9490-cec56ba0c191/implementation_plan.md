# Plan de Implementación: Pantalla Completa de Bloqueo por Exceso de Intentos

## Estado: ¡Completado y Verificado!

---

### Resumen de la Implementación en `LockVaultView.tsx`

1. **Pantalla Completa de Bloqueo Dedicada**:
   - Al activarse un bloqueo temporal (`remainingLockout > 0`), se oculta por completo el teclado y los controles de PIN, dando paso a una pantalla completa de alta seguridad centrada vertical y horizontalmente.

2. **Adaptabilidad a los Temas de la Aplicación**:
   - **Modo Oscuro / Neón**: Fondo cyber navy profundo (`var(--theme-bg-main)`), texto en blanco puro (`text-white`) y resplandor coral ambiental.
   - **Modo Claro**: Fondo limpio claro (`#f1f5f9`), texto en negro / pizarra oscuro (`text-slate-900`), conservando el alto contraste y la elegancia.

3. **Elementos Visuales Implementados**:
   - **Ícono Superior**: Candado `Lock` en color coral `#F87171` dentro de un recuadro redondeado con borde `rgba(248, 113, 113, 0.55)` y fondo `rgba(248, 113, 113, 0.08)`.
   - **Título**: `"Intentos fallidos"` en tipografía grande y destacada.
   - **Subtítulo**: `"Por seguridad, tu bóveda se bloqueó temporalmente"`.
   - **Temporizador**: Leyenda `"INTENTA DE NUEVO EN"` en mayúsculas y la cuenta regresiva en formato digital gigante monoespaciado en color `#F87171` (`00:15`, `00:20`, `00:30`).
   - **Pie de Seguridad**: `"Tus archivos siguen protegidos"` con ícono de escudo.

4. **Inactividad e Integridad**:
   - Durante el bloqueo no existe teclado táctil ni botón de huella, y los eventos del teclado físico quedan deshabilitados.
   - La persistencia en `localStorage` (`nullvault_lockout_until`) asegura que el bloqueo se mantenga si el usuario cierra y reabre la app.

5. **Transición Suave**:
   - Al llegar a `00:00`, se ejecuta una transición suave de desvanecimiento (`fade-in duration-300`) regresando a la pantalla normal de PIN con el teclado activo.
