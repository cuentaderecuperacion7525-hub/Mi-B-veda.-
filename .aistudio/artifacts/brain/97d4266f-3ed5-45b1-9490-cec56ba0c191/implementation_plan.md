# Bloqueo de Desplazamiento Nativo (Android / Capacitor / GitHub WebAPK)

## Estado: ¡Implementado y Verificado!

---

### Solución al desplazamiento no deseado del fondo al interactuar con la hoja inferior

1. **Bloqueo Nativo de Scroll (`document.body` y `document.documentElement`)**:
   - En cuanto `selectedLogDetail` se abre, se bloquea el scroll a nivel de contenedor nativo (`overflow: hidden`, `overscrollBehavior: none`, `touchAction: none`).
   - Al cerrarse la hoja, se restauran automáticamente las propiedades originales.

2. **Aislamiento Táctil en la Capa Oscura**:
   - Se añadió `touch-none` y `onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}` para que tocar o arrastrar sobre la capa oscura no filtre eventos al WebView de Android.

3. **Gesto Exclusivo para la Hoja Inferior**:
   - Al deslizar el dedo hacia abajo sobre la hoja, los eventos `e.preventDefault()` y `e.stopPropagation()` aseguran que el gesto solo desplace la hoja para cerrarla, dejando la pantalla del fondo 100% inmóvil en su posición original.
   - Si se desliza hacia arriba, también se intercepta el evento para evitar rebotes elásticos del WebView.
