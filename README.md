# मैथिली समाचार — Complete Cloudflare Pages + D1 Portal

यह project Cloudflare Pages + Pages Functions + D1 के लिये बनाया गया है। कोई Node build step आवश्यक नहीं है।

## Features
- Reader registration/login/logout/profile
- Admin / Editor / Author / Reader roles
- News draft/review/published/archived workflow
- Category → Sub-category menu
- Desktop dropdown + mobile accordion menu
- Comments + replies schema + moderation
- Likes + bookmarks
- Subscription plans and pending subscription orders
- Notifications and audit-log tables

## 1. D1
Create a new D1 database and bind it to Pages with variable name `DB`.
Run the included `schema.sql` once:

```bash
npx wrangler d1 execute YOUR_DATABASE_NAME --remote --file=./schema.sql
```

If you already ran an older schema on the new empty database, do not run a second conflicting schema. Use a fresh D1 for this final package.

## 2. First Admin
In Cloudflare Pages → Settings → Environment variables/Secrets, add:

`SETUP_KEY = a long random secret`

Then, after deployment, send a POST request to `/api/setup` with header `X-Setup-Key` and JSON:

```json
{"name":"Site Admin","email":"admin@example.com","password":"ChangeMe123!"}
```

Example with curl:

```bash
curl -X POST https://YOUR-SITE.pages.dev/api/setup \
  -H "Content-Type: application/json" \
  -H "X-Setup-Key: YOUR_SETUP_KEY" \
  -d '{"name":"Site Admin","email":"admin@example.com","password":"ChangeMe123!"}'
```

Then login at `/login.html`.

## 3. Cloudflare Pages
- Production branch: `main`
- Build command: leave empty
- Functions directory: `/functions` is detected automatically
- D1 binding: `DB`

## 4. Subscription
The database/order workflow is real and records pending subscriptions. Actual money collection requires a payment provider and webhook (for example Razorpay). This package does not fake successful payments.

## First Admin setup

After deploying and binding D1 as `DB`, open:

`/setup.html`

Enter the first Admin name, email and password. The endpoint is available only while the `users` table is empty. After the first Admin is created, setup is automatically closed. If `SETUP_KEY` is configured in Cloudflare, it is still required as an additional safeguard.

Then log in at `/login.html`.
