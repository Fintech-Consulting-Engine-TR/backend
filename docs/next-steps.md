# Наступні Backend-задачі

Оновлення 28.10.2026: Docker, PostgreSQL/Prisma, початкова міграція User та Swagger реалізовані.
Наступні пріоритети: командний Git/CI, auth/RBAC, domain model, Banks and People та audit.
Попередній план і звіт нижче збережено як історію; актуальні результати — [trello-tasks.md](trello-tasks.md).

1. Погодити framework/TypeScript, межі команд, auth, БД та пріоритети першого релізу.
2. Описати domain model і API contracts банків, людей, зайнятості, контактів, відносин; визначити сталі ID та правила дублів.
3. Підключити вибране сховище, міграції, транзакції, backup/restore та інтеграційні тести.
4. Реалізувати справжню автентифікацію, захищений bootstrap адміністратора й перевірку прав на ресурси; без public signup.
5. Реалізувати банки/людей/зайнятість та audit trail. Перевірити конкурентне додавання і зміну роботи.
6. Додати імпорт Monday/експортів: dry run, mapping, дублі, ручні конфлікти, звіт без втрат даних.
7. Реалізувати відносини/напрями, задачі, передачу відповідального, наступні дії й історію з джерелами.
8. Перевірити провайдерів, реалізувати Gateway та jobs з idempotency/reconciliation і явними станами помилок.
9. Додати кампанії та паузи: unit/integration тести всіх охоплень, OOO/bounce, заблокованих повідомлень у черзі.
10. Підключити Chrome Extension до спільного API; після базового циклу — звіти та AI із підтвердженням менеджером.

Перед production потрібні окремі рішення щодо TLS/reverse proxy, rate limits, auth, моніторингу,
сховища логів, readiness залежностей і deployment. Поточний health не обіцяє готовність цих систем.

## Короткий звіт для Trello

Створено Backend Core Fintech Consulting Engine на Node.js 24 LTS, Express 5 та JavaScript ES Modules.
Реалізовано application factory, HTTP server, environment validation, Helmet, CORS allowlist,
JSON parsing, request IDs, JSON logs, централізовані помилки, 404, graceful shutdown та GET /api/health.
Є механізм реєстрації модульних routers. Додано автоматизовані тести, README, архітектуру і наступні кроки.
PDF та чотири схеми проаналізовано й збережено без змін. Бізнес-правила задокументовано;
CRM, auth, БД, черги й інтеграції свідомо залишено наступним задачам.

Перевірка реалізації: `npm test` — 13 тестів пройшли, 0 помилок (Node.js v24.13.0).
Перевірено health/JSON/security headers, 404, async errors, парсинг/ліміт JSON, CORS,
валідацію конфігурації, HTTP startup/shutdown, зайнятий порт, SIGINT/SIGTERM окремих production-процесів,
завершення активних запитів, дедлайн завислого запиту та безпечну обробку пізньої помилки.
У середовищі Codex HTTP-тестам потрібен дозвіл на локальний listener (sandbox повертав EPERM).
Під час встановлення npm повідомив 0 відомих вразливостей. SHA-256 усіх п'яти копій джерел
збігаються з оригіналами в Downloads.

Детальний повторний аудит і актуальний коментар для Trello: [code-review.md](code-review.md).
