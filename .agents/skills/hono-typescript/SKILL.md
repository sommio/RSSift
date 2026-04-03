---
name: hono-typescript
description: This skill should be used when building or refactoring TypeScript backends with Hono. It applies when defining HTTP routes, composing subrouters, adding middleware, validating input, shaping API responses, or testing request handlers. Triggers on Hono route design, `app.route()` composition, `createMiddleware()` usage, context variables, or runtime-agnostic backend patterns.
---

# Hono + TypeScript

Build Hono services as small, composable HTTP modules. Prefer route trees assembled with `app.route()`, middleware that owns cross-cutting concerns, and handlers that stay focused on translating domain results into HTTP responses.

## When To Use This Skill

Use this skill when working on:
- Hono apps or subrouters in TypeScript
- Request validation and middleware design
- Auth, database, request ID, or other typed context variables
- API route structure and error handling
- Tests for Hono handlers, routers, or full app flows

## Core Defaults

- Compose features as subrouters and mount them with `app.route()`.
- Put cross-cutting logic in middleware created with `createMiddleware()`.
- Validate requests before handlers run; handlers should receive already-checked input.
- Keep handlers thin: parse the request, call domain code, shape the response.
- Store shared request-scoped objects in typed context variables, not globals.
- Write tests around route behavior, middleware effects, and unhappy paths.
- Keep runtime wording neutral unless the project is explicitly Node-only, Bun-only, or edge-only.

## Package Setup

Use `pnpm`, not `npm`:

```bash
pnpm add hono
pnpm add -D vitest @types/node
```

Optional validator packages are fine when the project already uses them:

```bash
pnpm add @hono/zod-validator zod
```

Validation libraries are optional. The important design rule is that validation happens before business logic, not buried inside handlers.

## Trigger Phrases

This skill fits requests like:
- "Add a Hono route for this resource"
- "Refactor this API into subrouters"
- "Where should validation live in Hono?"
- "How do I pass auth or db through Hono context?"
- "Test this Hono endpoint"
- "Clean up these middleware layers"

## Preferred Project Shape

Organize by feature, not by HTTP verb or framework layer:

```text
src/
  app.ts
  middleware/
    auth.ts
    request-id.ts
  routes/
    index.ts
    users.ts
    sessions.ts
  domain/
    users/
      service.ts
      repository.ts
```

A useful split is:
- `app.ts` wires global middleware and mounts routers.
- `routes/*.ts` defines HTTP concerns for one feature area.
- `middleware/*.ts` owns reusable request pipeline behavior.
- `domain/*` holds the business operations handlers call.

Avoid inventing a controller layer that duplicates the route files. In Hono, the route module already is the HTTP entry point.

## Route Composition

Build subrouters per feature, then mount them in one place with `app.route()`:

```ts
import { Hono } from 'hono'
import { usersRouter } from './routes/users'
import { sessionsRouter } from './routes/sessions'

const app = new Hono()

app.route('/users', usersRouter)
app.route('/sessions', sessionsRouter)

export default app
```

For larger apps, keep the mounted chain available for exported types:

```ts
import { Hono } from 'hono'
import { usersRouter } from './routes/users'
import { sessionsRouter } from './routes/sessions'

const app = new Hono()
const routes = app.route('/users', usersRouter).route('/sessions', sessionsRouter)

export { app, routes }
export type AppType = typeof routes
```

Guidance:
- One router per bounded feature area beats one giant `app.ts`.
- Mount routers close to the final public path structure.
- Keep router files readable enough that a maintainer can scan all endpoints for a feature in one pass.

## Middleware Layering

Use `createMiddleware()` for reusable pipeline steps with typed context:

```ts
import { createMiddleware } from 'hono/factory'

export const authMiddleware = createMiddleware<{
  Variables: {
    user: { id: string; email: string }
  }
}>(async (c, next) => {
  const user = await authenticateRequest(c.req)

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('user', user)
  await next()
})
```

Layer middleware from most general to most specific:
- request metadata
- authentication
- authorization
- validation / parsed input helpers
- handler

Rules:
- Middleware should either enrich the request context or stop the request with a truthful response.
- Keep middleware narrow. One middleware should own one concern.
- Prefer route-local middleware for feature-specific behavior and app-level middleware for global concerns.
- If multiple routes need the same preconditions, extract middleware instead of repeating setup inside handlers.

## Validation

Validation belongs in middleware or validator helpers that run before the handler body.

With an optional validator package:

```ts
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const createUserSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
})

const app = new Hono()

app.post(
  '/',
  zValidator('json', createUserSchema),
  async (c) => {
    const input = c.req.valid('json')
    const user = await createUser(input)
    return c.json(user, 201)
  }
)
```

Without a validator library, still keep parsing and rejection ahead of domain logic:
- read the body once
- check shape explicitly
- return a 400/422 response immediately when invalid
- pass validated data forward, not the raw request object

Do not bury validation in the middle of a handler after side effects have already started.

## Thin Handlers

A handler should mainly do three things:
1. read already-validated request data
2. call domain code
3. translate the result into an HTTP response

Good shape:

```ts
usersRouter.get('/:id', async (c) => {
  const user = c.var.user
  const targetUser = await usersService.getById({
    actorId: user.id,
    id: c.req.param('id'),
  })

  if (!targetUser) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json(targetUser)
})
```

If a handler starts coordinating validation, authorization rules, database wiring, and response formatting all at once, split the responsibilities back out.

## Typed Context Variables

Use typed context variables for request-scoped data such as:
- authenticated user
- database handle
- logger
- request ID
- feature flags resolved for the current request

Example:

```ts
import { createMiddleware } from 'hono/factory'

export const requestContextMiddleware = createMiddleware<{
  Variables: {
    requestId: string
    db: DatabaseClient
  }
}>(async (c, next) => {
  c.set('requestId', crypto.randomUUID())
  c.set('db', createDatabaseClient())
  await next()
})
```

Guidance:
- Keep variable names stable and obvious.
- Use context for per-request collaborators, not arbitrary data passing.
- Prefer one canonical type for each context value. Do not maintain parallel shapes for the same concept.

## API Design Guidance

Prefer APIs that are boring and honest:
- use resource-oriented paths and standard HTTP methods where practical
- return consistent error envelopes within a service
- distinguish auth failure, validation failure, not found, and conflict instead of collapsing everything into 500
- return the status code that tells the truth about what happened
- keep transport DTOs close to the route when they are truly HTTP-specific

Practical defaults:
- `200` for successful reads and updates with a body
- `201` for successful creation
- `204` for successful deletion or mutation with no body
- `400` or `422` for invalid input, depending on project convention
- `401` for unauthenticated
- `403` for authenticated but forbidden
- `404` when the resource is not found
- `409` for state conflicts

## Testing

Test Hono at the router boundary. Prefer real request/response execution over mocking framework internals.

`hono/testing` works well for typed endpoint tests:

```ts
import { describe, expect, it } from 'vitest'
import { testClient } from 'hono/testing'
import app from './app'

describe('GET /users/:id', () => {
  it('returns 404 for a missing user', async () => {
    const client = testClient(app)
    const res = await client.users[':id'].$get({
      param: { id: 'missing-user' },
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })
})
```

Coverage to prefer:
- happy path response body and status
- validation rejection
- auth/authz rejection
- middleware-populated context being available where expected
- edge cases around missing params, malformed payloads, and domain errors

Avoid tests that only assert a mocked service was called. That proves wiring, not behavior.

## Anti-Patterns

Avoid these in Hono codebases:
- giant `app.ts` files with every endpoint inline
- controller-heavy layers that duplicate route modules without adding clarity
- validation hidden inside handlers after database or network work begins
- untyped `c.set()` / `c.get()` usage that forces guessing at call sites
- middleware that mixes unrelated concerns such as auth, logging, and validation in one block
- handlers that manually construct infrastructure dependencies per branch
- runtime-specific assumptions baked into otherwise portable Hono code without need

## Review Checklist

Before considering the work done, verify:
- routers are mounted with `app.route()` in a clear tree
- shared request concerns live in `createMiddleware()` middleware
- handlers are thin and mostly orchestration-free
- request input is validated before business logic runs
- context variables are typed and named consistently
- tests cover both success and failure paths
