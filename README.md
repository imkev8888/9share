# 9share

Instagram **comment-to-DM** automation, à la ManyChat / SleekFlow.

When someone comments on your post, reel or video, 9share automatically slides
into their DMs with a preset message — a **different campaign per post**. Users
connect their Instagram in one click; no tokens or developer setup required.

- **Frontend + API:** Next.js 15 (App Router), Tailwind CSS v3 — deploy on **Vercel**
- **Database + Auth:** **Supabase** (Postgres + Auth)
- **Instagram:** official *Instagram API with Instagram Login* + signed webhooks

---

## How it works

```
Someone comments on your post
        │
        ▼
Instagram fires a "comments" webhook  ──►  POST /api/instagram/webhook
        │                                          │
        │                              verify HMAC signature
        │                                          │
        │                       find automation for that media id
        │                                          │
        │                      (optional) keyword match check
        │                                          │
        ▼                                          ▼
  log skipped/failed   ◄────────  sendPrivateReply() DMs the commenter
        │                                          │
        └──────────────────►  log "sent" + bump sent_count
```

The DM uses Instagram's **Private Reply** mechanism (`recipient.comment_id`),
which lets a business reply privately to anyone who comments — once per comment.

---

## 1. Prerequisites

- An **Instagram Business or Creator** account (personal accounts can't use the API).
- That IG account linked from the app you'll create (or already created — see screenshot).
- Node 18.18+ locally (works on your Node 19). Vercel uses Node 20+ automatically.

---

## 2. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → paste the contents of [`supabase/schema.sql`](./supabase/schema.sql) → **Run**.
   This creates `instagram_accounts`, `automations`, `automation_logs`, RLS policies and triggers.
3. **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only — keep secret)
4. **Authentication → Providers:** Email is on by default. For "Continue with
   Google", enable the Google provider and add your redirect URL. For fastest
   testing, **Authentication → Sign In / Up → turn off "Confirm email"** so new
   signups log in immediately.

---

## 3. Meta / Instagram app setup

You already have an app (`9sharehk_test_api`). In the
[Meta App Dashboard](https://developers.facebook.com/apps/) open your app →
**Instagram → API setup with Instagram login**.

### 3a. App credentials
Copy the **Instagram app ID** and **Instagram app secret** into your env vars
(`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`).

### 3b. OAuth redirect URI
Under **3. Set up Instagram business login → Business login settings**, add to
**OAuth redirect URIs**:

```
https://YOUR-DOMAIN/api/instagram/callback        # production (Vercel)
https://localhost:3000/api/instagram/callback      # only if testing locally w/ https
```

> Instagram requires **https** for redirect URIs. For local testing use a
> tunnel (e.g. `ngrok http 3000`) and add that https URL, or just test OAuth on
> the deployed Vercel URL.

### 3c. Webhooks
Under **2. Configure webhooks**:

- **Callback URL:** `https://YOUR-DOMAIN/api/instagram/webhook`
- **Verify token:** the exact value of your `INSTAGRAM_VERIFY_TOKEN` env var
  (e.g. `9share_super_secret_verify_token`).
- Click **Verify and save** (your app must be reachable — deploy to Vercel first,
  or use ngrok). 9share's `GET /api/instagram/webhook` answers the handshake.
- **Subscribe** to the **`comments`** field.

> App Mode must be **Live** to receive webhooks (toggle at the top of the dashboard).
> While in Development, add testers under **App roles → Roles**.

### 3d. Permissions
The connect flow requests: `instagram_business_basic`,
`instagram_business_manage_messages`, `instagram_business_manage_comments`.
For production beyond testers, submit these for **App Review**.

---

## 4. Environment variables

Copy `.env.example` → `.env.local` (already created for you with the test app
credentials) and fill in the Supabase values:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally; your Vercel URL in prod |
| `INSTAGRAM_APP_ID` | Meta dashboard → Instagram app ID |
| `INSTAGRAM_APP_SECRET` | Meta dashboard → Instagram app secret |
| `INSTAGRAM_VERIFY_TOKEN` | Any random string; must match the webhook Verify token |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (secret!) |

---

## 5. Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

Sign up → you land on the dashboard. (OAuth "Connect Instagram" needs an https
redirect, so for the full flow either use ngrok or test on Vercel.)

---

## 6. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. [vercel.com](https://vercel.com) → **New Project** → import the repo.
3. **Environment Variables:** add all seven from the table above. Set
   `NEXT_PUBLIC_APP_URL` to your Vercel domain (e.g. `https://9share.vercel.app`).
4. Deploy.
5. Go back to the Meta dashboard and make sure the **redirect URI** and
   **webhook callback URL** point at the deployed domain, then **Verify and save**
   the webhook and subscribe to `comments`.

---

## 7. Try it end-to-end

1. Log in → **Connect Instagram** → approve on Instagram (one click).
2. **Automations → New automation** → pick a post → write a DM
   (use `{{username}}` to mention the commenter) → optionally set a keyword like
   `PRICE` → **Activate**.
3. From another IG account, comment on that post.
4. Within seconds the commenter gets your DM. It appears under **Activity**.

---

## Project structure

```
app/
  page.tsx                         Landing page (glassmorphism)
  login/page.tsx                   Auth (email + Google via Supabase)
  dashboard/
    layout.tsx                     Sidebar shell
    page.tsx                       Overview: connect, stats, recent activity
    automations/page.tsx           List automations (toggle / delete)
    automations/new/page.tsx       Post picker + builder
    logs/page.tsx                  Full activity log
    actions.ts                     Server Actions (CRUD, connect, signout)
  api/instagram/
    connect/route.ts               Start OAuth
    callback/route.ts              OAuth callback → store token → subscribe
    webhook/route.ts               Verify handshake + comment → DM handler
lib/
  instagram.ts                     Instagram API helpers
  supabase/{client,server,admin}.ts
components/                        UI components (SVG icons, builder, etc.)
supabase/schema.sql                Database schema + RLS
middleware.ts                      Supabase session + dashboard guard
```

## Security notes

- Webhook POSTs are verified with the `X-Hub-Signature-256` HMAC (app secret).
- Long-lived IG tokens are stored server-side; the service-role key never reaches the browser.
- Supabase **Row Level Security** ensures users only see their own data.
- Idempotency: a unique index on `(comment_id) where status='sent'` prevents
  double-DMing on webhook retries.

> Not affiliated with Instagram or Meta. Use within the
> [Instagram Platform Policy](https://developers.facebook.com/docs/instagram-platform/policy).
