# Plan de Implementación: Remover Icono Superior de Huella en Pantalla de Bloqueo

## 1. Resumen de la Solicitud
En la pantalla de desbloqueo por PIN (`LockVaultView.tsx`), actualmente aparece un botón cuadrado grande con el icono de la huella digital en la parte superior, encima del título "Bóveda de Seguridad".
Dado que el teclado numérico ya cuenta con el botón de huella en la esquina inferior izquierda:
- Se **removerá por completo el bloque del icono de huella superior**.
- La tarjeta comenzará limpiamente desde el encabezado **"Bóveda de Seguridad"**, logrando una vista más compacta, moderna y equilibrada.

---

## 2. Archivo a Modificar y Permiso Requerido
En estricto cumplimiento con la directiva:
> *"No se deben tocar ninguno de los códigos protegidos que tenemos, ninguna y en caso de que se requiera hacer modificaciones, avisar y pedir permiso antes de modificar"*

- **Único archivo afectado:** `src/components/LockVaultView.tsx`
- **Líneas puntuales:** Líneas 868 a 907 (el `<button>` del icono de huella superior).
- **Protección garantizada:**
  - La lógica de desbloqueo biométrico, el PIN, la verificación PBKDF2 y la clave de cifrado **no se modifican**.
  - El botón de huella digital en el teclado numérico (`PinKeypad`) sigue funcionando normalmente para autenticación biométrica en el celular.

---

## 3. Verificación
1. Compilar con `compile_applet`.
2. Validar con `lint_applet` para confirmar cero errores de tipos o sintaxis.
3. Sincronizar con el proyecto Android si aplica.
