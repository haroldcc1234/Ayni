# Ayni

Red de ayuda mutua vecinal. El acceso habitual usa una cuenta del servidor. Las publicaciones se conservan en IndexedDB mientras vuelve la conexión.

## Demo para presentar

En Windows, abre **Abrir demo Ayni.cmd**. Se abrirá el recorrido en http://127.0.0.1:4186/recorrido. Mantén la ventana de la terminal abierta durante la presentación. Para iniciarla manualmente, ejecuta `npm run build:demo` y después `npm run demo`. Repite la compilación cuando modifiques la demo.

El recorrido permite consultar un oficio, solicitar un préstamo y publicar una alerta de prueba. El panel permite cambiar de vecino y simular una desconexión. Los datos, la ubicación y el servidor de esta modalidad son de muestra.

## Ejecutar

Requiere Node.js 22.14 o compatible con SQLite y eliminación experimental de tipos. Ejecuta `npm ci`. En una terminal inicia `npm run server` y en otra `npm run dev`. Abre http://localhost:5173. Para probar el service worker usa `npm run build` y `npm run preview`, manteniendo la API en el puerto 4174. La modalidad de demostración aislada se inicia con `npm run dev:demo`.

Configura en el proceso de la API las variables `SMTP_URL` y `MAIL_FROM` de una cuenta de correo autorizada. El registro requiere envío real y GPS. Usa HTTPS en dispositivos externos y `COOKIE_SECURE=1`. El adaptador geográfico consulta un servicio compatible con Nominatim con coordenadas aproximadas. Puedes configurar su URL mediante `REVERSE_GEOCODER_URL`. La base predeterminada es SQLite. `DATABASE_URL` selecciona PostgreSQL con PostGIS.

## Cuenta y ubicación

| Endpoint POST bajo /api/v1 | Función |
|---|---|
| /auth/otp/send | Envía un código para registro o recuperación. Reenvío tras 60 segundos. |
| /auth/otp/verify | Verifica el código, con cinco intentos y diez minutos de vigencia, y emite un comprobante firmado. |
| /auth/register | Valida el comprobante y el GPS y crea la cuenta con contraseña bcrypt. |
| /auth/login | Abre una sesión con JWT de 15 minutos y token de renovación de siete días en cookies HttpOnly. |
| /auth/refresh y /auth/logout | Renueva el acceso o revoca la sesión. |
| /auth/reset | Cambia la contraseña con comprobante de recuperación e invalida las sesiones. |
| /location y /location/resolve | Actualiza la ubicación del perfil o detecta la zona para una publicación. |
| /profile | Guarda nombre, teléfono y foto opcional. |

La tabla `email_challenges` conserva el resumen criptográfico del código, su vencimiento, el último envío y el número de intentos. La inscripción pendiente no concede sesión. `members.profile` contiene estado de verificación, zona y coordenadas aproximadas. La API usa `GET /sync` para lectura y `POST /sync` para operaciones pendientes. Los avisos de actualización llegan por `GET /events`.

## Comprobaciones y próximos pasos

Ejecuta `npm test` y `npm run test:server`. La integración de cuenta usa SQLite en memoria y sustituye el correo y el geocodificador por adaptadores de prueba. Antes del uso vecinal, comprueba entrega y recuperación en buzones reales, precisión del barrio con teléfonos del distrito y navegación con TalkBack y VoiceOver. Mide cuántas personas abandonan el registro tras la solicitud de ubicación y cuánto tardan en recibir el código.

El catálogo, recomendaciones, billetera y junta se operan desde la PWA. La aplicación nativa, la entrega geocercada FCM/APNs, la certificación WCAG y el despliegue de infraestructura distribuida quedan pendientes.
