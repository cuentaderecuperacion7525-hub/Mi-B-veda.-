# Diseño Visual: Registro e Inicio de Sesión con Cuenta de Gmail

A continuación se presenta el diseño visual implementado para la vinculación directa con **Google / Gmail**, eliminando por completo la dependencia de códigos por correo y pasando directo a la creación del PIN de la bóveda tras confirmar la cuenta.

---

## 1. Pantalla 1: "Crea tu bóveda" (Inicio con Gmail)
- **Insignia Superior:** Círculo verde esmeralda (`#056444`) con halo verde menta e ícono de caja fuerte.
- **Acción Principal:** Botón oficial **"Iniciar sesión con Gmail"** con el logotipo multicolor de Google.
- **Opción Alternativa:** Enlace inferior *"¿Prefieres ingresar tus datos manualmente?"* para confirmar nombre y dirección de Gmail en un toque si el usuario lo prefiere.

![Pantalla 1 - Iniciar sesión con Gmail](file:///.aistudio/artifacts/brain/97d4266f-3ed5-45b1-9490-cec56ba0c191/pantalla_1_login_gmail.png)

---

## 2. Pantalla 2: "¡Cuenta de Gmail verificada!" (Confirmación y Paso a PIN)
- **Avatar Verificado:** Muestra la foto de perfil de Google del usuario (o su inicial) con la insignia verde de verificación (`✓`).
- **Tarjeta Resumen:** Presenta el nombre completo de la cuenta, la etiqueta **"✓ Verificado"** en verde esmeralda y el correo electrónico de Gmail vinculado.
- **Botón de Acción:** **"Aceptar y crear PIN de la bóveda →"**. Al pulsarlo, dirige inmediatamente a la pantalla de configuración del PIN de seguridad de la bóveda (`SetupVaultView`).
- **Cambio de Cuenta:** Botón inferior *"↻ Usar otra cuenta de Gmail"* por si desea elegir otro correo antes de continuar.

![Pantalla 2 - Cuenta de Gmail verificada](file:///.aistudio/artifacts/brain/97d4266f-3ed5-45b1-9490-cec56ba0c191/pantalla_2_confirmacion_gmail.png)

---

## 3. Pestaña "Info": Cambio y Confirmación de Correo de Gmail
- Dentro de la pestaña **Info (Perfil)**, al presionar **Editar**, el modal **"Editar Mis Datos y Cuenta"** permite modificar el correo electrónico directamente.
- Incluye el botón **"Confirmar o cambiar con cuenta de Gmail"** con el logo de Google para autenticar y cambiar la cuenta vinculada con un solo toque, guardando los cambios al instante sin pedir códigos.

![Pantalla 3 - Editar Mis Datos y Cuenta en Pestaña Info](file:///.aistudio/artifacts/brain/97d4266f-3ed5-45b1-9490-cec56ba0c191/pantalla_3_info_cambio_correo.png)

---

## Resumen del Flujo de Usuario
1. **Registro Inicial (`InitialRegisterView.tsx`)**:
   - El usuario toca **"Iniciar sesión con Gmail"**.
   - Selecciona su cuenta de Google.
   - Ve la pantalla **"¡Cuenta de Gmail verificada!"** con sus datos.
   - Toca **"Aceptar y crear PIN de la bóveda"** → Pasa directo a crear su PIN de ingreso a la bóveda.
2. **Modificación en Pestaña Info (`ProfileVaultView.tsx`)**:
   - El usuario abre la pestaña **Info** → toca el botón de **Editar**.
   - Toca **"Confirmar o cambiar con cuenta de Gmail"** (o escribe su nuevo correo de Gmail) y pulsa **"Guardar"**.
   - El perfil queda actualizado y verificado de inmediato.
