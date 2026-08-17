# मैथिली समाचार — Clean Cloudflare Pages + D1

## 1. D1
Create a D1 database and run `schema.sql` once:

```bash
npx wrangler d1 execute YOUR_DB_NAME --remote --file=./schema.sql
```

Then bind it in Cloudflare Pages as `DB`.

## 2. Secret
Add a Pages secret named `SETUP_KEY`.

## 3. First admin
After deployment, POST JSON to `/api/setup` with header `X-Setup-Key: YOUR_SETUP_KEY`:

```json
{"name":"Admin","email":"admin@example.com","password":"ChangeMe123!"}
```

After creating the admin, use `/login.html`.

## 4. Roles
- admin: full access
- editor: all editorial/news/category/user work except admin-only infrastructure
- author: create/edit own news; publish becomes `review`
- reader: website account and subscription

## 5. Subscription
The included subscription system creates a pending subscription/order. It does not pretend that payment was completed. For real online payment, add a payment provider (e.g. Razorpay/Stripe) and its secrets/webhook before marking subscriptions active.
