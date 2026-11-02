# Plan de Implementación: Reemplazo de Leyenda Técnica en Pantalla de Actualizaciones

## 1. Resumen del Cambio
Reemplazar el mensaje técnico:
> *"Escaneando GitHub Releases en busca de nuevas compilaciones..."*

Por la leyenda seleccionada:
> **"Comprobando actualizaciones del sistema..."**

Asimismo, para mantener la coherencia y profesionalismo en toda la pantalla de actualizaciones, se ajustarán de forma complementaria:
- De *"Conectando con GitHub Releases..."* a *"Conectando con el servidor..."*
- De *"No se pudo conectar a GitHub. Revisa tu conexión."* a *"No se pudo conectar con el servidor. Revisa tu conexión."*

---

## 2. Archivo a Modificar y Permiso Requerido
En estricto cumplimiento con la regla:
> *"No se deben tocar ninguno de los códigos protegidos que tenemos, ninguna y en caso de que se requiera hacer modificaciones, avisar y pedir permiso antes de modificar"*
> *"no modifiques el código solo la leyenda que dice eso"*

- **Único archivo afectado:** `src/components/BovedaUpdater.tsx`
- **Líneas puntuales:** Línea 54 (y opcionalmente 107 y 125 para no mostrar "GitHub" al conectar o si falla la red).
- **Protección garantizada:**
  - La lógica de descarga, verificación de versión, APK, firma e instalación **no se modifica en lo absoluto**.
  - No se toca ningún componente de cifrado, PIN, base de datos ni archivos protegidos.

---

## 3. Verificación
1. Compilar con `compile_applet`.
2. Verificar con `lint_applet` para garantizar que no existan errores de sintaxis ni tipos.
