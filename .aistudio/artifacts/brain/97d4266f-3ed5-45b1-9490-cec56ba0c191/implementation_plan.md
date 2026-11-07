# Novedades Dinámicas desde Archivo (`novedades.json` y `NOVEDADES.md`)

Reemplazar los textos fijos de novedades en el código por un sistema dinámico que lee `public/novedades.json` en tiempo de ejecución y se genera automáticamente a partir de `NOVEDADES.md` mediante un script de compilación.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Respeto total al diseño y códigos protegidos**:
> - **Diseño intacto**: No se modifica ningún estilo, color ni estructura visual de la pantalla de Actualizaciones (`BovedaUpdater`), únicamente el origen de los datos de la sección **Novedades**.
> - **Sin textos escritos a mano en el código**: Se eliminan las cadenas fijas de novedades dentro del componente y de `version.ts`. Si `novedades.json` no carga o viene vacío, se mostrará únicamente `"Mejoras de estabilidad y rendimiento"`.
> - **Códigos protegidos intactos**: No se toca ningún archivo de cifrado ni base de datos (`vaultCrypto.ts`, `vaultDb.ts`).

---

## 1. Overview & Core Concept

- **Qué hace**: Permite gestionar las notas de versión desde un archivo sencillo `NOVEDADES.md` en la raíz del proyecto, generando `public/novedades.json` con la fecha actual en español (zona horaria `America/Monterrey`) y mostrándolas dinámicamente en la pantalla de **Actualizaciones**.
- **Valor clave**: Nunca más habrá textos de novedades fijos o desactualizados escritos a mano dentro de los componentes de React.

---

## 2. User Experience & Visual Design

- **Flujo en la pantalla de Actualizaciones**:
  1. Al abrir la pantalla de **Actualizaciones**, el encabezado `Novedades v...` conserva exactamente la variable de versión existente (`updateAvailable ? (serverVersionName || installedVersionName) : installedVersionName`).
  2. Un `useEffect` ejecuta `fetch("novedades.json", { cache: "no-store" })`.
  3. Muestra la `fecha` del JSON a la derecha del encabezado y renderiza cada elemento de `cambios` con su `titulo` en negritas seguido de dos puntos (`: `) y su `texto`, manteniendo el punto indicador cian (`#00d2ff`) y la tipografía actual.
  4. **Respaldo seguro (Fallback)**: Si `novedades.json` falla al cargar o su lista `cambios` está vacía, se muestra un único elemento con el texto `"Mejoras de estabilidad y rendimiento"`.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisión 1: Carga sin caché (`cache: "no-store"`)**
  - *Enfoque elegido*: Usar `fetch("novedades.json", { cache: "no-store" })` dentro de `useEffect`.
  - *Por qué*: Garantiza que tras cada actualización o compilación de la app se lean siempre los datos más recientes sin quedar atrapados en caché.
- **Decisión 2: Generador automatizado (`scripts/generar-novedades.cjs`)**
  - *Enfoque elegido*: Script en CommonJS que lee `NOVEDADES.md` (formato `- Título: texto`), formatea la fecha de compilación en español con `Intl.DateTimeFormat('es-MX', { timeZone: 'America/Monterrey', day: 'numeric', month: 'long', year: 'numeric' })` y escribe `public/novedades.json`.

---

## 4. Technical Architecture & Data Strategy

```
┌──────────────────────────┐
│       NOVEDADES.md       │  "- Título: texto" (1 línea por cambio)
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│ generar-novedades.cjs    │  Genera fecha (America/Monterrey) + array cambios
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  public/novedades.json   │  { "fecha": "...", "cambios": [{ "titulo", "texto" }] }
└────────────┬─────────────┘
             │  fetch("novedades.json", { cache: "no-store" }) en useEffect
             ▼
┌──────────────────────────┐
│    BovedaUpdater.tsx     │  Muestra Novedades v{...}, fecha y lista (o fallback)
└──────────────────────────┘
```

### Entregables Exactos
1. **`NOVEDADES.md`** (en la raíz):
   ```markdown
   - Perfil de usuario: Nuevo diseño oscuro en Editar Perfil.
   - Recuperación de PIN segura: Validación inmediata del correo.
   ```
2. **`public/novedades.json`**:
   ```json
   {
     "fecha": "7 de noviembre de 2026",
     "cambios": [
       { "titulo": "Perfil de usuario", "texto": "Nuevo diseño oscuro en Editar Perfil." },
       { "titulo": "Recuperación de PIN segura", "texto": "Validación inmediata del correo." }
     ]
   }
   ```
3. **`scripts/generar-novedades.cjs`**:
   - Lee `NOVEDADES.md`, separa cada línea `- Título: texto` en `{ titulo, texto }`, calcula la fecha del día en zona horaria `America/Monterrey` en español y guarda `public/novedades.json`.
4. **Componente de Actualizaciones (`BovedaUpdater.tsx`) y limpieza de textos fijos**:
   - Carga `novedades.json` con `fetch("novedades.json", { cache: "no-store" })` en `useEffect`.
   - Elimina cualquier texto fijo de novedades escrito en el código, dejando únicamente `"Mejoras de estabilidad y rendimiento"` como respaldo cuando el archivo no cargue o esté vacío.
