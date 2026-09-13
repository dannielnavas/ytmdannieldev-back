# AGENTS.md — ytmdannieldev-back

## Project Overview

NestJS 12 backend (TypeScript, ESM) for a YouTube music tracker. Deployed to Vercel.

## Commands

- `pnpm run build` — nest build (deletes `dist/` before compiling)
- `pnpm run start:dev` — watch mode
- `pnpm run lint` — oxlint on `src/` and `test/`
- `pnpm run test` — vitest unit tests (`*.spec.ts`)
- `pnpm run test:e2e` — vitest e2e tests (`*.e2e-spec.ts`)
- `pnpm run format` — prettier on `src/` and `test/`

## Critical Conventions

- **ESM with `.js` imports**: All local imports use `.js` extensions (e.g., `./config.js`). Do not omit them.
- **`strictPropertyInitialization: false`**: TypeScript strict mode is on but this option is disabled — intentional.
- **Vitest globals enabled**: `describe`, `it`, `expect` are available without imports in test files.
- **oxlint**: Linter, not ESLint. Uses `@typescript-eslint` rules through oxlint. `no-explicit-any` is off, `no-floating-promises` is warn.

## Environment

- `.env` is committed (dev only). `.stag.env` and `.prod.env` are gitignored.
- Required vars: `API_KEY`, `JWT_SECRET`, `DATABASE_NAME`, `DATABASE_PORT`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_HOST`, `POSTGRES_PORT`, `API_KEY_RESEND`.
- Optional: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (empty string allowed).
- `NODE_ENV` controls which env file loads: `dev` → `.env`, `stag` → `.stag.env`, `prod` → `.prod.env`.

## Architecture

- Entry: `src/main.ts`
- Root module: `src/app.module.ts`
- Modules: `auth`, `users`, `youtube`, `database`
- Auth: JWT + Passport, roles-based (`ERoles.ADMIN`, `ERoles.SALER`). Use `@Public()` decorator to skip JWT. Use `@Roles(ERoles.ADMIN)` for role-gated endpoints.
- Validation: `whitelist: true`, `forbidNonWhitelisted: true`, implicit type conversion enabled. DTOs must use `class-validator` and `class-transformer`.
- Swagger docs served at `/docs` with static assets from `swagger-ui-dist`.
- CORS: Only `http://localhost:4200` allowed in dev.
- Database: PostgreSQL via TypeORM with `synchronize: true` (dev only). SSL enabled.

## Testing

- Unit tests colocated with source (`*.spec.ts`).
- E2e tests in `test/` directory (`*.e2e-spec.ts`).
- Test coverage via `@vitest/coverage-v8`.
