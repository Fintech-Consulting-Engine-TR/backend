# Fintech Consulting Engine — Backend

Modular monolith: Node.js 24, Express 5, JavaScript ES Modules, PostgreSQL 16, Prisma 7.
Реалізовано HTTP Core, підключення БД, модель User/міграцію, Swagger. Auth/RBAC і CRM-модулів немає.

## Локальний запуск на macOS

Потрібні Node.js 24/npm, для БД — PostgreSQL 16 (локальний або Docker).

```sh
cd /path/to/fintech-consulting-engine
nvm install
nvm use
cp .env.example .env
# Відредагуйте .env: задайте власний пароль і відповідні DATABASE_URL/DOCKER_DATABASE_URL.
npm ci
npm run db:validate
npm run db:migrate
npm run db:check
npm run dev
```

`npm ci` генерує Prisma Client через postinstall. `npm start` запускає без watch.
Для HTTP-only режиму залиште `DATABASE_URL=` порожнім. Якщо URL задано, недоступна БД зупиняє startup.
Сервер не виконує міграції автоматично; їх запускають явно до релізу. `/api/health` — liveness,
не readiness БД. Окремий readiness endpoint наразі не додавався.

## Docker Compose

Docker Desktop має бути запущений. Якщо `docker` не знайдено на macOS:

```sh
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

У `.env` задайте `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` (host 127.0.0.1)
та `DOCKER_DATABASE_URL` (host db, port 5432). Пароль в URL має бути percent-encoded.
`CHANGE_ME` — лише заповнювач, замініть його. Не комітьте `.env` і не публікуйте `docker compose config`,
бо розгорнута конфігурація містить credentials.

```sh
docker compose -p fintech up -d db --wait
# Одноразовий migration image; CLI не потрібен у runtime image.
docker build --target migrate -t fintech-migrate .
docker run --rm --network fintech_backend --env-file .env fintech-migrate \
  sh -c 'DATABASE_URL="$DOCKER_DATABASE_URL" npm run db:migrate'
docker compose -p fintech up -d --build --wait
curl http://127.0.0.1:3000/api/health
docker compose -p fintech ps
docker compose -p fintech down
```

`down` зберігає named volume; `down -v` видаляє дані — не використовуйте для звичайного завершення.
Compose містить рівно 2 сервіси: app і db, спільну backend network та postgres_data volume.
app чекає healthy db, перевіряє реальне з'єднання перед listen, працює як non-root user node.
Порти опубліковано лише на loopback. SIGTERM доходить до Node через init; shutdown закриває HTTP і Prisma pool.
Змінювати пароль існуючої БД треба SQL-командою: зміна POSTGRES_PASSWORD не змінює initialized volume.
Для production потрібно окремо погодити TLS, secrets manager, backups, ролі БД та deployment pipeline.

## API та Swagger

| URL | Призначення |
| --- | --- |
| GET /api/health | Сумісний попередній liveness |
| GET /api/v1/health | Версійований liveness |
| GET /api/openapi.json | OpenAPI 3.0.3 |
| /api/docs/ | Swagger UI з локальними JS/CSS assets |

Swagger UI генерується з OpenAPI-документа. Схеми відповідей описано явно в
`src/openapi/document.js`; це не автоматичне виведення контрактів із довільних Express handlers.
Шляхи health використовуються спільно в router і документі. Нові модулі реєструйте з path `/v1/<module>`.
Публічних User endpoints немає.

```json
{"data":{"status":"ok","uptimeSeconds":1.25,"timestamp":"2026-10-28T12:00:00.000Z"}}
```

Помилки: `{"error":{"code":"NOT_FOUND","message":"Route not found","requestId":"uuid"}}`.
400 — invalid JSON; 404 — route not found; 413 — body limit; 422 — явний AppError валідації;
500 — непередбачений виняток без original message/stack. AppError приймає лише публічно безпечні 4xx.
Валідацію майбутніх бізнес-запитів ще треба реалізувати в модулях.

## Конфігурація

| Змінна | Типове значення / призначення |
| --- | --- |
| NODE_ENV | development; також test/production |
| HOST / PORT | 127.0.0.1 / 3000; Compose app слухає 0.0.0.0:3000 |
| CORS_ORIGINS | Порожня allowlist; .env.example дозволяє http://localhost:5173 |
| LOG_LEVEL | info |
| SHUTDOWN_TIMEOUT_MS | 10000; HTTP drain deadline |
| DATABASE_URL | Необов'язково для HTTP-only; обов'язково для Prisma commands |
| DOCKER_DATABASE_URL | Обов'язково для Compose app; hostname db |
| POSTGRES_USER/PASSWORD/DB | Налаштування PostgreSQL container, без вбудованого пароля |
| DB_PORT | 5432; host port PostgreSQL |

CORS — точні origins через кому, включно з localhost та chrome-extension://ID.
Wildcard заборонено; запити без Origin дозволено. Cookies credentials не ввімкнено.
CORS не замінює auth. JSON limit 100 КБ. Логи — JSON у stdout без URLs, headers, bodies і секретних exception messages.

## Prisma та міграції

Модель `User`: UUID id (генерує Prisma), unique email (case-sensitive PostgreSQL TEXT), created_at (TIMESTAMPTZ).
Нормалізацію email слід погодити перед реалізацією user write API. Паролів/реєстрації немає.
Prisma 7 використовує adapter-pg. Для чистого JS без TS build залишено підтримуваний, але deprecated
`prisma-client-js` generator; перехід на наступний major потребуватиме перегляду генератора.

```sh
npm run db:generate
npm run db:validate
npm run db:migrate        # застосування committed migrations, без reset
npm run db:status
npm run db:check
# Лише для створення нових міграцій у dev DB:
npm run db:migrate:dev -- --name descriptive_change
```

## Тести

```sh
npm test
npm run test:coverage
npm audit
# Тільки з DATABASE_URL окремої тестової БД після db:migrate:
npm run test:db
```

HTTP suite не потребує БД. DB suite реально перевіряє User persistence, unique email, connection failure,
HTTP server із PostgreSQL і shutdown; видаляє тільки власний запис із випадковим email.
`npm test` і `test:db` запускаються окремо, щоб звичайні unit/HTTP тести не залежали від PostgreSQL.

## Структура

```text
src/
  app.js, server.js, routes.js, logger.js
  config/env.js
  database/client.js
  http/errors.js, request-context.js
  modules/health/routes.js
  openapi/document.js
prisma/
  schema.prisma
  migrations/migration_lock.toml
  migrations/202610280001_initial_user/migration.sql
prisma.config.js
scripts/db-check.js
test/core.test.js
test/database.integration.js
Dockerfile, docker-compose.yml, .dockerignore
package.json, package-lock.json, .env.example, .gitignore, .nvmrc
docs/ (архітектурні оригінали й звіти)
```

App factory не відкриває порт; server керує ресурсами. routes підключає modules; database створює один
Prisma pool на lifecycle. HTTP logs не замінюють майбутній audit trail.
`package.json`/lockfile — менеджмент Node.js залежностей; Python `requirements.txt` тут не потрібний.

Див. [архітектуру](docs/architecture.md), [наступні кроки](docs/next-steps.md),
[попередній review](docs/code-review.md), [звіт чотирьох задач](docs/trello-tasks.md).
