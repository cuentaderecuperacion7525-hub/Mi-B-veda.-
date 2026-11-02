# Plan de Implementación: Ajuste del Campo de Correo en Recuperación de PIN

## 1. Resumen de la Solicitud
En la pantalla **Recupera tu PIN** (`LockVaultView.tsx`):
- **Remover el icono `@`:** Se eliminará el símbolo `@` que aparece a la izquierda dentro del campo de texto.
- **Ajustar el cuadro (Opciones 1 y 2):**
  - Altura más compacta y estilizada de **48px** (en lugar de 56px).
  - Bordes más suaves y refinados (radio de curvatura de 14px con contorno sutil de 1.5px).
  - El texto y el marcador de posición (*tucorreo@ejemplo.com*) iniciarán limpiamente desde el margen izquierdo.

---

## 2. Archivo a Modificar y Permiso Requerido
En estricto cumplimiento con la directiva:
> *"No se deben tocar ninguno de los códigos protegidos que tenemos, ninguna y en caso de que se requiera hacer modificaciones, avisar y pedir permiso antes de modificar"*

- **Único archivo afectado:** `src/components/LockVaultView.tsx`
- **Líneas puntuales:** Líneas 1022 a 1055 (estilos del contenedor del input y eliminación del componente `<AtSign />`).
- **Protección garantizada:**
  - La lógica de envío de código por correo (nodemailer / verificación de 6 dígitos) **permanece 100% idéntica**.
  - No se modifica ningún algoritmo de cifrado, PIN ni claves.

---

## 3. Verificación
1. Compilar con `compile_applet`.
2. Validar con `lint_applet` para confirmar cero errores.
3. Sincronizar assets con Android (`npx cap copy android`).
