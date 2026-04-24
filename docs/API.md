# API Reference

Base URL: `http://localhost:3001/api`

All endpoints under `/transactions` require the `x-user-id` header (auth mock).

Some endpoints additionally require the caller to have `role = 'admin'` — marked as **Admin only** below. The seed ships one admin (Alice, `alice@demo.com`). To promote an existing user: `npm run db:promote-admin -- <email>`.

---

## Users

### Create user

```
POST /api/users
Content-Type: application/json

{
  "name": "Alice",
  "email": "alice@demo.com",
  "initialBalance": "10000.00"   // optional, defaults to "0.00"
}
```

**Response 201**

```json
{
  "id": "uuid",
  "name": "Alice",
  "email": "alice@demo.com",
  "balance": "10000.00",
  "createdAt": "2026-04-24T12:00:00.000Z",
  "updatedAt": "2026-04-24T12:00:00.000Z"
}
```

### List users

```
GET /api/users?limit=100&offset=0
```

Devuelve todos los usuarios ordenados por fecha de creación (más recientes primero).
`limit` máx 100 (default 100).

**Response 200**

```json
{
  "data": [
    { "id": "...", "name": "Alice Demo", "email": "alice@demo.com", "balance": "100000.00", ... }
  ]
}
```

### Get user

```
GET /api/users/:id
```

**Response 200** → same shape as above.
**Response 404** → `{ "error": "USER_NOT_FOUND" }`

---

## Transactions

### Create transaction

```
POST /api/transactions
Content-Type: application/json
x-user-id: <uuid of the caller>

{
  "fromUserId": "<uuid>",
  "toUserId": "<uuid>",
  "amount": "1500.50",
  "idempotencyKey": "unique-client-key"
}
```

**Behavior**

- If `amount <= 50000` and funds sufficient → status `confirmed`, balances moved atomically.
- If `amount > 50000` → status `pending`, balances untouched.
- If `idempotencyKey` already used → returns the original transaction with `200 OK`.

**Response 201** (new) or **200** (idempotency hit)

The `fromUser` and `toUser` objects embed the origin and destination users (id, name, email) so clients don't need an extra lookup. `balance` is intentionally omitted — including it would show the *current* balance, which is misleading inside a historical transaction.

```json
{
  "id": "uuid",
  "fromUser": { "id": "uuid", "name": "Alice Demo", "email": "alice@demo.com" },
  "toUser":   { "id": "uuid", "name": "Bob Demo",   "email": "bob@demo.com" },
  "amount": "1500.50",
  "status": "confirmed",
  "createdAt": "...",
  "confirmedAt": "...",   // null if pending
  "rejectedAt": null
}
```

**Errors**

| HTTP | `error` | Reason |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body does not match JSON Schema (bad UUID, bad decimal pattern, etc.) |
| 400 | `INVALID_AMOUNT` | `amount` resolves to zero |
| 400 | `SAME_USER` | `fromUserId === toUserId` |
| 401 | `UNAUTHORIZED` | Missing or invalid `x-user-id` |
| 404 | `USER_NOT_FOUND` | `from` or `to` user does not exist |
| 409 | `DUPLICATE_IDEMPOTENCY_KEY` | Race condition safety net — the key was used by a concurrent request |
| 422 | `INSUFFICIENT_FUNDS` | Only for auto-approved (amount ≤ 50000) |

### List transactions

```
GET /api/transactions?userId=<uuid>&status=<pending|confirmed|rejected>&limit=20&offset=0
x-user-id: <uuid>
```

Returns transactions where `userId` is either `fromUser.id` or `toUser.id`, ordered by `createdAt DESC`. Paginated (`limit` max 100, default 20). Each item in `data` uses the same shape as the Create response (with `fromUser` / `toUser` objects embedded).

**Permissions:**
- Without `userId` → **Admin only** (global listing, used by the admin pending-review screen).
- With `userId` of the caller → allowed.
- With `userId` of another user → **Admin only**.
- Non-admin violating the above → `403 FORBIDDEN`.

**Response 200**

```json
{
  "data": [
    { "id": "...", "status": "confirmed", "amount": "...", ... }
  ],
  "pagination": { "total": 42, "limit": 20, "offset": 0 }
}
```

### Get transaction

```
GET /api/transactions/:id
x-user-id: <uuid>
```

Returns one transaction or `404`.

### Approve pending — **Admin only**

```
PATCH /api/transactions/:id/approve
x-user-id: <admin-uuid>
```

Atomically:
1. Locks the transaction row (`FOR UPDATE`).
2. Validates status is `pending` (else `409`).
3. Locks both users (ordered by id, `FOR UPDATE`).
4. **Re-validates** `fromUser.balance >= amount` (balance may have changed since the pending was created).
5. Debits + credits + marks `confirmed`.
6. Writes audit log (same transaction).

**Response 200** → updated transaction.

**Errors**

| HTTP | `error` |
|---|---|
| 403 | `FORBIDDEN` — caller is not admin |
| 404 | `TRANSACTION_NOT_FOUND` |
| 409 | `INVALID_TRANSACTION_STATE` |
| 422 | `INSUFFICIENT_FUNDS` |

### Reject pending — **Admin only**

```
PATCH /api/transactions/:id/reject
x-user-id: <admin-uuid>
```

Marks the transaction as `rejected`. Does not touch balances. Same error surface as `approve` (including `403 FORBIDDEN` for non-admin callers).

---

## Health

```
GET /health
```

Returns `{ "status": "ok" }`. Does not check DB — in production I'd add `/health/ready` with a DB ping.

---

## Error response shape

```json
{
  "error": "CONSTANT_CODE",
  "message": "Human readable explanation",
  "details": { "anyExtra": "fields" }   // optional
}
```

`error` is a stable machine code the client can branch on. `message` is for humans/logs.

---

## Curl cookbook

```bash
# setup
ALICE=$(curl -sX POST localhost:3001/api/users -H 'content-type: application/json' \
  -d '{"name":"Alice","email":"alice@e.com","initialBalance":"100000"}' | jq -r .id)
BOB=$(curl -sX POST localhost:3001/api/users -H 'content-type: application/json' \
  -d '{"name":"Bob","email":"bob@e.com","initialBalance":"0"}' | jq -r .id)

# auto-confirm transfer
curl -sX POST localhost:3001/api/transactions \
  -H 'content-type: application/json' \
  -H "x-user-id: $ALICE" \
  -d "{\"fromUserId\":\"$ALICE\",\"toUserId\":\"$BOB\",\"amount\":\"500\",\"idempotencyKey\":\"k-1\"}"

# pending (> 50000)
PENDING=$(curl -sX POST localhost:3001/api/transactions \
  -H 'content-type: application/json' \
  -H "x-user-id: $ALICE" \
  -d "{\"fromUserId\":\"$ALICE\",\"toUserId\":\"$BOB\",\"amount\":\"75000\",\"idempotencyKey\":\"k-2\"}" | jq -r .id)

# approve (requires admin; Alice was created via POST /users which defaults to role=user,
# so promote her first — or use the seeded Alice from `npm run db:seed`)
npm run db:promote-admin -- alice@e.com
curl -sX PATCH "localhost:3001/api/transactions/$PENDING/approve" -H "x-user-id: $ALICE"

# list Alice's
curl -s "localhost:3001/api/transactions?userId=$ALICE" -H "x-user-id: $ALICE" | jq
```
