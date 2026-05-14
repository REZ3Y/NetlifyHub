# NetlifyHub

NetlifyHub یک پنل تحت وب **Production-Grade** برای مدیریت تعداد زیادی اکانت Netlify از طریق **API رسمی Netlify** است. این مخزن یک **Monorepo مبتنی بر pnpm** شامل API با **Fastify**، رابط کاربری **Vue 3 + Vite**، **Worker مبتنی بر BullMQ**، **PostgreSQL** و **Redis** است.

[English / انگلیسی](README.md)

## امکانات (فاز اول)

- ساختار Monorepo استاندارد (`apps/*`, `packages/*`)
- نشست سمت سرور: شناسه تصادفی در کوکی **HTTP-only** و نگهداری **هش SHA-256** در PostgreSQL (بدون JWT در مرورگر)
- ساخت ادمین اولیه با اسکریپت تعاملی یا متغیرهای اختیاری محیطی در Docker
- رابط Naive UI، تم تیره / روشن / سیستم، چندزبانه فارسی و انگلیسی
- صفحات ورود، داشبورد اولیه، پروفایل (تغییر نام کاربری و رمز)
- Prisma + PostgreSQL، Redis و اسکلت Worker، Docker Compose
- امنیت پایه: Helmet، CORS محدود، Rate Limit سراسری و محدودتر برای ورود، هش رمز با bcrypt، لاگ ساخت‌یافته (pino)، اعتبارسنجی Zod

## معماری

| پکیج                 | نقش                              |
| -------------------- | -------------------------------- |
| `@netlifyhub/api`    | API اصلی، احراز هویت، سلامت      |
| `@netlifyhub/web`    | داشبورد SPA                      |
| `@netlifyhub/worker` | مصرف‌کننده BullMQ (فعلاً جایگاه) |
| `@netlifyhub/shared` | ثابت‌های مشترک                   |

## محدودیت نرخ Netlify

طبق [مستندات Netlify](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/#rate-limiting)، برای بیشتر درخواست‌ها حدود **۵۰۰ درخواست در دقیقه** وجود دارد و برخی عملیات (مثل Deploy) محدودتر هستند. فازهای بعدی صف، کش و backoff تطبیقی را اضافه می‌کنند؛ مقدار مرجع `500` در پکیج `shared` نیز ثبت شده است.

## پیش‌نیازها

- Node.js 22+
- pnpm 9
- PostgreSQL 16 و Redis 7 (محلی یا Docker)

## نصب پیشنهادی (یک خط)

مخزن: [https://github.com/REZ3Y/NetlifyHub](https://github.com/REZ3Y/NetlifyHub)

```bash
bash <(curl -fLs https://raw.githubusercontent.com/REZ3Y/NetlifyHub/main/install.sh)
```

در URL فقط اگر شاخهٔ پیش‌فرض GitHub شما **`main`** است از `main` استفاده کنید؛ اگر پیش‌فرض **`master`** است، همان را جایگزین کنید. فایل **`install.sh` باید در ریشهٔ مخزن روی GitHub باشد** (در صورت 404، نسخهٔ محلی را push کنید).

این دستور [https://github.com/REZ3Y/NetlifyHub.git](https://github.com/REZ3Y/NetlifyHub.git) را کلون می‌کند، وابستگی‌ها را نصب می‌کند، مایگریشن را اجرا می‌کند (PostgreSQL باید با `DATABASE_URL` در `apps/api/.env` هماهنگ باشد) و سپس ساخت ادمین اولیه را به‌صورت تعاملی اجرا می‌کند.

اگر خطای `404:: command not found` دیدید، به‌دلیل نبودن **`curl -f`** بوده: بدون آن، بدنهٔ خطای GitHub به bash داده می‌شود و اجرای آن معنی ندارد.

برای نصب از Fork یا آینهٔ دیگر، قبل از دستور متغیر `NETLIFYHUB_REPO_URL` را تنظیم کنید (مثلاً `https://github.com/your-user/NetlifyHub.git`).

اگر قبلاً مخزن را کلون کرده‌اید، از ریشهٔ پروژه `bash install.sh` یا `bash scripts/install.sh` را اجرا کنید.

## نصب دستی

```bash
git clone https://github.com/REZ3Y/NetlifyHub.git netlifyhub && cd netlifyhub
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
# فایل apps/api/.env را ویرایش کنید: DATABASE_URL، REDIS_URL، WEB_ORIGIN و در صورت نیاز SESSION_TTL_DAYS

pnpm --filter @netlifyhub/api exec prisma migrate deploy
pnpm --filter @netlifyhub/api run create-admin
pnpm dev
```

- API: `http://localhost:3000`
- وب: `http://localhost:5173`

## نصب Docker

1. فایل `.env.docker.example` را در ریشه مخزن به `.env` کپی کنید (در صورت نیاز `WEB_ORIGIN` را تنظیم کنید).
2. `docker compose up -d --build`
3. برای ایجاد ادمین در اولین بالا آمدن، در `.env` مقداردهی کنید: `SEED_ADMIN_USERNAME` و `SEED_ADMIN_PASSWORD` (فقط وقتی هنوز کاربری در دیتابیس نیست).

رابط وب روی پورت **۸۰۸۰** و API روی **۳۰۰۰** در دسترس است.

## متغیرهای محیطی

جزئیات در `apps/api/.env.example` و فایل‌های مشابه worker و web.

- **`SESSION_TTL_DAYS`**: مدت اعتبار نشست و کوکی به روز (پیش‌فرض ۷).
- **`WEB_ORIGIN`**: مبدأ دقیق مرورگر که CORS اجازه می‌دهد.

## اسکریپت‌های توسعه

| دستور        | توضیح                        |
| ------------ | ---------------------------- |
| `pnpm dev`   | اجرای همزمان API، وب، Worker |
| `pnpm build` | بیلد همه پکیج‌ها             |
| `pnpm lint`  | ESLint                       |

## امنیت

- رمزها با bcrypt هش می‌شوند.
- شناسه نشست تصادفی است و فقط **هش** آن در دیتابیس ذخیره می‌شود؛ مرورگر فقط مقدار خام را در کوکی HTTP-only نگه می‌دارد.
- توکن‌های Netlify در فازهای بعدی با `TOKEN_ENCRYPTION_KEY` رمزنگاری در حالت سکون ذخیره خواهند شد.

## نقشه راه

1. فاز اول (فعلی): زیرساخت، احراز هویت، UI پایه، Docker.
2. فاز دوم: کلاینت Netlify، ذخیره امن توکن، آماده‌سازی Proxy.
3. فاز سوم: صف همگام‌سازی، کش، محدودیت نرخ تطبیقی.
4. فاز چهارم: عملیات Deploy/حذف/مانیتورینگ، RBAC، لاگ ممیزی.

## مجوز

MIT — فایل [LICENSE](LICENSE).

## مشارکت

[CONTRIBUTING.md](CONTRIBUTING.md)
