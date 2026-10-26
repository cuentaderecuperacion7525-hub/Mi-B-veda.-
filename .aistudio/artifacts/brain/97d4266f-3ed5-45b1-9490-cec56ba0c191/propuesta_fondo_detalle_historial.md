# Propuesta Visual: Hoja Inferior con Pantalla de Historial Visible

Hemos preparado la maqueta visual en el artefacto:
👉 **`detalle_historial_con_fondo.svg`** (puedes verla en la pestaña **Artifacts**).

---

## Detalle de los Cambios Propuestos

### 1. Pantalla del Historial Visible detrás de la Hoja
- Eliminamos cualquier filtro de desenfoque (`backdrop-blur`) que empañaba u ocultaba la vista inferior.
- La pantalla completa del historial de accesos se mantiene visible con total nitidez detrás de la hoja.

### 2. Capa Oscura `rgba(15, 23, 42, 0.45)`
- Se aplica exactamente la capa de tono pizarra/azul marino oscuro (`rgba(15, 23, 42, 0.45)`).
- La capa utiliza `fixed inset-0 z-55` para cubrir el 100% de la ventana visible del dispositivo, incluyendo la barra de estado superior hasta el borde inferior.

### 3. Cierre al Tocar la Capa Oscura
- Al tocar en cualquier área de la capa que queda por encima de la hoja, se dispara el evento de cierre (`setSelectedLogDetail(null)`).
- La hoja detiene la propagación del clic para que interactuar con la tarjeta no cierre la vista involuntariamente.

### 4. Transición Suave de 200 ms
- La capa oscura y la hoja inferior cuentan con animación fluida de entrada y salida de `200 ms` (`duration-200 transition-opacity ease-out`), logrando un desvanecimiento suave al abrirse y cerrarse.

### 5. Corrección de la Fecha a Minúsculas
- Se elimina la clase CSS `capitalize` que forzaba mayúsculas en cada palabra.
- Se ajusta la función formateadora para generar exactamente:
  **`"Lunes 26 de octubre de 2026"`**
  (Primera letra en mayúscula, conectores y mes en minúsculas conforme a la ortografía estándar del español).

### 6. Sin Modificar la Hoja
- Respetamos al 100% los tamaños, colores, tipografías, bordes, botón "Cerrar" y espaciados originales de tu hoja.
