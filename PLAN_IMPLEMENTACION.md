# Plan de implementación — VECINO360
## 100 % local · demo en Android · MVP completo

> Documento de trabajo del proyecto. La app se implementa en la raíz de esta carpeta.
> El archivo `prototype/index.html` no forma parte de esta implementación.

---

## 0. Decisiones cerradas

| Decisión | Implicancia |
|---|---|
| **Sin backend** | IndexedDB es la fuente de verdad. No hay API remota, login real, push ni SMS. |
| **Sincronización simulada** | Cola real + “servidor local simulado” en otra base Dexie. Permite demostrar offline → sync → conflicto. |
| **Demo en Android** | Chrome Android, PWA instalada, servida por `adb reverse` desde la laptop. |
| **MVP completo** | Oficios, visto bueno, muro, préstamos, donaciones, favores, banco de tiempo, movilidad, emergencia, brigadistas, coordinador, mapa, notificaciones, moderación y configuración. |
| **Stack** | React + TypeScript + Vite + Tailwind + Dexie + Workbox + Leaflet. |
| **Datos demo** | Personas y publicaciones precargadas; botón de reset. |
| **Sin cuentas reales** | Perfiles locales + selector de persona/rol para la demo. |

### Real vs. simulado

| Real | Simulado |
|---|---|
| CRUD en IndexedDB | Servidor remoto |
| Cola de sincronización y reintentos | Latencia de red |
| Cambio de modo emergencia | Push notifications |
| Visto Bueno ponderado por distancia | Verificación de identidad |
| Roles y permisos | Envío de SMS |
| Audio con MediaRecorder | Geocodificación inversa |
| Mapa con marcadores y capas | Mapa de calor real (círculos por severidad) |
| PWA offline con App Shell | Autenticación OTP |
| Export/import JSON | Moderación automática |

---

## 1. Alcance funcional

### Acceso y perfil
- Splash, onboarding de 3 láminas.
- Registro express: nombre, teléfono opcional, distrito, GPS.
- Perfil con roles, nivel de reputación y estadísticas.
- Edición de perfil.
- Selector de persona/rol para demo.
- Verificación de vecino por coordinador.

### Módulo cotidiano
- Home con sector, accesos rápidos, técnicos recomendados y últimas publicaciones.
- Directorio de oficios con búsqueda, filtros y orden por distancia.
- Ficha de prestador con visto bueno, horario, cobertura y contacto.
- Visto Bueno único por vecino, ponderado por distancia.
- Gestión de “Mis oficios”.
- Muro solidario con filtros por tipo.
- Detalle de publicación con audio, ubicación y solicitud.
- Publicación en 3 clics.
- Préstamo de bienes con fechas y confirmación de devolución.
- Donaciones con confirmación de entrega.
- Favores vecinales.
- Banco de tiempo con horas y habilidades.
- Movilidad solidaria con origen, destino, hora y cupos.
- Solicitudes: crear, aceptar, rechazar, completar.
- “Mis publicaciones” y “Mis solicitudes”.
- Reputación, puntos y niveles.
- Límites anti-free-riding.
- Notificaciones in-app.
- Mapa/radar con capas y radio de 800 m.
- Reportes y moderación.

### Módulo de emergencia
- Activación/desactivación de crisis por coordinador.
- Home de emergencia con banner, contadores y SOS.
- Listado de alertas con filtros por severidad y estado.
- Detalle de alerta con ubicación y “Estoy en camino”.
- Creación de alerta en 3 clics con severidad.
- Directorio de brigadistas con habilidades y recursos.
- Ficha de brigadista y disponibilidad.
- Panel de coordinador: crisis, comunicados, verificación, moderación y métricas.
- Mapa de emergencia con alertas, brigada y necesidades.
- Comunicados que generan notificaciones.

### Plataforma
- PWA instalable y App Shell offline.
- Persistencia en IndexedDB.
- Cola de sincronización + servidor simulado.
- Resolución de conflictos por versión/timestamp.
- Accesibilidad WCAG: 48×48 px, contraste, labels, voz.
- Datos seed y reset demo.
- Export/import JSON.
- Preparación offline de mapas.
- QA en Android físico.

---

## 2. Arquitectura local

```
PWA VECINO360
├── React + TypeScript + Tailwind
├── Zustand (sesión, rol, emergencia, online, toasts)
├── Repositorios (única puerta de escritura)
├── Vecino360DB (Dexie / IndexedDB)  ← fuente de verdad
├── SyncEngine (cola + reintentos + ACK)
├── Vecino360ServerDB (Dexie)        ← “servidor” simulado
└── Service Worker (Workbox)
    ├── precache App Shell
    ├── cache de tiles OSM
    └── fallback de navegación
```

### Principios
1. Toda lectura sale de `Vecino360DB`.
2. Toda escritura pasa por un repositorio y deja registro en `syncQueue`.
3. La UI se actualiza de inmediato (optimistic UI).
4. El `SyncEngine` drena la cola al reconectar, al volver a foco y cada 30 s.
5. El “servidor” simulado permite demostrar ACK, idempotencia y conflictos.

> Con backend real se usaría `BackgroundSyncPlugin` de Workbox. Sin backend no hay peticiones HTTP que encolar, así que la cola se implementa a nivel de aplicación. Workbox se usa para App Shell, tiles y caché.

---

## 3. Stack

- React + TypeScript + Vite.
- Tailwind CSS.
- Dexie + dexie-react-hooks.
- Zustand.
- React Router.
- Leaflet + react-leaflet.
- Lucide React.
- date-fns.
- Workbox vía `vite-plugin-pwa`.
- Vitest + Playwright (pruebas).

---

## 4. Estructura

```
src/
├── app/            # App, router, layout
├── db/             # Dexie, server-db, seed, repositories
├── sync/           # engine, queue, mock-server, conflictos
├── features/       # una carpeta por módulo
├── components/     # ui, layout, cards, map
├── hooks/          # online, geo, role, emergency, audio, sync
├── lib/            # geo, reputation, permissions, audio, storage, export
├── styles/
└── main.tsx
```

---

## 5. Modelo de datos

### Esquema Dexie

```ts
profiles: 'id, name, district, verified, createdAt, updatedAt'
providers: 'id, profileId, trade, district, status, score, updatedAt, syncStatus, [district+status], [trade+district]'
endorsements: 'id, providerId, endorserId, weight, createdAt, syncStatus, [providerId+endorserId]'
listings: 'id, type, category, authorId, district, status, createdAt, expiresAt, updatedAt, syncStatus, [type+status], [district+status], [authorId+createdAt]'
requests: 'id, listingId, requesterId, ownerId, status, createdAt, updatedAt, syncStatus, [listingId+status], [requesterId+status]'
alerts: 'id, severity, category, authorId, status, brigadeProfileId, district, createdAt, updatedAt, syncStatus, [status+severity], [brigadeProfileId+status]'
brigadeProfiles: 'id, profileId, availability, district, updatedAt, syncStatus, [availability+district]'
notifications: 'id, profileId, read, createdAt, [profileId+read]'
reputationEvents: 'id, profileId, type, points, createdAt, [profileId+createdAt]'
reports: 'id, targetType, targetId, reporterId, status, createdAt, [status+createdAt]'
syncQueue: 'id, entity, entityId, operation, status, nextAttemptAt, createdAt, [status+nextAttemptAt]'
settings: 'key'
```

`verified` y `read` se guardan como `0 | 1` porque IndexedDB no acepta booleanos como clave.

### Tipos principales

```ts
type Role = 'vecino' | 'prestador' | 'brigadista' | 'coordinador'
type ListingType = 'service' | 'loan' | 'donation' | 'favor' | 'time_bank' | 'mobility'
type ListingStatus = 'open' | 'reserved' | 'in_progress' | 'completed' | 'expired' | 'hidden'
type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'cancelled'
type AlertSeverity = 'critical' | 'high' | 'medium'
type AlertStatus = 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'cancelled'
type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'error'
```

Campos comunes: `id`, `createdAt`, `updatedAt`, `version`, `syncStatus`.
`Listing.meta` guarda datos específicos: condición/fecha de devolución, cantidad/vencimiento, horas/habilidad, origen/destino/hora/cupos, fecha límite, oficio/radio/horario.

---

## 6. Sincronización local

### Pipeline
1. Aplicar escritura local en una transacción Dexie.
2. Subir `version` y `updatedAt`.
3. Encolar operación con `idempotencyKey`.
4. Disparar `syncEngine.kick()`.

### Cola
```ts
type QueueItem = {
  id: string
  entity: EntityName
  entityId: string
  operation: 'create' | 'update' | 'delete'
  payload: unknown
  baseVersion: number
  idempotencyKey: string
  status: 'pending' | 'syncing' | 'error' | 'conflict'
  attempts: number
  nextAttemptAt: string
  createdAt: string
  lastError?: string
}
```

### Motor
- Si offline o ya sincronizando, no hace nada.
- Toma pendientes vencidos, ordenados por `createdAt`.
- Envía al mock server.
- `ok` → marca `synced`, elimina de la cola.
- `conflict` → marca `conflict`, notifica.
- `error` → backoff exponencial.
- Disparadores: `online`, `visibilitychange`, intervalo 30 s, después de cada mutación, botón manual.

### Servidor simulado
- Base Dexie separada `Vecino360ServerDB`.
- Tabla `records` con clave `${entity}:${id}`.
- Tabla `processedOps` para idempotencia.
- Conflicto si `baseVersion < serverVersion`.
- Estrategia MVP: gana el servidor; se notifica y se actualiza la copia local.

---

## 7. Rutas

| Ruta | Pantalla | Acceso |
|---|---|---|
| `/` | Home cotidiano | Todos |
| `/onboarding` | Onboarding | Sin perfil |
| `/registro` | Registro express | Sin perfil |
| `/directorio` | Directorio | Todos |
| `/directorio/:id` | Ficha de prestador | Todos |
| `/muro` | Muro solidario | Todos |
| `/muro/:id` | Detalle de publicación | Todos |
| `/publicar` | Sheet de 3 clics | Todos |
| `/mapa` | Radar | Todos |
| `/emergencia` | Home emergencia | Todos |
| `/alertas` | Lista de alertas | Todos |
| `/alertas/:id` | Detalle de alerta | Todos |
| `/brigada` | Directorio de brigada | Todos |
| `/brigada/:id` | Ficha de brigadista | Todos |
| `/perfil` | Mi perfil | Todos |
| `/perfil/editar` | Editar perfil | Todos |
| `/perfil/oficios` | Mis oficios | Prestador |
| `/perfil/brigada` | Ficha de brigadista | Brigadista |
| `/perfil/publicaciones` | Mis publicaciones | Todos |
| `/perfil/solicitudes` | Mis solicitudes | Todos |
| `/notificaciones` | Notificaciones | Todos |
| `/configuracion` | Configuración y datos | Todos |
| `/coordinador` | Panel coordinador | Coordinador |
| `/demo` | Panel de demostración | Oculto |

Bottom nav cotidiano: Inicio · Oficios · **Publicar** · Muro · Perfil.
Bottom nav emergencia: Crisis · Alertas · **SOS** · Brigada · Perfil.

---

## 8. Flujos

### Publicación en 3 clics
1. Tipo: ofrecer oficio / prestar-donar bien / solicitar-ofrecer ayuda / reportar alerta.
2. Detalle: subtipo, categoría, título, descripción, audio opcional, campos específicos.
3. Ubicación: GPS, radio, confirmar.

Al confirmar: escribir en Dexie, encolar, actualizar UI, toast.

### Visto Bueno
- Único por `[providerId+endorserId]`.
- Peso por distancia: ≤200 m = 1; ≤500 m = 0.75; ≤800 m = 0.5; resto = 0.25.
- Actualiza score del prestador y notifica.

### Solicitud
`pending → accepted → in_progress → completed`, con `rejected` y `cancelled`.
Al completar se confirman devolución/entrega/horas/traslado y se otorgan puntos.

### Crisis
- Solo coordinador activa/desactiva.
- Cambia banner, nav y home.
- Genera notificación global.
- El resto de la app reacciona por live query.

### Alerta offline
- Se guarda local, aparece de inmediato, entra a la cola.
- Al reconectar se drena y pasa a `synced`.

---

## 9. Reglas de negocio

### Permisos

| Acción | Vecino | Prestador | Brigadista | Coordinador |
|---|---|---|---|---|
| Ver directorio/muro | ✅ | ✅ | ✅ | ✅ |
| Publicar bien/favor/tiempo/movilidad | ✅ | ✅ | ✅ | ✅ |
| Dar Visto Bueno | ✅ | ✅ | ✅ | ✅ |
| Crear alerta | ✅ | ✅ | ✅ | ✅ |
| Ofrecer oficio | ❌ | ✅ | ❌ | ❌ |
| Aceptar solicitud de servicio | ❌ | ✅ | ❌ | ❌ |
| Ficha de brigadista | ❌ | ❌ | ✅ | ❌ |
| Aceptar alerta | ❌ | ❌ | ✅ | ❌ |
| Activar crisis | ❌ | ❌ | ❌ | ✅ |
| Verificar vecinos | ❌ | ❌ | ❌ | ✅ |
| Moderar contenido | ❌ | ❌ | ❌ | ✅ |
| Emitir comunicado | ❌ | ❌ | ❌ | ✅ |

### Reputación
- Donación entregada: +5.
- Préstamo devuelto: +3 propietario / +1 solicitante.
- Hora de banco de tiempo: +2.
- Alerta resuelta: +5.
- Visto Bueno emitido: +1.

Niveles: 0–4 Nuevo · 5–14 Colaborador · 15–29 Vecino de confianza · 30+ Guardián del barrio.

### Anti-free-riding
- Préstamos de alto valor requieren ≥5 puntos.
- Máximo 3 solicitudes abiertas.
- No devolver bloquea nuevos préstamos.

### Vencimientos
- Préstamos, donaciones y favores: 7 días.
- Servicios: 30 días.
- Alertas: cierre manual; sugerencia a las 24 h.

---

## 10. PWA y offline

- Manifest con iconos 192/512/maskable.
- `vite-plugin-pwa` en modo `generateSW`.
- Precache de App Shell.
- Runtime cache de tiles OSM (`CacheFirst`, `map-tiles`, 800 entradas, 30 días).
- Fallback de navegación a `index.html`.
- Actualización controlada, sin recargar en medio de la demo.
- Fuente Inter e iconos empaquetados; nada por CDN.
- Audio con `MediaRecorder` (máx. 30 s), Blob en IndexedDB.
- `navigator.storage.persist()`.
- Botón “Preparar demo offline” que precarga tiles del área demo.
- Export/import JSON y reset demo.

---

## 11. Plan de 48 horas

| Horas | Hito | Entregables |
|---|---|---|
| 00–04 | Fundación | Vite + React + TS + Tailwind, rutas, layout, tokens, manifest, SW básico |
| 04–10 | Datos | Esquema Dexie, repositorios, seed v1, settings, perfiles |
| 10–16 | Acceso y cotidiano 1 | Onboarding, registro, home, directorio, ficha, visto bueno |
| 16–22 | Cotidiano 2 | Muro, detalle, publicación 3 clics, audio, solicitudes |
| 22–28 | Cotidiano 3 + emergencia 1 | Banco de tiempo, movilidad, reputación, modo crisis, alertas |
| 28–34 | Emergencia 2 + gestión | Brigada, coordinador, mapa, notificaciones, moderación |
| 34–38 | Plataforma | Sync engine, mock server, conflictos, export/import, offline prep |
| 38–42 | QA | Pruebas unitarias/E2E, Android físico, offline real, fixes |
| 42–45 | Demo | Seed final, guion, ensayo, video de respaldo |
| 45–48 | Colchón | Correcciones, rendimiento, presentación |

### Orden de implementación
1. Scaffold + design system + router.
2. Dexie + tipos + seed + repositorios.
3. Layout + bottom nav + estado global.
4. Onboarding + registro + perfil.
5. Directorio + prestador + visto bueno.
6. Muro + detalle + publicación 3 clics.
7. Solicitudes + préstamos + donaciones.
8. Banco de tiempo + movilidad.
9. Emergencia + alertas + brigada.
10. Coordinador + moderación.
11. Mapa + capas.
12. Notificaciones + reputación.
13. Sync + mock server + conflictos.
14. PWA + offline + tiles + audio.
15. QA Android + demo.

---

## 12. Demo en Android

### Montaje recomendado: `adb reverse`
```bash
adb devices
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
adb reverse tcp:4173 tcp:4173
```
En el teléfono: `http://localhost:4173`.

1. Instalar como PWA.
2. Configuración → “Preparar demo offline”.
3. Activar modo avión.
4. Demo.

### Plan B
1. Túnel HTTPS (`cloudflared` / `ngrok`).
2. Deploy estático del `dist`.
3. APK con Capacitor.
4. Video grabado.

### Guion de 15 minutos
| Min | Acción |
|---|---|
| 0:00–2:00 | Concepto: economía hiperlocal + resiliencia + offline-first |
| 2:00–4:00 | Onboarding y registro express con GPS |
| 4:00–6:00 | Directorio, ficha de prestador y Visto Bueno |
| 6:00–8:00 | Publicar préstamo en 3 clics con nota de voz |
| 8:00–9:30 | Solicitud, aceptación y confirmación |
| 9:30–11:00 | Banco de tiempo y movilidad solidaria |
| 11:00–12:30 | Coordinador activa crisis |
| 12:30–14:00 | Modo avión: crear alerta, mostrar persistencia y cola |
| 14:00–15:00 | Reconectar, sync automático y cierre |

### Panel demo (`/demo`)
Reiniciar datos · cambiar persona/rol · simular offline · preparar caché · simular conflicto · disparar notificación · ir a crisis · ver cola · checklist.

---

## 13. QA

### Unitarias
- Distancia, peso de visto bueno, puntos, niveles.
- Backoff de cola.
- Transiciones de estado.
- Permisos por rol.

### E2E
1. Onboarding → registro → home.
2. Dar visto bueno.
3. Publicar préstamo en 3 pasos.
4. Solicitar y aceptar.
5. Activar crisis.
6. Crear alerta offline.
7. Reconectar y verificar sync.
8. Persistencia tras recargar.

### Manual Android
PWA instalable · standalone · modo avión · persistencia · GPS · micrófono · touch 48 px · fuente grande · TalkBack · rotación · rendimiento.

---

## 14. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| “MVP completo” en 48 h | Workstreams paralelos, seed temprano, vertical slices |
| Sync no real | Presentarlo transparentemente; la cola sí es real |
| Tiles offline | Precarga + fondo neutro + marcadores visibles |
| SW con caché vieja | `registerType: 'prompt'`, probar en `preview` |
| `adb reverse` en modo avión | Toggle de offline simulado + prueba separada |
| Micrófono denegado | Fallback a texto |
| Pérdida de datos | Export/import + reset seed |
| PWA no instalable | Usar pestaña Chrome o Capacitor |
| Conflictos | Versionado + idempotencia + “gana servidor” |
| Geolocalización imprecisa | Fallback a coordenadas demo + distrito manual |

---

## 15. Definition of Done

- [ ] `npm run build` sin errores.
- [ ] PWA instalada y abre en standalone.
- [ ] App Shell carga sin red.
- [ ] Perfil local persiste.
- [ ] Onboarding y registro funcionan.
- [ ] Directorio con búsqueda, filtros y distancia.
- [ ] Visto Bueno único y ponderado.
- [ ] Muro con los 6 tipos de publicación.
- [ ] Publicación en 3 clics con GPS y audio opcional.
- [ ] Solicitudes con ciclo completo.
- [ ] Banco de tiempo y movilidad funcionales.
- [ ] Modo crisis activable solo por coordinador.
- [ ] Alertas con severidad y asignación.
- [ ] Brigada con disponibilidad y recursos.
- [ ] Panel de coordinador con métricas, verificación y moderación.
- [ ] Mapa con capas y radio.
- [ ] Notificaciones in-app.
- [ ] Reputación y anti-free-riding.
- [ ] Cola offline persistente.
- [ ] Sync automático al reconectar.
- [ ] Conflicto simulable y resuelto.
- [ ] Export/import y reset demo.
- [ ] 48×48 px y contraste validado.
- [ ] Pruebas E2E pasando.
- [ ] Demo completa en Android en < 15 min.
- [ ] Video de respaldo grabado.
