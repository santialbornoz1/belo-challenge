# Mini Plataforma Fintech — Belo Backend Challenge

API REST para cuentas virtuales en pesos con pagos internos entre usuarios. Atomicidad transaccional, idempotencia, control de concurrencia y auditoría.

- **Stack:** Node.js + TypeScript, Fastify, Objection.js + Knex, PostgreSQL
- **Arquitectura:** Hexagonal (ports & adapters) + SOLID
- **Precisión numérica:** `decimal.js` + `NUMERIC(20,2)` en Postgres (nunca `float`)
- **Concurrencia:** `SELECT ... FOR UPDATE` con locks ordenados por id (sin deadlocks)
- **Idempotencia:** `idempotencyKey` único por transacción

---

## Setup

### Requisitos

- Node.js >= 20
- **Docker Desktop corriendo** (requerido para `npm run dev`). Si no lo tenés o no querés usarlo, existe una alternativa con Postgres local (ver más abajo).

> ⚠️ **IMPORTANTE:** `npm run dev` levanta Postgres en un container. **El daemon de Docker DEBE estar corriendo** antes de ejecutarlo. En macOS: `open -a Docker` y esperá ~30-60s a que el ícono de la barra deje de animarse. Si Docker no responde, el script corta con un mensaje claro en vez de fallar a mitad de camino.

### Un solo comando (con Docker)

```bash
npm run dev
```

Eso ejecuta `scripts/dev.sh`, que hace **todo** desde cero:

1. Copia `.env.example` → `.env` si no existe
2. Valida que el daemon de Docker esté corriendo (si no, corta con instrucciones)
3. `npm ci` / `npm install` si `node_modules` no existe
4. `docker compose up -d db` (Postgres 16)
5. Espera `pg_isready`
6. `knex migrate:latest` (migraciones)
7. `knex seed:run` (usuarios demo: Alice 100k, Bob 50k, Carol 0)
8. `tsx watch src/server.ts`

El server queda en `http://localhost:3001` (o `PORT` del `.env`).

> Si querés solo preparar el entorno sin arrancar el server en watch, podés usar `npm run setup` (equivalente, termina cuando el server arranca).

### Alternativa sin Docker (Postgres local)

Si no tenés Docker o preferís usar tu Postgres local:

```bash
npm run dev:local
```

Eso ejecuta `scripts/dev-local.sh`, que:

1. Copia `.env.example` → `.env` si no existe
2. Verifica que `psql` esté instalado y que `DATABASE_URL` sea accesible
3. Instala dependencias
4. Corre migraciones + seeds
5. Arranca el server en watch

**Prerequisito (una sola vez):** tener Postgres local corriendo y haber creado el usuario + las DBs que usa el `.env`:

```bash
# macOS con Homebrew (ejemplo)
brew install postgresql@16 && brew services start postgresql@16

psql -U postgres -c "CREATE USER belo WITH PASSWORD 'belo123' SUPERUSER;"
psql -U postgres -c "CREATE DATABASE belo_challenge OWNER belo;"
psql -U postgres -c "CREATE DATABASE belo_challenge_test OWNER belo;"
```

Si las credenciales/DBs no existen, el script te muestra los comandos exactos a correr.

### Variables de entorno (`.env.example`)

```
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://belo:belo123@localhost:5432/belo_challenge
LOG_LEVEL=info
```

### Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Orquesta db (Docker) + migrations + seed + server (ver `scripts/dev.sh`). **Requiere Docker corriendo.** |
| `npm run dev:local` | Igual que `dev` pero usando Postgres local (sin Docker). Ver `scripts/dev-local.sh` |
| `npm run dev:server` | Solo arranca el server (tsx watch) |
| `npm run dev:all` | Levanta backend + UI web juntos (puerto 3001 + 3000) |
| `npm run web:install` | Instala dependencias de la UI (`web/`) |
| `npm run web:dev` | Levanta solo la UI en `http://localhost:3000` |
| `npm run web:build` | Build de producción de la UI |
| `npm run db:up` / `db:down` | Levanta/baja el container de Postgres |
| `npm run db:migrate` | Aplica migrations pendientes |
| `npm run db:rollback` | Revierte la última migration |
| `npm run db:seed` | Inserta usuarios demo (Alice 100k `admin`, Bob 50k, Carol 0) |
| `npm run db:reset` | Rollback all + migrate + seed (estado limpio) |
| `npm run db:promote-admin -- <email>` | Promueve un usuario existente a rol `admin`. Útil si creaste cuentas desde la UI en vez de correr el seed. Ej: `npm run db:promote-admin -- alice@demo.com` |
| `npm run test` | Corre Jest (integration tests contra DB real) |
| `npm run build` | Compila TypeScript a `dist/` |

---

## UI web (`web/`)

Además del backend, el repo incluye una UI tipo app fintech (Vite + React + Tailwind) para
probar el sistema como usuario final —sin hablar de HTTP, UUIDs ni headers.

### Cómo levantarla

```bash
# primera vez: instalar deps de la UI
npm run web:install

# levantar backend (3001) + UI (3000) juntos
npm run dev:all

# o solo la UI (asumiendo que el backend ya corre en 3001)
npm run web:dev
```

Abrí `http://localhost:3000`.

### Qué podés hacer

- **Crear cuentas** con nombre, email y saldo inicial (o recuperar un seed con su ID).
- **Enviar dinero** con un flujo de 3 pasos (destinatario → monto → confirmar) y resultados
  en lenguaje humano: "¡Listo!", "Quedó pendiente de aprobación", "Saldo insuficiente", etc.
- **Ver tu actividad** con filtros (todas / enviadas / recibidas / pendientes) y paginación.
- **Aprobar o rechazar** transferencias pendientes del sistema (link "admin" al pie).
- **Abrir el detalle** de cualquier movimiento.

### Modo QA

En el footer hay un link "Modo QA" que abre un panel con:

- **Casos automáticos**: los 23 tests E2E (crear user / auto-confirm / pending / idempotency /
  todos los errores / approve / reject / health) corriendo contra el backend real. Cada caso
  arma sus propios datos con emails y keys frescos — podés correrlo N veces sin resetear la DB.
- **Request log**: historial de los requests HTTP que la UI emitió, con status, timing, body
  y headers. Útil para debug.

### Variables

Por default la UI apunta a `http://localhost:3001`. Para cambiarlo (por ejemplo, para apuntar
a un backend remoto), creá `web/.env.local` con:

```
VITE_API_URL=https://mi-backend.com
```

### Estructura

```
web/
├── src/
│   ├── App.tsx              # shell (login → home + overlays)
│   ├── api.ts               # cliente HTTP (con log integrado)
│   ├── state.tsx            # contexto: users, sesión, log
│   ├── utils.ts             # formateo ARS, avatares, timeAgo, traducción de errores
│   ├── types.ts
│   └── components/
│       ├── Login.tsx        # elegir cuenta / crear / entrar por ID
│       ├── Home.tsx         # balance + actividad + banner de pendientes
│       ├── SendMoney.tsx    # modal de 3 pasos
│       ├── Admin.tsx        # revisar pendientes del sistema
│       ├── TxDetail.tsx     # detalle de una transferencia
│       ├── Modal.tsx        # primitiva reusable
│       ├── TestCases.tsx    # 23 casos automáticos (modo QA)
│       ├── RequestLog.tsx   # historial HTTP (modo QA)
│       └── QaPanel.tsx      # wrapper del modo QA
└── package.json
```

---

## Documentación interactiva (Swagger / OpenAPI)

La API expone su spec OpenAPI 3.0 + Swagger UI completa, con todos los endpoints, bodies, params, responses (incluyendo errores), security schemes y ejemplos.

### Cómo levantarlo

```bash
npm run dev           # o npm run dev:local si no tenés Docker
```

Una vez que el server está arriba en `http://localhost:3001`:

| URL | Qué es |
|---|---|
| `http://localhost:3001/docs` | **Swagger UI** — interfaz web para explorar y probar los endpoints |
| `http://localhost:3001/docs/json` | Spec **OpenAPI 3.0** en JSON (útil para importar a Postman/Insomnia/codegen) |
| `http://localhost:3001/docs/yaml` | Spec **OpenAPI 3.0** en YAML |

### Cómo autenticarse en Swagger UI

Las rutas de `/api/transactions` requieren el header `x-user-id`. Para probarlas desde la UI:

1. Corré el seed (`npm run db:seed`) — te deja tres usuarios demo (Alice `admin`, Bob, Carol).
2. Copiá el UUID de Alice (podés hacer `GET /api/users` y filtrar por email, o verlo directo en Postgres con `psql`). Usá Alice si querés probar los endpoints de `approve` / `reject` — los otros dos no tienen rol admin.
3. Clickeá el botón **Authorize** (candado, arriba a la derecha).
4. Pegá el UUID en el campo `UserIdHeader` y dale **Authorize** → **Close**.
5. Desde ahí, cualquier endpoint protegido ya lleva el header automáticamente al hacer "Try it out".

> La UI guarda el token entre recargas (`persistAuthorization: true`).

### Importar a Postman / Insomnia / codegen

```bash
# Postman
curl http://localhost:3001/docs/json > openapi.json
# Postman → Import → Upload Files → openapi.json

# Generar un cliente TypeScript
npx openapi-typescript http://localhost:3001/docs/json -o api-client.ts
```

### Qué cubre la spec

- **Tags**: `Users`, `Transactions`, `Health` — agrupan endpoints en la UI.
- **Schemas compartidos** (`components.schemas`): `User`, `Transaction`, `Pagination`, `ErrorResponse`, `HealthResponse` — referenciados por `$ref` en cada response.
- **Security scheme**: `UserIdHeader` (apiKey en header `x-user-id`), aplicado a las rutas de `/api/transactions`.
- **Responses**: cada endpoint documenta los códigos posibles (200/201/400/401/404/409/422) con descripción y el schema del error envelope.
- **Ejemplos** embebidos en campos clave (`amount`, `email`, `idempotencyKey`, etc).

---

## API

Base path: `/api`. Todos los endpoints de `transactions` requieren header `x-user-id: <uuid>` (auth mock — ver [Decisiones](#decisiones)).

> Para explorar la API de forma interactiva, usá Swagger UI en `http://localhost:3001/docs`. La referencia textual completa vive en [`docs/API.md`](docs/API.md); debajo va un resumen.

### `POST /api/users` — Crear usuario

```bash
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Diego","email":"diego@demo.com","initialBalance":"10000"}'
```

Respuesta `201`:
```json
{ "id":"<uuid>","name":"Diego","email":"diego@demo.com","balance":"10000.00","createdAt":"...","updatedAt":"..." }
```

### `GET /api/users/:id` — Ver usuario (incluye saldo)

```bash
curl http://localhost:3001/api/users/<uuid>
```

### `GET /api/users?limit=100&offset=0` — Listar usuarios

Devuelve todos los usuarios ordenados por fecha de creación (más recientes primero). `limit` máx 100 (default 100). Lo usa la pantalla de login de la UI para mostrar las cuentas disponibles.

```bash
curl http://localhost:3001/api/users
```

Respuesta `200`:
```json
{ "data": [ { "id": "...", "name": "Alice Admin", "email": "alice@demo.com", "balance": "100000.00", "role": "admin", ... } ] }
```

### `POST /api/transactions` — Crear transacción

Si `amount <= 50000` → se confirma automáticamente y mueve saldos en la misma transacción atómica. Si `amount > 50000` → queda en `pending` para revisión manual (no toca saldos).

```bash
curl -X POST http://localhost:3001/api/transactions \
  -H "Content-Type: application/json" \
  -H "x-user-id: <alice-uuid>" \
  -d '{
    "fromUserId":"<alice-uuid>",
    "toUserId":"<bob-uuid>",
    "amount":"1500.50",
    "idempotencyKey":"payment-2026-04-24-abc"
  }'
```

Respuesta `201` (creada nueva) o `200` (idempotencia, ya existía):
```json
{
  "id":"<uuid>",
  "fromUserId":"<alice-uuid>",
  "toUserId":"<bob-uuid>",
  "amount":"1500.50",
  "status":"confirmed",           // o "pending" si > 50000
  "createdAt":"...",
  "confirmedAt":"...",            // null si pending
  "rejectedAt":null
}
```

**Errores:**

| Status | `error` | Cuándo |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Body no cumple el JSON Schema |
| `400` | `INVALID_AMOUNT` | Monto = 0 |
| `400` | `SAME_USER` | `fromUserId === toUserId` |
| `401` | `UNAUTHORIZED` | Falta `x-user-id` |
| `403` | `FORBIDDEN` | `fromUserId` distinto al caller y el caller no es admin (no podés crear tx en nombre de otro) |
| `404` | `USER_NOT_FOUND` | `from` o `to` no existen |
| `409` | `DUPLICATE_IDEMPOTENCY_KEY` | Key duplicada en race condition (red de seguridad) |
| `422` | `INSUFFICIENT_FUNDS` | Saldo insuficiente (solo para tx auto-confirmadas) |

### `GET /api/transactions?userId=<uuid>&status=<s>&limit=<n>&offset=<n>`

Lista transacciones del usuario (como origen O destino), ordenadas por `createdAt DESC`. Paginado, `limit` máx 100 (default 20).

**Permisos:**
- Sin `userId` → **admin only** (listado global, usado por la pantalla de pendientes).
- Con `userId` igual al caller → permitido.
- Con `userId` de otro usuario → **admin only**.
- Si un no-admin viola lo anterior → `403 FORBIDDEN`.

```bash
curl "http://localhost:3001/api/transactions?userId=<alice-uuid>&limit=10" \
  -H "x-user-id: <alice-uuid>"
```

Respuesta `200`:
```json
{
  "data": [ { "id": "...", "status": "confirmed", ... } ],
  "pagination": { "total": 42, "limit": 10, "offset": 0 }
}
```

### `GET /api/transactions/:id` — Ver transacción

Permitido para el emisor, el receptor o un admin. Si el caller no es parte ni admin → `403 FORBIDDEN`.

### `PATCH /api/transactions/:id/approve` — Aprobar pendiente — **admin only**

Confirma una transacción en estado `pending` y mueve los saldos atómicamente. **Re-valida saldo** (puede haber cambiado desde que se creó la pendiente).

```bash
curl -X PATCH http://localhost:3001/api/transactions/<id>/approve \
  -H "x-user-id: <admin-uuid>"
```

| Status | `error` |
|---|---|
| `403` | `FORBIDDEN` — el caller no es admin |
| `404` | `TRANSACTION_NOT_FOUND` |
| `409` | `INVALID_TRANSACTION_STATE` — la tx no está en `pending` |
| `422` | `INSUFFICIENT_FUNDS` — el saldo cambió y ya no alcanza |

### `PATCH /api/transactions/:id/reject` — Rechazar pendiente — **admin only**

Marca `rejected`. No toca saldos. Mismo contrato de errores que `approve` (incluyendo `403 FORBIDDEN` para no-admins).

---

## Testing

Suite completa con 4 niveles, corre sobre DB real (`belo_challenge_test`):

```bash
npm test              # unit + integration + smoke (el pre-push los corre)
npm run test:unit     # solo unit (rápidos, sin DB)
npm run test:integration  # solo integration (contra Postgres real)
npm run test:smoke    # health + arranque del server
npm run test:e2e      # flujo end-to-end completo
npm run test:all      # todos los niveles
npm run test:watch    # unit + integration en watch mode
```

### Qué cubre cada nivel

**Unit** ([`tests/unit/`](tests/unit)) — lógica pura, sin DB, con repos mockeados:
- `create-transaction.use-case.test.ts` — **lógica de reservas** (lo que pide la consigna): regla $50k, validación de existencia, mismo-user, monto > 0, idempotencia, propagación de `InsufficientFunds`.
- `approve-reject-transaction.use-case.test.ts` — transición de estados, re-validación de saldo en approve.
- `create-user.use-case.test.ts` / `list-transactions.use-case.test.ts` — validaciones y filtros.
- `domain/errors.test.ts` — jerarquía `AppError` y códigos estables.
- `infrastructure/auth.middleware.test.ts` — parseo del header `x-user-id`, rechazo sin header, `requireAdmin`.
- `infrastructure/pg-errors.test.ts` — mapeo de errores Postgres (`23505`, `23514`, `23503`) a `AppError`.

**Integration** ([`tests/integration/`](tests/integration)) — contra Postgres real, una tx por test (rollback automático vía [`setup.ts`](tests/setup.ts)):
- `transaction.concurrency.test.ts` — **el test más importante**: 10 transacciones concurrentes del mismo origen, verifica que nunca se gaste más que el saldo disponible (`SELECT FOR UPDATE` ordenado funciona).
- `transaction.idempotency.test.ts` — misma key = misma tx, nunca duplica.
- `transaction.create.test.ts` / `approve-reject.test.ts` / `list.test.ts` / `get.test.ts` / `list-admin.test.ts` — endpoints completos con body + status + auth.
- `transaction.authz.test.ts` — `403 FORBIDDEN` en todas las violaciones de permisos.
- `invariants.test.ts` — CHECKs de DB rechazan `balance < 0`, `amount <= 0`, `from == to`.
- `audit.test.ts` — cada operación deja audit log dentro de la misma tx.
- `error-handler.test.ts` — error handler global mapea todo a JSON consistente.
- `user.test.ts` — CRUD de users + unique email.

**Smoke** ([`tests/smoke/`](tests/smoke)) — `GET /health` + server arranca + plugins cargados.

**E2E** ([`tests/e2e/flow.test.ts`](tests/e2e/flow.test.ts)) — flujo completo: crear users → tx auto-confirmada → tx pending → approve → verificar saldos finales y audit logs.

### Setup de la DB de test

La primera vez, creá la DB de test (el `dev:local` ya te da el snippet; con Docker se crea sola):

```bash
psql -U postgres -c "CREATE DATABASE belo_challenge_test OWNER belo;"
```

Las migrations corren automáticamente al primer `npm test` (ver [`tests/setup.ts`](tests/setup.ts)).

---

## Decisiones

### Arquitectura hexagonal

```
src/
  domain/          # core puro (no importa infra/frameworks)
    entities/      # User, Transaction, AuditLog
    errors/        # AppError + subclases tipadas
    ports/         # Interfaces (UserRepository, TransactionRepository, AuditRepository)
  application/
    use-cases/     # 1 archivo = 1 responsabilidad. Orquesta domain + ports.
  infrastructure/  # adapters — importa domain/application
    models/        # Objection models (mappers camelCase <-> snake_case)
    repositories/  # Implementaciones Objection de los ports
    http/
      plugins/     # Fastify plugins (db connection)
      middleware/  # auth mock, error handler global
      routes/      # handlers HTTP — composition root de use cases
      schemas/     # JSON Schemas (Fastify nativo)
  app.ts           # build composite, registro de rutas
  server.ts        # entry point
```

**Regla de dependencia:** `domain` no conoce `application` ni `infrastructure`. `application` solo conoce `domain`. `infrastructure` conoce ambas. Las dependencias apuntan hacia adentro.

### Precisión numérica

- Columnas de dinero: `NUMERIC(20,2)` en Postgres (no `float`/`double`).
- En código: `decimal.js` para cualquier cálculo. `0.1 + 0.2 === 0.3` es falso con floats; con `Decimal` es exacto.
- Entrada y salida de la API: `amount` siempre como `string` decimal (`"1500.50"`), no `number`.

### Atomicidad transaccional

Toda operación que toca saldos vive dentro de `Model.transaction(trx => ...)`. Una falla en cualquier paso (debit, credit, insert de tx, audit log) hace rollback total. Esta atomicidad **incluye el audit log** (escrito en la misma transacción), por lo que es imposible quedarse con un "registro sin operación" o viceversa.

### Control de concurrencia

`SELECT ... FOR UPDATE` sobre los usuarios involucrados antes de leer/modificar saldos:

```ts
const ordered = [fromId, toId].sort();   // evita deadlocks
const users = await UserModel.query(trx).whereIn("id", ordered).forUpdate();
```

El orden consistente (por `id` ascendente) garantiza que dos transferencias concurrentes sobre el mismo par de cuentas adquieran los locks en el mismo orden, evitando el clásico deadlock `A→B` vs `B→A`.

### Regla de $50.000

Implementada como threshold configurable en el dominio (`TRANSACTION_AUTO_APPROVE_THRESHOLD`) y pasada al use case vía constructor. Facilita testearlo con thresholds distintos sin tocar el código.

### Approve re-valida saldo

Entre la creación de una tx `pending` y su `approve`, el saldo del origen puede haber cambiado (otras tx confirmadas, otros approves). Por eso `approveAtomic` vuelve a lockear users y vuelve a validar `balance >= amount`. Si ya no alcanza → `422 INSUFFICIENT_FUNDS`.

### Idempotencia

Toda creación de tx recibe `idempotencyKey`. Si ya existe una tx con esa key → se devuelve la tx original con `200 OK` (no duplica). Un `UNIQUE(idempotency_key)` en DB actúa como red de seguridad contra race conditions (si dos requests con la misma key llegan a la vez, una pasa el check y la otra cae en `23505`, mapeado a `DUPLICATE_IDEMPOTENCY_KEY 409`).

### Auditoría

Tabla `audit_logs` en Postgres (con `metadata JSONB`). Cada operación sensible (crear, aprobar, rechazar) inserta un registro **dentro de la misma transacción** que la operación. No es fire-and-forget a propósito: atomicidad audit+operación > throughput. Para volúmenes altos en producción, movería audit a un sink asíncrono (Outbox + worker + Mongo/Kafka) — ver [Producción](#producción).

### Invariantes en DB

- `CHECK (balance >= 0)` sobre `users`
- `CHECK (amount > 0)` sobre `transactions`
- `CHECK (from_user_id <> to_user_id)` sobre `transactions`
- `UNIQUE (idempotency_key)` sobre `transactions`
- `FK ... ON DELETE RESTRICT` en ambos lados

Estas invariantes son la última línea de defensa: aún si un bug saltara la validación de aplicación, la DB rechaza el estado inválido.

### Auth mock

El header `x-user-id` es un stand-in de un JWT real. El middleware lo valida (ver `auth.middleware.ts`) y pone `request.userId`. En producción se reemplaza por `@fastify/jwt`, sin tocar use cases ni rutas. El challenge no pidió auth real; mostrarla como port reemplazable es suficiente.

### Roles y autorización

Dos roles: `user` (default) y `admin`. Se reflejan en la columna `users.role` (con `CHECK` en DB) y en el entity `User` del dominio.

| Endpoint | Quién puede |
|---|---|
| `POST /api/users` | cualquiera (público, sin `x-user-id`) |
| `GET /api/users`, `GET /api/users/:id` | cualquiera con `x-user-id` válido |
| `POST /api/transactions` | el mismo user del `fromUserId`, o un admin |
| `GET /api/transactions/:id` | emisor, receptor, o admin |
| `GET /api/transactions` sin `userId` | **admin only** |
| `GET /api/transactions?userId=X` | el propio user `X`, o admin |
| `PATCH /api/transactions/:id/approve` | **admin only** |
| `PATCH /api/transactions/:id/reject` | **admin only** |

Violar cualquiera de las reglas devuelve `403 FORBIDDEN`.

**`role` no se expone vía `POST /api/users` a propósito.** No hay forma pública de auto-promoverse — evita el clásico "POST users with `role: admin` y me convierto en admin". La promoción pasa por:

- el **seed** (`npm run db:seed`): marca a Alice como `admin`
- el **script** `npm run db:promote-admin -- <email>`: UPDATE directo a DB
- un migration o consola de ops en producción

Tanto la **UI** ([Login.tsx](web/src/components/Login.tsx) muestra badge `admin`, [Home.tsx](web/src/components/Home.tsx) muestra el link de revisión solo si el user logueado es admin) como el **middleware** (`requireAdmin` en [auth.middleware.ts](src/infrastructure/http/middleware/auth.middleware.ts)) aplican la regla — **nunca solo en el cliente**, porque la UI es un nice-to-have UX pero el backend es la línea de defensa real.

### Errores tipados + error handler global

Jerarquía `AppError` (con `statusCode` y `code` estable para el cliente) extendida por `InsufficientFundsError`, `UserNotFoundError`, etc. Un único handler global mapea todo a respuesta JSON consistente:

```json
{ "error": "INSUFFICIENT_FUNDS", "message": "Insufficient funds", "details": {...} }
```

Ventaja: **cero `try/catch` en las rutas**. Los handlers tiran el error y el framework lo captura.

### Observabilidad

Pino (native de Fastify) con `requestId` por request (UUID v4). Logs en JSON estructurado listos para ingestar en Datadog/NewRelic. No se logea PII ni balances completos en INFO.

### Git hooks (husky)

Hay un único hook `pre-push` ([`.husky/pre-push`](.husky/pre-push)) que corre antes de cada `git push`:

```bash
npx tsc --noEmit   # typecheck estricto, sin emitir archivos
npm test           # jest: unit + integration + smoke
```

Si falla cualquiera de los dos, el push se aborta. Esto evita pushear código que no compila o que rompe la suite. Se instala automáticamente vía `prepare` de npm (ver `package.json`), así que con un `npm install` ya queda activo.

No hay `pre-commit` a propósito: quiero commits rápidos y libres (útil para WIP locales), y pagar el costo de validación una sola vez al pushear, que es cuando el cambio empieza a ser visible para otros.

---

## Trade-offs

- **Balance embebido en `users`.** El enunciado dice "User: id, nombre, email, saldo", así que el saldo vive en la misma tabla. Esto acopla el lock del balance al lock del registro completo. En producción separaría en `account_balances(user_id UUID, balance NUMERIC)` para granularidad de locks y futura soporte multi-moneda/multi-cuenta.
- **Audit en Postgres, no en Mongo.** Simplifica la infra (una sola DB) y permite auditar dentro de la misma transacción (mini-outbox). Mongo aportaría escalabilidad para append-only de alto volumen; lo vería en producción, no acá.
- **Hexagonal para 4 endpoints = boilerplate extra.** Vale la pena por testabilidad y separación de concerns — el core queda libre de Objection/Fastify y puedo reemplazar cualquier adapter.
- **`SELECT ... FOR UPDATE` sobre una tabla central puede ser contención.** Para un sistema P2P de bajo volumen es lo correcto. Alternativas (optimistic locking con `version`, event sourcing, sharding por usuario) tienen su propio costo y complejidad; no se justifican acá.
- **Auth mock por header.** Elegante para el alcance pero obviamente reemplazable.

---

## Producción

Lo que agregaría si esto fuera a prod:

- **Auth real:** `@fastify/jwt` + middleware que popule `request.userId` desde el claim. Ownership checks (solo podés listar tus tx).
- **Rate limiting:** `@fastify/rate-limit` por IP y por userId en endpoints sensibles (POST/PATCH de transactions).
- **Secrets management:** AWS Secrets Manager / SSM Parameter Store, no `.env`.
- **Outbox pattern para audit:** tabla `outbox_events` escrita en la misma tx, worker (SQS/Kafka) lee y escribe al sink definitivo (Datadog, S3, etc). Garantiza que nunca perdés un evento si el sink está caído.
- **Webhooks:** notificar al usuario cuando su tx cambia de estado.
- **Observabilidad completa:**
  - OpenTelemetry traces (request → DB call → pg latency)
  - Métricas RED (rate, errors, duration) en Prometheus/Datadog
  - Alertas: tasa de `INSUFFICIENT_FUNDS`, locks sostenidos > N ms, tx `pending` sin resolver > T
- **Health checks reales** (`/health/ready` verifica conexión a Postgres, `/health/live` solo proceso).
- **CI/CD:** GitHub Actions con lint + tsc + tests + build; deploy a ECS/Fargate con blue-green.
- **Migrations con estrategia de rollback** en cada deploy.
- **Compliance:** retener audit logs inmutables por N años (append-only + lock storage).

---

## Escalabilidad

- **Read replicas de Postgres** para `GET /transactions` (listados). Writes siguen yendo a primary.
- **Cache de listados** (Redis con invalidación por evento). Si el listado es frecuente y los writes ocasionales, cachear `GET /transactions?userId=X` reduce carga.
- **Workers async** para aprobaciones batch (si hay volumen suficiente) y para webhooks/audit.
- **Sharding por `user_id`** si el volumen lo requiere (el par `from/to` dificulta el sharding directo; una estrategia es sharding por `from_user_id` con lookup por índice global en `to`).
- **Connection pooling** con PgBouncer entre app y Postgres para reducir overhead de conexiones.
- **Partitioning de `transactions`** por `created_at` (mensual) — acelera queries de rango y facilita el purge.
- **Event sourcing** si el negocio exige replay auditable del estado completo de cada cuenta. No barato.

---

## Flujo crítico (resumen visual)

```
POST /api/transactions { amount }
   │
   ▼
 use case: validar amount > 0, from != to, buscar por idempotencyKey
   │       (si existe → devolver tx original, 200)
   ▼
 repo.createAtomic(input, threshold):
   ├─ knex.transaction
   │    ├─ lock users ordered by id (FOR UPDATE)
   │    ├─ validar existencia
   │    ├─ amount > threshold
   │    │    ├─ SÍ → insert tx status=pending, no mueve saldos
   │    │    └─ NO → validar saldo
   │    │            ├─ no alcanza → throw InsufficientFunds
   │    │            └─ alcanza → debit + credit + insert tx status=confirmed
   │    └─ insert audit_log (dentro de la misma tx)
   └─ commit (o rollback total si cualquier paso falla)
```

```
PATCH /api/transactions/:id/approve
   │
   ▼
 knex.transaction
   ├─ lock transaction (FOR UPDATE)
   ├─ status !== pending → throw InvalidTransactionState (409)
   ├─ lock users ordered by id (FOR UPDATE)
   ├─ RE-validar saldo (pudo cambiar desde que se creó el pending)
   │     └─ no alcanza → throw InsufficientFunds (422)
   ├─ debit + credit
   ├─ update tx status=confirmed, confirmedAt=now
   └─ insert audit_log
```

---

## Seed inicial (via `npm run db:seed`)

| Nombre | Email | Balance | Rol |
|---|---|---|---|
| Alice Admin | alice@demo.com | `100000.00` | `admin` |
| Bob Demo | bob@demo.com | `50000.00` | `user` |
| Carol Demo | carol@demo.com | `0.00` | `user` |

Suficiente para ejercitar: tx auto-confirmada (Alice→Bob 1000), tx pending (Alice→Bob 60000), saldo insuficiente (Carol→Bob 100), y aprobación manual de pendientes desde la sesión de Alice.

> **Aprobación de pendientes (rol admin):** los endpoints `PATCH /api/transactions/:id/approve` y `.../reject`, y el listado global `GET /api/transactions` (sin `userId`), requieren `role = 'admin'`. El único admin que sale del seed es Alice. Si arrancaste con el botón **"Crear cuentas de demo"** de la UI (que no setea rol) en vez de `npm run db:seed`, todos los usuarios quedan como `user` — en ese caso promové alguno con `npm run db:promote-admin -- alice@demo.com`.
