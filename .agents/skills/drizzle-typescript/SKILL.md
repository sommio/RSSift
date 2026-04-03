---
name: drizzle-typescript
description: Use this skill when designing or changing a TypeScript data layer built with Drizzle ORM. It applies to schema design, relations, migrations, query patterns, rollout planning, and verification for Drizzle-backed applications.
---

<examples>
<example>
Context: The user is adding a new domain model and needs the database layer planned correctly.
user: "Add organizations, memberships, and invitations with Drizzle"
assistant: "I'll use the drizzle-typescript skill to design the schema modules, explicit relations, migration plan, and verification steps before changing the data layer"
<commentary>New tables and cross-table behavior need schema boundaries, relation definitions, migration discipline, and rollout planning.</commentary>
</example>
<example>
Context: The user has changed the schema and wants the migration reviewed before shipping.
user: "Review this Drizzle migration and make sure the generated artifacts are in sync"
assistant: "I'll use the drizzle-typescript skill to check the schema source, generated migration output, and verification plan together"
<commentary>Drizzle changes are only complete when schema, migrations, generated artifacts, and verification stay aligned.</commentary>
</example>
<example>
Context: The user wants query code cleaned up without inventing extra DTO layers.
user: "Refactor these Drizzle queries so the types stop drifting from the schema"
assistant: "I'll use the drizzle-typescript skill to tighten the schema-derived types, keep handlers thin, and remove redundant handwritten database DTOs"
<commentary>When the query layer duplicates schema types by hand, the fix is usually to move back to Drizzle-derived types and simpler query boundaries.</commentary>
</example>
</examples>

# Drizzle ORM + TypeScript

Use this skill for first-party TypeScript data-layer work built on Drizzle ORM. Keep the guidance ORM-centric: design the schema in TypeScript, express relations explicitly, generate and review migrations intentionally, and verify the real database behavior before calling the work done.

## Core Stance

- Model the database in explicit TypeScript schema modules, not in scattered ad hoc query files.
- Define relations with `relations(...)` wherever the domain needs relational queries. Foreign keys alone are not enough guidance for the rest of the codebase.
- Derive application-facing database types from the schema with `typeof table.$inferSelect` and `typeof table.$inferInsert` unless a narrower boundary is truly required.
- Treat migrations as a reviewed artifact produced from schema changes, not as incidental output.
- Verify schema changes in a real database workflow. A generated file that looks plausible is not proof.

## When To Reach For This Skill

Use it when the task involves any of these:

- Adding or changing Drizzle schema modules
- Defining or correcting explicit relations
- Generating, reviewing, or applying migrations with `drizzle-kit`
- Refactoring query code to use inferred types instead of parallel handwritten types
- Planning rollout steps for non-trivial schema changes
- Verifying that schema source, migration files, and generated artifacts still agree

## Preferred Project Shape

Keep schema definition, migrations, and verification concerns separate.

```text
src/db/
  schema/
    users.ts
    organizations.ts
    memberships.ts
    index.ts
  queries/
    organizations.ts
  client.ts
  migrate.ts

drizzle/
  0001_create_organizations.sql
  0002_add_memberships.sql
```

Guidelines:

- Put one cohesive domain area per schema module. Split `users.ts`, `billing.ts`, `organizations.ts`, not one giant `schema.ts` for unrelated concepts.
- Use `src/db/schema/index.ts` only as a composition point for exports, not as the place where every table is defined.
- Keep query modules separate from schema modules. Table definitions describe the database; query modules orchestrate reads and writes.
- Keep migration output in the configured Drizzle directory, checked in exactly as generated and reviewed.

## Schema Definition

Use the dialect-specific core package that matches the project, but keep the guidance portable across engines.

```ts
import { relations } from "drizzle-orm";
import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: integer("user_id").notNull(),
    role: text("role").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
}));

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
```

Rules:

- Name tables, columns, constraints, and indexes deliberately. The migration history becomes part of the system record.
- Put defaults, nullability, uniqueness, and foreign keys in the schema definition so callers do not reconstruct those rules in application code.
- Keep engine-specific details local to the schema module. The surrounding guidance should still work if the project is PostgreSQL today and SQLite tomorrow.
- Export inferred types near the table when they are used widely enough to justify a shared name.

## Relations And Query Boundaries

Drizzle works best when the schema tells the truth and handlers stay thin.

- Define `relations(...)` explicitly for tables that participate in relational queries.
- Prefer small query functions or repository modules that accept validated input and return schema-derived types.
- Keep transport concerns out of the data layer. HTTP handlers, background jobs, and UI loaders should call query functions; they should not rebuild join logic repeatedly.
- If multiple callers need the same join or transaction pattern twice, extract one query helper instead of cloning the SQL shape.

## Types: Infer, Do Not Re-declare

Prefer schema-derived types first:

```ts
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
```

Use handwritten types only when crossing a real boundary, such as:

- an external API contract
- a form payload that is validated before touching the database
- a view model that intentionally combines multiple sources

Even then, derive from the database shape where possible instead of creating a second source of truth.

## Migration Discipline

A Drizzle change is not finished when the schema compiles. It is finished when the schema source, generated migration artifacts, and database state agree.

Typical workflow:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

If the project wraps these in package scripts, prefer those scripts. Keep direct examples in `pnpm` form.

Migration rules:

- Generate migrations from reviewed schema changes. Do not hand-edit generated SQL casually.
- Read the generated migration before applying it. Confirm names, defaults, nullability, indexes, and destructive operations.
- For risky changes, plan expand/migrate/contract steps instead of forcing one dangerous cutover.
- Keep generated artifacts committed in the same change as the schema source that produced them.
- Do not let migration directories drift from the checked-in schema modules or Drizzle metadata.

## Rollout And Verification

Separate these concerns clearly:

- **Schema definition:** the TypeScript source of tables, relations, and constraints
- **Migration artifact:** the generated SQL or metadata that moves the database to the new shape
- **Verification:** the proof that the migration applies cleanly and the application still reads and writes correctly

Verification should include the smallest real checks that prove the change:

- Run the migration against a real local or ephemeral database
- Exercise the changed read/write path end to end
- Confirm inferred insert/select types still match actual usage sites
- For data backfills or destructive changes, verify counts, nullability, and constraint expectations before and after rollout

Where useful, include lightweight checks such as:

```bash
pnpm test -- --runInBand src/db
pnpm drizzle-kit migrate
```

Adapt the exact command to the repo, but always verify behavior against a real database path, not only mocked query calls.

## Testing Guidance

- Prefer integration tests that create schema state, run the query path, and assert on real results.
- Test transactions, uniqueness constraints, relation traversal, and failure behavior where the change is non-trivial.
- When adding a new query helper, test the observable contract of that helper rather than mocking Drizzle internals.
- For migration-heavy work, add or run verification code that would fail if the migration and schema source diverge.

## Anti-Patterns To Avoid

- Duplicating `Select` and `Insert` types manually when `table.$inferSelect` and `table.$inferInsert` already express the truth
- Mixing unrelated schemas into one large file because it feels convenient in the moment
- Repeating the same join or transaction logic across handlers instead of extracting one query helper
- Treating relations as optional decoration while callers hand-roll relational shape everywhere else
- Checking in migration output that no longer matches the schema source that generated it
- Using `push`-style workflows as the default production rollout path when the team needs reviewed, replayable migrations
- Declaring work done without applying the migration and exercising the changed path against a real database

## Review Checklist

Before you finish, confirm all of these are true:

- Schema modules reflect the domain cleanly and do not lump unrelated concepts together
- Explicit relations exist wherever relational queries depend on them
- Shared database types come from `$inferSelect` and `$inferInsert`
- Migration files and generated artifacts match the intended schema change
- Verification covers both migration application and the changed query behavior

Use this skill to keep the Drizzle layer honest: one schema source of truth, one migration history, and one verified story about what the database actually does.
