# Звіт за чотирма задачами Trello — 28.10.2026

Продовжено наявний Node.js 24 / Express / JavaScript ES Modules проєкт.
Нової CRM, auth, JWT, RBAC, реєстрації або User API не створено. Архітектурні PDF/PNG не змінювалися.

## 1. Ініціалізація Backend та Docker

**Було:** package.json/lockfile, npm scripts, .gitignore, dotenv та сервер.

**Додано:** multistage Dockerfile (build/migrate/runtime), .dockerignore, docker-compose.yml із app/db,
PostgreSQL 16, backend network, postgres_data volume, healthchecks, depends_on service_healthy.
Runtime працює як node, init передає сигнали, порти прив'язані до loopback, пароль береться з environment.
Міграції запускаються окремим image перед релізом, не кожною replica автоматично.

**Файли:** Dockerfile, .dockerignore, docker-compose.yml, .env.example, .gitignore,
package.json, package-lock.json, README.md.

**Перевірки:** Compose config --quiet, реальний build, up, healthy app/db, HTTP/CORS,
stop з exit=0 обох контейнерів. npm ci реально виконався під час Docker build.
Docker CLI знайдено в Docker.app; додавання його каталогу в PATH виправило відсутність credential helper.

**Відповідність:** виконано. requirements.txt належить Python; у Node.js використовуються package.json
та package-lock.json. Два довготривалі сервіси, migration image запускається одноразово.
Production deployment/backups/secrets manager не входили до цієї картки.

## 2. CORS та глобальний Error Handler

**Було:** cors allowlist, OPTIONS, Helmet, AppError, error envelope, 400/404/413/500, захист stack trace.

**Зараз:** збережено робочу реалізацію; додано регресійну перевірку AppError 422 та перевірки Docker origins.
Валідація майбутніх business payloads не симулюється production endpoint-ами.

**Файли:** test/core.test.js; документація README.md. src/http/errors.js і CORS middleware не переписувались.

**Перевірки:** allowed origin 200, сторонній origin 403, preflight 204; invalid JSON 400,
unknown route 404, oversized body 413, validation AppError 422, unexpected async error 500 без secret/stack.

**Відповідність:** виконано. Дозволені лише точні CORS_ORIGINS, production wildcard не допускається.
HTTP clients без Origin дозволені — CORS не є authentication.

## 3. PostgreSQL, Prisma та міграції

**Було:** БД/ORM не було.

**Додано:** Prisma 7.10.1 і adapter-pg, prisma.config.js, User (UUID id, unique email, created_at),
SQL migration, database lifecycle, db:* commands та DB integration suite. DATABASE_URL перевіряється,
реальне SELECT 1 виконується до listen; помилка підключення не містить credentials.
Пул обмежений 5 connections, connect/query timeout 5 секунд. Disconnect після завершення HTTP.

**Файли:** prisma/schema.prisma, prisma/migrations/**, prisma.config.js, src/database/client.js,
scripts/db-check.js, src/config/env.js, src/server.js, test/database.integration.js, package files.

**Перевірки:** prisma validate/generate, db:check з реальною БД; міграція застосована через Docker migration image;
повторний deploy — No pending migrations; status — up to date; migrate diff — No difference detected.
DB тести перевірили create/read після reconnect, unique email P2002, HTTP із підключеною БД та connection failure.

**Відповідність:** виконано. Для JS без TypeScript toolchain використано prisma-client-js generator,
який Prisma 7 ще підтримує, але позначає deprecated. Перед major upgrade потрібен перегляд генератора.
UUID генерується Prisma (raw SQL INSERT повинен сам передати id); unique email наразі case-sensitive.
User API та політика нормалізації email — окрема майбутня робота.

## 4. Healthcheck та Swagger

**Було:** GET /api/health і перевірки liveness.

**Додано:** сумісний GET /api/v1/health, OpenAPI 3.0.3 /api/openapi.json,
Swagger UI /api/docs/ із локальними assets. Router і OpenAPI мають спільний перелік health paths.
OpenAPI schemas описані явно; сторінка UI генерується з документа, не з inference довільного Express коду.

**Файли:** src/routes.js, src/openapi/document.js, test/core.test.js, README.md, package files.

**Перевірки:** обидва health endpoints, JSON document, Swagger HTML і JS/CSS — 200;
реальні HTTP-запити до локального backend із БД та Docker app. Health status/schema перевірено тестами.

**Відповідність:** виконано. Health залишився process liveness; runtime readiness БД не заявляється.
Візуальний browser test Swagger не виконувався; перевірено HTTP HTML/assets/OpenAPI.

## Загальні результати

- npm test: 15/15 pass; попередні сценарії збережено, додано 422, версійований health/docs, DATABASE_URL validation.
- npm run test:db: 3/3 pass, 0 skipped на реальній PostgreSQL.
- npm audit: 0 відомих вразливостей на момент запуску.
- Prisma schema validate, generate, migrate deploy, status та diff виконано успішно.
- Compose app і db healthy; HTTP 200, CORS 200/403, OPTIONS 204.
- Локальний server із БД пройшов HTTP/shutdown; CLI SIGINT/SIGTERM — у Core suite.
- Docker stop: app exit=0, db exit=0. Для перевірок використано окремий project fce-review й тимчасові credentials поза workspace.

## Коментарі для Trello

### Ініціалізація Backend та Docker

Доповнено наявний Node.js Backend Dockerfile та Compose app/db. Додано PostgreSQL volume/network,
healthchecks, очікування готовності БД, non-root runtime і передачу environment без вбудованих секретів.
Образ зібрано, app/db healthy, завершення обох контейнерів — exit 0. Для Node.js використано package.json/lockfile.

### CORS та глобальний Error Handler

Перевірено наявну allowlist CORS і централізовані помилки без переписування робочого middleware.
Підтверджено localhost origins, production deny, OPTIONS та статуси 400/404/413/422/500.
Внутрішні помилки не розкривають stack trace. HTTP/Core suite: 15/15 pass.

### PostgreSQL, Prisma та міграції

Підключено PostgreSQL через Prisma 7 і DATABASE_URL, додано User (id/email/created_at) та першу міграцію.
Налаштовано lifecycle Prisma pool і безпечні помилки підключення. Міграція виконана, повторне застосування
не змінює БД, schema diff відсутній. 3/3 DB integration tests pass. Auth та User API не додавались.

### Healthcheck та автоматична документація

Збережено /api/health, додано /api/v1/health, OpenAPI JSON та Swagger UI /api/docs/.
Документація відповідає фактичним health routes і response schemas. HTTP перевірки локально та в Docker успішні.
Health означає liveness процесу; readiness БД не змішується з ним.

Після stop/up міграція залишилася up to date — persistent volume перевірено.
Тестові контейнери завершено через Compose down; volume збережено. Git status виконано:
папка досі не є Git repository, тому Git diff недоступний. Push/PR/remote не виконувалися.
SHA-256 усіх 5 архітектурних PDF/PNG збігаються з оригіналами.

Джерела технічних рішень:
- [Prisma 7 database adapters](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers)
- [Prisma generators, включно з prisma-client-js](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)
