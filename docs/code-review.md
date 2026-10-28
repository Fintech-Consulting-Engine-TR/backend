# Технічна перевірка Backend Core — 23.10.2026

Історичний звіт початкового Core. Зміни 28.10.2026 (Docker/Prisma/Swagger) та нові результати
описано в [trello-tasks.md](trello-tasks.md).

## Висновок

Backend Core готовий до Code Review та приймання в межах задачі «Написати Ядро для бекенду».
Після точкових виправлень блокувальних дефектів у перевіреному scope не виявлено.
Це основа modular monolith, а не готова до production CRM. Формальна передача через Git потребує
наявності командного репозиторію: поточна папка не містить `.git`.

## Що перевірено

Прочитано всі власні файли коду, тестів і конфігурації, README, architecture.md, next-steps.md,
усі 4 сторінки PDF; візуально переглянуто 4 PNG. SHA-256 п'яти архітектурних матеріалів збігаються
з оригіналами Downloads. Залежності перевірено через npm ls, lockfile та npm audit;
повний незалежний аудит вихідного коду всіх сторонніх бібліотек не виконувався.

Структура доречна: app factory окремо від HTTP lifecycle; config, routers, middleware, logging
та health module розділені. Бізнес-логіки CRM ще немає, тому service/repository layers не потрібні.
Порожніх архітектурних каталогів і зайвих прямих залежностей немає. Усі 5 залежностей використовуються.
node_modules — встановлені пакети, виключені .gitignore; видаляти їх під час review не потрібно.
Граф локальних імпортів 8 файлів src не має циклів. npm ls не показав missing/invalid/extraneous пакети.
package-lock узгоджений з package.json, пакети мають registry URLs та integrity hashes.

## Відповідність архітектурі

| Майбутня частина | Можливість розширення / обмеження |
| --- | --- |
| CRM Web, Chrome Extension | Спільний /api; configurable web/extension origins; окремої БД extension немає |
| Authentication, RBAC | Middleware перед захищеними routers; resource checks у services; поки відсутні |
| Banks and People | Окремий module/router; сталі люди, історія зайнятості, email verification і конкурентні дублі задокументовані |
| Relationships and Directions | Модуль паралельних напрямів, учасників та відповідальних |
| Tasks and Team | Модуль задач, строків, передачі відповідальності |
| Communication History | Модуль подій із джерелами та прив'язкою до людини/банку/розмови/напряму |
| Campaigns | Модуль станів, scoped pauses, виключень та повторної перевірки перед send |
| Contact Search | Модуль із викликами через Gateway, без прямих provider calls у routers |
| Data Migration | Jobs/services для mapping, дублів та звіту про всі конфлікти |
| Reports | Окремий модуль читання після появи сховища |
| AI Assistant | Модуль пропозицій із підтвердженням, без самостійних send/зміни фактів |
| Background Jobs | Майбутній worker lifecycle та спільні services; зараз queue/worker немає |
| Integration Gateway | Майбутні provider adapters, idempotency, reconciliation; зараз інтеграцій немає |
| Audit Logging | Майбутній транзакційний бізнес-аудит; поточні HTTP-логи його не замінюють |

Нові routers підключаються у реєстр без переписування HTTP Core. Реалізація auth, repositories,
workers та cleanup ресурсів вимагатиме звичайного розширення composition/lifecycle коду, а не заміни архітектури.
Зараз modular monolith підтверджено структурою й напрямком залежностей; із одним health module
ще неможливо перевірити дисципліну взаємодії реальних бізнес-модулів.
Правила дублів, зайнятості, доступів і пауз узгоджені з джерелами, але виконуються поки лише як
архітектурні вимоги: їх runtime-реалізація не входить у цей Core.

## Знайдені проблеми та виправлення

1. **Середній пріоритет: можливий витік винятку в stderr після початку HTTP-відповіді.**
   Гілка headersSent передавала оригінальний err стандартному Express handler, а його logerror
   викликає console.error. Текст винятку міг містити секрет. Тепер пишуться лише безпечні метадані
   RESPONSE_ABORTED і закривається відповідь. Регресійний unit test перевіряє відсутність forwarding
   та секрету в записаних даних. Відправлений раніше payload відкликати неможливо.
2. **Низький пріоритет: config.nodeEnv не задавав environment Express factory.**
   При програмному створенні app Express покладався на process.env, навіть якщо передано production config.
   Додано явний app.set('env', config.nodeEnv) і тест. Звичайний CLI запуск і раніше читав NODE_ENV.
3. **Прогалини перевірок.** Додано SIGINT, реальний HTTP до production child process, EADDRINUSE,
   drain активного запиту, timeout завислого запиту. stdout дочірнього процесу тепер читається до завершення,
   без передчасного закриття pipe старим async iterator.
4. **Документація.** README більше не прив'язаний до домашнього каталогу автора; уточнено поведінку
   пізніх помилок, склад тестів і актуальні результати.

Поведінку Express звірено з установленим кодом та
[офіційною документацією error handling](https://expressjs.com/en/guide/error-handling/).

## Реально виконані перевірки

Середовище: macOS, Node.js v24.13.0, npm 11.6.2. Залежності вже встановлено; перевстановлення не потрібне.
.env відсутній; default config та .env.example валідні за форматом. Тести задають потрібні env явно.
Для HTTP listener використано дозволений запуск поза sandbox; постійний сервер після тестів не залишено.

| Перевірка | Результат |
| --- | --- |
| npm test до змін | 8/8 pass |
| npm test після змін | 13/13 pass, 0 fail, 0 skipped |
| GET /api/health реальним fetch через TCP | 200; JSON status/uptime/timestamp, request ID, no-store, security headers |
| Невідомі маршрути / unsupported method | 404, стандартний JSON envelope |
| Некоректний JSON / завелике тіло / невідомий charset | 400 / 413 / 415 |
| Очікуваний AppError / async exception | 409 / 500; без stack та тестового секрету у відповіді |
| CORS allowed / denied / preflight | Дозволений origin / 403 без allow-origin / 204 |
| Production child + SIGINT; окремо SIGTERM | Health 200, exit code 0, stderr порожній |
| Повторний stop, активний запит, завислий запит | Коректне завершення; дедлайн закриває stalled connection |
| Зайнятий порт | EADDRINUSE коректно відхиляє startup |
| Конфігурація та application environment | Невалідні значення відхиляються; production config застосовується |
| npm audit --json | 0 відомих вразливостей на момент перевірки |
| node --check для src/test | Без синтаксичних помилок |
| Граф локальних імпортів | Циклів немає |
| Сканування секретів | Типових ключів/токенів/private keys у власних текстових файлах не знайдено |
| Незмінність PDF/PNG | Усі 5 SHA-256 збігаються |

Сканування за шаблонами та npm audit не доводять абсолютну відсутність секретів або вразливостей.
Git history перевірити неможливо, бо репозиторію немає. Coverage-команду в цьому review не запускали;
відсоток покриття не заявляється.

## Безпека та обмеження

Helmet активний, X-Powered-By вимкнено, CORS — точні origins без wildcard і credentials.
Запити без Origin дозволено свідомо: CORS не замінює auth. JSON limit — 100 КБ.
Конфігурація валідується до listen; .env виключено .gitignore. Відповіді 500 не містять original error.
HTTP logs не пишуть URLs, headers чи bodies. HOST default — loopback; trust proxy не ввімкнено.
HTTP timeouts: request 30 с, headers 15 с, keep-alive 5 с; shutdown deadline default 10 с.

Auth/RBAC, БД, audit storage, jobs, Gateway та бізнес-модулі навмисно відсутні.
Health — тільки liveness. Перед production потрібні актуальний patch Node.js 24,
TLS/deployment, limits і observability; installed runtime у цьому review не оновлювався.
Автоматизований pipeline CI та повноцінний security/load audit ще не належать реалізованому Core.

## Git і перелік змін цього review

git status --short і git diff --stat виконано: обидва недоступні, оскільки немає Git repository.
Git не ініціалізувався, push/PR/remote операції не виконувались.

Змінено: src/app.js, src/http/errors.js, test/core.test.js, README.md,
docs/architecture.md, docs/next-steps.md. Додано: docs/code-review.md.
package.json, lockfile та вихідні PDF/PNG не змінено цим review.

## Наступний спринт

1. Погодити командний репозиторій і CI, framework/TypeScript, БД та auth/RBAC contracts.
2. Описати модель банків, людей, зайнятості, контактів і напрямів; визначити reliable IDs та правила злиття.
3. Підключити сховище/міграції та справжню auth із захищеним bootstrap адміністратора.
4. Реалізувати Banks and People з ресурсними правами, аудитом і тестами конкурентних дублів/зміни роботи.
5. Далі — відносини, задачі та історія; Gateway/jobs і кампанії після перевірки провайдерів.

## Коментар для Trello

Виконано технічну перевірку Backend Core Fintech Consulting Engine на Node.js/Express/ES Modules.
Перевірено структуру, відповідність PDF і чотирьом схемам, конфігурацію, безпеку та залежності.
Виправлено можливий витік тексту пізньої помилки в stderr та застосування environment в app factory.
Розширено перевірки: 13/13 тестів пройшли, включно з реальним HTTP, CORS, помилками,
SIGINT/SIGTERM і graceful shutdown; npm audit — 0 відомих вразливостей.
Документацію актуалізовано, архітектурні оригінали збережено без змін.
Core готовий до Code Review в межах першої задачі. Auth, БД і CRM-модулі — наступний спринт.
Для передачі через Git потрібно підключити проєкт до командного репозиторію: зараз .git відсутній.
