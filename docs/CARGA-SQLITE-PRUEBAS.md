# Carga de datos sintéticos de Ayni en SQLite local

El script \`scripts/seed-sqlite.mjs\` genera datos **ficticios**, separados de las cuentas reales, para explorar el directorio, el muro, solicitudes, brigadas, alertas, moderación y campañas. **No está destinado a producción.**

## 1. Actualizar el código

En PowerShell, dentro de la carpeta de Ayni:

\`\`\`powershell
git status
git pull origin main
npm ci
\`\`\`

Si \`git status\` muestra archivos propios modificados, conserva esos cambios y resuelve la sincronización antes de hacer \`git pull\`.

## 2. Detener el backend y confirmar la base

Detén **npm run server** con \`Ctrl+C\`. El frontend puede permanecer abierto, pero deténlo temporalmente si lo prefieres. El cargador trabaja únicamente con SQLite local y utiliza por defecto:

\`server/data/vecino360.sqlite\`

Si tu aplicación utiliza \`$env:VECINO_DB\`, establece la misma ruta en la terminal de carga. No ejecutes este cargador con \`DATABASE_URL\` para PostgreSQL. Si configuraste una URL PostgreSQL en PowerShell, elimínala solo de la terminal usada para la carga:

\`\`\`powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
\`\`\`

Si el archivo SQLite aún no existe, arranca \`npm run server\` una vez, deténlo y repite.

## 3. Vista previa, sin cambios

\`\`\`powershell
node --experimental-strip-types scripts/seed-sqlite.mjs --preview
\`\`\`

Revisa que muestre la **ruta exacta de SQLite**, distrito y sector. Si ya tienes una cuenta en El Tambo, el script suele tomar la ubicación de la primera cuenta no sintética; asegúrate de que el distrito y el sector sean los que deseas demostrar. Si no existe una cuenta, utiliza el sector de muestra de Jesús María.

No uses \`--apply\` si la ruta de SQLite o el distrito no son los esperados.

## 4. Insertar datos sintéticos

Con el servidor detenido:

\`\`\`powershell
node --experimental-strip-types scripts/seed-sqlite.mjs --apply
\`\`\`

El script:

- Hace un respaldo consistente de SQLite, guardado en \`server/data/ayni-antes-carga-<marca-de-tiempo>.sqlite\`.
- Inserta 20 cuentas sintéticas y registros para módulos de la aplicación. No elimina ni actualiza perfiles existentes.
- Omite filas de prueba previamente creadas cuando lo vuelves a ejecutar.
- Guarda las contraseñas aleatorias en \`server/data/ayni-test-credentials.json\`, fuera del control de versiones.
- Revierte las inserciones de la transacción si surge un conflicto.

**Nunca publiques el archivo de credenciales ni el respaldo SQLite.** El archivo de credenciales permite entrar a las cuentas ficticias con permisos para ver y cambiar datos del entorno de prueba.

## 5. Iniciar la aplicación

En la terminal 1, con las variables SMTP que correspondan (si quieres probar registro real):

\`\`\`powershell
npm run server
\`\`\`

En una segunda terminal:

\`\`\`powershell
npm run dev
\`\`\`

Ingresa a \`http://localhost:5173/login\`.

Para entrar a una cuenta de prueba, abre en tu equipo \`server/data/ayni-test-credentials.json\` y utiliza uno de los correos del dominio **@ayni.test** y su contraseña correspondiente. Estas cuentas ficticias **no tienen correo real**, así que no pueden recibir códigos OTP o recuperar contraseñas por email; solo permiten iniciar sesión localmente.

## 6. Recorrido recomendado

1. **Directorio**: abre \`/directorio\` para revisar 12 prestadores.
2. **Muro**: abre \`/muro\` para buscar préstamos, donaciones, favores, productos, movilidad y oficios.
3. **Solicitudes**: abre \`/perfil/solicitudes\` en un perfil de prueba; cambia a otra cuenta para ver el otro lado de una solicitud.
4. **Brigadas**: abre \`/brigada\` y \`/alertas\`, donde existen fichas y alertas simuladas de varios estados.
5. **Moderación**: si no había una presidencia real en ese sector al crear el conjunto, la primera cuenta ficticia de la lista puede mostrar el panel \`/coordinador\`. De lo contrario, utiliza tu cuenta de presidencia real.
6. **Junta**: abre \`/junta\` para consultar las campañas y otras acciones de los participantes.
7. **Sincronización**: abre \`/configuracion\` y pulsa \`Sincronizar\` para que IndexedDB refleje los datos del servidor.

Las ubicaciones son aproximadas alrededor del sector elegido. La interfaz aplica límites por sector: si estás conectado con una cuenta real ubicada en otro sector, no verás necesariamente los mismos registros.

## 7. Comprobar cantidades en SQLite (solo lectura)

Con el backend detenido:

\`\`\`powershell
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('server/data/vecino360.sqlite',{readOnly:true});console.log('Miembros:',db.prepare('SELECT COUNT(*) AS n FROM members').get().n);console.table(db.prepare('SELECT entity,COUNT(*) AS cantidad FROM records GROUP BY entity').all());db.close()"
\`\`\`

Si utilizas una ruta \`VECINO_DB\` diferente, sustituye la ruta literal del comando.

## 8. Precauciones

- Los campos \`verified\` y \`emailVerified\` de estas **cuentas sintéticas** están preconfigurados solo para pruebas. No constituyen verificación real de residencia, documento o correo.
- No deben usarse con ciudadanos reales, y no se recomienda compartir este servidor de pruebas públicamente.
- Si tu SQLite ya tiene usuarios y operaciones reales, usa preferiblemente una **copia aislada** de esa base para evitar mezclar datos ficticios y reales.
- Repetir la carga no borra datos ni reconstruye automáticamente los estados iniciales de las pruebas; conserva las interacciones realizadas.
- El script crea una copia de seguridad. Si necesitas revertir, detén el servidor y hazlo manualmente a partir del respaldo apropiado; no existe un comando automático de reversión.
- Los registros son ejemplos para recorrer las pantallas, no sustituyen la validación del comportamiento completo de todos los flujos.
