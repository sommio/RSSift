---
name: react-router-typescript
description: Practical guidance for building React Router applications in TypeScript. Use when adding routes, loaders, actions, nested layouts, route-level error boundaries, or tests for route-driven UI and data flows.
---

<examples>
<example>
Context: The user is building a new feature in a TypeScript app that uses React Router data APIs.
user: "Add an account settings flow with nested routes, loaders, and form actions"
assistant: "I'll use the react-router-typescript skill to structure the route modules, keep data loading in loaders/actions, and wire nested layouts and tests around the route tree."
<commentary>Use this skill when the work is centered on React Router route modules, navigation, or route-owned data loading and mutations.</commentary>
</example>
<example>
Context: The user has React components that fetch in useEffect even though the app already uses React Router.
user: "Refactor this page to follow React Router patterns"
assistant: "I'll use the react-router-typescript skill to move fetches and writes into loaders/actions, simplify the component tree, and add route-focused tests."
<commentary>Use this skill when route-driven data flow should replace component-local fetching or mutation orchestration.</commentary>
</example>
<example>
Context: The user is debugging a broken nested layout or route-level error handling.
user: "Our dashboard child routes are leaking errors to the root boundary"
assistant: "I'll use the react-router-typescript skill to verify the nested route tree, add the right ErrorBoundary ownership, and test the failing route path directly."
<commentary>Use this skill when layout nesting, outlet composition, or route-specific error boundaries are part of the problem.</commentary>
</example>
</examples>

# React Router + TypeScript

Use this skill for TypeScript applications where React Router owns navigation, data loading, form mutations, and route-level failure handling.

## What It Solves

React Router works best when each route module owns the data and mutations needed to render that URL segment. This skill helps you:

- organize work around route modules instead of page-sized component blobs
- keep reads in `loader` and writes in `action`
- compose nested layouts with `Outlet` instead of ad hoc wrapper trees
- handle failures with route-level `ErrorBoundary` components
- test behavior at the router boundary instead of mocking everything from inside components

## When To Use It

Use this skill when the request involves:

- adding or refactoring route modules
- creating nested layouts, index routes, or child route flows
- moving data fetching out of `useEffect` and into loaders
- handling mutations with `<Form>`, `useFetcher`, `useSubmit`, and route actions
- adding route-specific loading, pending, error, or empty states
- testing navigation, loader/action behavior, or nested route rendering

## Package Setup

Prefer the project's existing setup. When examples need package commands, use `pnpm`:

```bash
pnpm add react-router
pnpm add -D @react-router/dev typescript vitest @testing-library/react @testing-library/user-event
```

Do not force a single directory shape. React Router supports multiple valid layouts. Pick the simplest structure that keeps each URL segment easy to find.

## Core Working Style

### 1. Route Modules Own Route Data

Treat each route module as the contract for one URL segment.

- `loader` reads the data required before rendering
- `action` performs mutations for that route
- the default component renders from loader/action results instead of re-fetching
- route-specific metadata, pending UI, and error UI belong with the route module when possible

Keep route modules thin. Parse params, call domain services, return typed data, and render. Push business rules into shared server/domain code, not JSX.

### 2. Prefer Route-Driven Data Flow

Default to React Router's data APIs before reaching for client-side fetch orchestration.

Good fit:
- page data needed before render
- mutations triggered by forms or button submits
- post-mutation revalidation managed by the router
- URL-driven filtering, sorting, pagination, and search

Only fetch inside components when the data is truly component-local and not owned by navigation state.

## Route Module Patterns

### Loaders

Use loaders for read paths.

- validate params and search params at the boundary
- call a dedicated service/helper for data access
- throw `Response` for expected HTTP failures like 404 or 403
- return the minimum shape the route needs right now
- pass `request.signal` to cancellable I/O where supported

```tsx
import type { Route } from "./+types/projects.$projectId";

export async function loader({ params, request }: Route.LoaderArgs) {
  const projectId = params.projectId;
  if (!projectId) {
    throw new Response("Project id is required", { status: 400 });
  }

  const project = await getProjectPage({
    projectId,
    signal: request.signal,
  });

  if (!project) {
    throw new Response("Not found", { status: 404 });
  }

  return { project };
}
```

### Actions

Use actions for writes.

- read and validate `request.formData()` or request body once
- perform exactly one user-intent mutation per action when possible
- return validation errors as structured data the route can render
- redirect after successful writes when the next URL should change
- rely on router revalidation instead of manually syncing caches in components

```tsx
import type { Route } from "./+types/projects.$projectId.edit";
import { redirect } from "react-router";

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const name = formData.get("name");

  const result = await updateProject({
    projectId: params.projectId!,
    name,
  });

  if (!result.ok) {
    return { fieldErrors: result.fieldErrors };
  }

  return redirect(`/projects/${params.projectId}`);
}
```

### Components

Route components should mostly translate route data into UI.

- read loader data from typed route props or router hooks
- use `<Form>` and `useFetcher()` for mutations that belong to the route system
- keep local React state for interaction details, not authoritative server data
- let URL state represent filters, tabs, and pagination when shareable/navigation-relevant

## Nested Layouts

Nested routing is a design tool, not just a folder trick.

Use nested layouts when multiple screens share:

- navigation chrome
- authorization checks
- loader data needed by several child routes
- error boundaries or pending states scoped to one application section

Practical guidance:

- put persistent shell UI in a parent route and render children with `Outlet`
- keep parent loaders focused on data every child needs
- avoid stuffing all page data into the root loader just because descendants can read it
- add child loaders for child-specific data instead of overfetching at the parent
- prefer index routes for default child content instead of conditional rendering inside the parent component

A healthy route tree mirrors the visible layout tree and URL structure closely enough that a maintainer can predict one from the other.

## Error Boundaries

Every meaningful route section should have a deliberate error ownership story.

- add `ErrorBoundary` at route boundaries where you can offer a useful fallback
- use child boundaries for failures local to a feature area
- let truly global failures fall to the root boundary
- distinguish expected route errors (`isRouteErrorResponse`) from unexpected exceptions
- keep boundary UI actionable: explain what failed, preserve surrounding layout when appropriate, and offer recovery/navigation paths

Do not route every failure to a single top-level boundary if the user could stay within the surrounding app shell.

## Testing Guidance

Test through the router, not around it.

### What To Test

Prioritize:

- a route renders the correct loader data
- an action handles valid and invalid submissions
- nested layouts render the right parent and child content together
- route-level errors land in the nearest intended `ErrorBoundary`
- navigation changes URL ownership and data loading as expected

### How To Test

- prefer integration tests that render a memory router with realistic route objects/modules
- stub domain/service calls at the boundary below the loader/action, not React Router itself
- exercise forms with user interactions, then assert resulting UI and navigation
- test loader/action behavior directly when business branching is complex
- keep route tests close to the route or feature they verify

```tsx
import { createMemoryRouter, RouterProvider, useLoaderData } from "react-router";
import { render, screen } from "@testing-library/react";

it("renders the project name from the loader", async () => {
  const router = createMemoryRouter(
    [
      {
        path: "/projects/:projectId",
        loader: async () => ({ project: { name: "Alpha" } }),
        Component: () => {
          const data = useLoaderData() as { project: { name: string } };
          return <h1>{data.project.name}</h1>;
        },
      },
    ],
    { initialEntries: ["/projects/123"] }
  );

  render(<RouterProvider router={router} />);
  expect(await screen.findByRole("heading", { name: "Alpha" })).toBeVisible();
});
```

Testing heuristics:

- if a test needs to mock half the router, the production design is probably fighting React Router
- if route behavior depends on URL state, assert against actual navigation entries
- if an action causes redirect + revalidation, test the whole transition instead of only the submit callback

## Anti-Patterns To Avoid

Avoid patterns that fight route ownership and router-managed data flow.

- fetching page data in `useEffect` for a route that already has a loader
- posting with ad hoc `fetch()` in components when a route `action` or `fetcher` should own the mutation
- duplicating loader data into global client state without a real cross-route need
- putting all application data in the root loader, forcing every route to overfetch
- deeply coupling route components to handwritten DTO layers when the loader can return the actual view model directly
- using one giant layout component with conditional branches instead of nested routes and index routes
- swallowing expected 404/403 cases in components instead of throwing route responses
- testing presentational children while leaving the route module behavior untested

## Decision Rules

When choosing where logic belongs:

- URL-owned read -> `loader`
- URL-owned write -> `action`
- shared section chrome -> parent route + `Outlet`
- route-scoped failure UI -> nearest `ErrorBoundary`
- ephemeral interaction state -> component state
- reusable business rule -> shared server/domain module

React Router is strongest when the route tree tells the truth about the product's URL structure, data dependencies, and failure boundaries. Prefer that clarity over component-local workarounds.
