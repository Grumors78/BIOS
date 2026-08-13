# Departmental Assignment Register — Flutterwave-Gated Edition

A live server that requires students to pay ₦500 via Flutterwave before
they can view assignment images for their department. Each department is
paid for and unlocked separately — paying for Pharmacy does not unlock
Medicine.

## How access works

1. Student clicks a department on the landing page.
2. If they haven't paid yet, they see a paywall asking for their email.
3. They're sent to Flutterwave to pay ₦500 (amount is configurable).
4. After payment, the server verifies the transaction directly with
   Flutterwave's API (the browser is never trusted on its own) and sets
   a signed cookie scoped to that one department.
5. That cookie lasts 1 year, so the student won't need to pay again
   **on that same browser/device**. If they switch devices or clear
   cookies, they can use **"Already paid? Recover access"** on the
   paywall page — they enter the email they paid with, get a 6-digit
   code by email, and entering it grants access again without paying
   twice. This only works for the exact email address used at checkout.
6. Images are served from a private folder that is never publicly
   reachable — the server checks the cookie on every single image
   request, not just on the page load.

## One-time setup

### 1. Install dependencies

```
npm install
```

### 2. Get your Flutterwave keys

In your Flutterwave dashboard: **Settings → API Keys**. You'll see a
Secret Key (`FLWSECK_...`) and Public Key (`FLWPUBK_...`). Use the
**test** keys first to make sure everything works, then switch to
**live** keys when you're ready to accept real payments.

**Never share your secret key with anyone, paste it into a chat, or
commit it to a public GitHub repo.** Only the public key is safe to
expose.

### 3. Set environment variables

Copy `.env.example` to `.env` for local testing:

```
cp .env.example .env
```

Then edit `.env` and fill in:
- `FLW_SECRET_KEY` — your Flutterwave secret key
- `FLW_PUBLIC_KEY` — your Flutterwave public key
- `JWT_SECRET` — any long random string. Generate one with:
  ```
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `FEE_NGN` — the fee in whole Naira. Flutterwave does **not** use kobo
  (unlike Paystack), so `500` means ₦500 directly.
- `ADMIN_USERNAME` and `ADMIN_PASSWORD` — your login for the admin page
  at `/admin`. Choose a real username and a strong password — anyone
  with these can view, upload, and delete images for every department.
- `BREVO_API_KEY` — from app.brevo.com, used to send recovery-code
  emails (see next section).
- `BREVO_FROM` — the email address recovery emails are sent from. Must
  be verified as a sender in your Brevo account first.
- `MONGODB_URI` — your MongoDB Atlas connection string (see step 5).
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  — your Cloudinary credentials (see step 6).

### 4. Get a Brevo API key (for access recovery emails)

You don't need to own a domain for this. Go to app.brevo.com, sign up
for a free account, and under **Settings → SMTP & API → API Keys**,
generate a new API key. Paste it into `.env` as `BREVO_API_KEY`.

Then verify a sender address: **Settings → Senders, Domains & Dedicated
IPs → Senders → Add a sender**. Your own email address works fine here
— Brevo will send a confirmation link to that inbox to verify it. Once
verified, set that same address as `BREVO_FROM` in `.env`.

Unlike some providers, Brevo requires this sender-verification step
before it will send any email — there's no shared "no setup needed"
sending address, so this step isn't optional.

### 5. Set up MongoDB Atlas (for payment records & access recovery)

Payment records and recovery codes are stored in MongoDB Atlas's free
tier (M0) — genuinely free forever, not a trial, and more than enough
for a small school's traffic.

1. Go to mongodb.com/cloud/atlas, sign up for a free account
2. Create a free **M0** cluster (choose any nearby region)
3. Under **Database Access**, create a database user with a username
   and password — save these, you'll need them in the connection string
4. Under **Network Access**, add `0.0.0.0/0` (allow access from
   anywhere) — this is necessary since Render's servers don't have a
   fixed IP address on the free tier
5. Once the cluster is ready, click **Connect → Drivers**, copy the
   connection string (looks like
   `mongodb+srv://username:<password>@cluster0.xxxxx.mongodb.net/...`)
6. Replace `<password>` with your actual database user's password, and
   paste the full string into `.env` as `MONGODB_URI`

### 6. Set up Cloudinary (for assignment images)

Cloudinary's free tier (25GB storage, 25GB bandwidth/month) hosts the
actual assignment images, since Render's own disk doesn't reliably
survive redeploys on the free tier.

1. Go to cloudinary.com, sign up for a free account
2. Your dashboard homepage shows **Cloud Name**, **API Key**, and
   **API Secret** right at the top
3. Copy each into `.env` as `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
   `CLOUDINARY_API_SECRET`

Note: image URLs Cloudinary generates are technically public to anyone
who has the exact URL (not listed or guessable, but not gated by a
password either). The server still controls who *receives* those URLs
— only students with a valid payment or recovery code ever see them —
but if a URL were somehow shared further, it would still load. This is
a reasonable tradeoff for a free-tier setup; a fully private image
system would require a paid plan or additional complexity.

### 7. Run locally to test

```
npm start
```

Visit `http://localhost:3000`. Use Flutterwave's test card numbers
(listed in their docs) to simulate a payment without spending real money.

## Setting up and testing from Termux (mobile)

If you're building this from your phone:

```bash
pkg install nodejs git unzip nano
termux-setup-storage
cd ~
unzip storage/downloads/school-departments-paid-site.zip
cd school-site-server
npm install
cp .env.example .env
nano .env   # fill in FLW_SECRET_KEY, FLW_PUBLIC_KEY, JWT_SECRET, FEE_NGN
npm start
```

Then open your phone's browser to `http://localhost:3000` — it shares
localhost with Termux, so no extra network setup is needed for local
testing.

## Deploying to Render

1. Push this project to a GitHub repository (the `.gitignore` already
   excludes `node_modules` and your `.env` file — **do not** remove that
   exclusion, or your secret key could leak publicly):
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/your-repo.git
   git branch -M main
   git push -u origin main
   ```
2. On Render: **New → Web Service**, connect your repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Under **Environment**, add the same variables from `.env`:
   `FLW_SECRET_KEY`, `FLW_PUBLIC_KEY`, `JWT_SECRET`, `FEE_NGN`,
   `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `BREVO_API_KEY`, `BREVO_FROM`,
   `MONGODB_URI`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
   `CLOUDINARY_API_SECRET`. Also add `NODE_ENV` set to `production` —
   this makes login cookies (both student and admin) require a secure
   HTTPS connection, which Render provides automatically. Without this,
   cookies still work locally over plain `http://localhost` for testing.
   (`PORT` is injected by Render automatically — you don't need to set it.)
6. Deploy. Render will give you a live URL like
   `https://your-app.onrender.com`.
7. Nothing else needs configuring in Flutterwave — the redirect URL is
   generated automatically from whatever domain the student is on, so it
   works on Render's URL without extra setup.
8. Once you're confident it works with test keys, swap
   `FLW_SECRET_KEY` / `FLW_PUBLIC_KEY` for your **live** keys in
   Render's environment settings and redeploy.

## Why MongoDB and Cloudinary instead of local storage

Render's free tier does not include persistent disk storage — anything
a Node app writes to its own local filesystem is wiped clean on every
redeploy. Render's paid "Disks" feature would solve this, but costs
money.

Instead, this app stores everything that needs to survive a redeploy in
external free-tier services:
- **MongoDB Atlas** (free M0 tier, genuinely free forever) — payment
  records and recovery codes
- **Cloudinary** (free tier) — assignment images

Both are set up in the "One-time setup" steps above. As long as
`MONGODB_URI` and the `CLOUDINARY_...` variables are set correctly in
Render's environment, this data survives redeploys, restarts, and
scaling — with no paid Render features required.

## Access recovery (paid on another device)

On the paywall page, students can tap **"Already paid on another
device? Recover access"**, enter the email they originally paid with,
and receive a 6-digit code by email (valid for 10 minutes). Entering
that code grants access again, scoped to that same department only —
exactly as if they'd paid again, but without a second charge.

This only works if the email matches exactly what was entered at
checkout. If a student pays with one email and later tries to recover
with a different one, it won't match — worth mentioning to students
when they pay.

Payment records and recovery codes are stored in MongoDB Atlas (see the
setup steps above) — a small free-tier database is enough for a small
school's worth of traffic.

## Admin page

Visit `/admin` (e.g. `http://localhost:3000/admin` locally, or
`https://your-app.onrender.com/admin` once deployed) and log in with the
`ADMIN_USERNAME` / `ADMIN_PASSWORD` you set in your environment.

From there you can:
- See how many assignment images are on file, per department
- Upload new images directly from your phone's browser (tap to select
  one or several photos, then Upload) — these go straight to Cloudinary
- View and delete existing images
- View all recorded payments at `/admin/payments` — email, department,
  and timestamp for each, pulled from MongoDB. For the complete
  authoritative transaction history, check your Flutterwave dashboard
  directly.

Admin sessions last 8 hours, then you'll need to log in again.

## Adding assignment images manually (fallback)

The admin page above is the only supported way to add images — since
images live on Cloudinary rather than local disk, there's no local
folder to drop files into anymore. If you ever need to upload directly
through Cloudinary's own dashboard instead (e.g. bulk-uploading many
images at once), images are organized there under folders named
`school-departments/<dept>` — matching each department's slug
(`pharmacy`, `medicine`, `agriculture`, `medlab`, `biochemistry`).

## Project structure

```
server.js                  ← main Express app
routes/payment.js          ← Flutterwave initialize + verify
routes/departments.js      ← paywall / gallery / protected image routes
routes/admin.js            ← admin login, dashboard, upload, delete
routes/recovery.js         ← email-based access recovery for new devices
utils/access-token.js      ← signs & verifies student department access cookies
utils/admin-token.js       ← signs & verifies admin session cookies
utils/store.js             ← MongoDB-backed payment records & recovery codes
utils/mongo.js             ← MongoDB connection helper
utils/cloudinary.js        ← Cloudinary upload/list/delete helpers
utils/email.js             ← sends recovery-code emails via Brevo
views/landing.ejs          ← homepage
views/paywall.ejs          ← shown before payment (includes recovery form)
views/gallery.ejs          ← shown after payment
views/admin-login.ejs      ← admin login form
views/admin-dashboard.ejs  ← admin: all departments overview
views/admin-department.ejs ← admin: upload/delete for one department
views/admin-payments.ejs   ← admin: all recorded payments
public/style.css           ← shared site styling
public/dept-style.css      ← department page + paywall styling
.env.example                ← template for required environment variables
```

## Security notes

- Payment is always verified server-side against Flutterwave's API — the
  browser cannot fake a "paid" state.
- The department is determined from a `tx_ref` format the server itself
  generates and controls, not from client-editable data, and is
  cross-checked against the paid amount.
- Access tokens are signed (JWT) so a student can't hand-edit their
  cookie to unlock a department they didn't pay for.
- The list of image URLs is only returned to requests carrying a valid
  access cookie for that exact department — a student who paid for
  Pharmacy can't fetch Medicine's image list. The image files
  themselves are hosted on Cloudinary at URLs that aren't listed or
  guessable, though technically not password-protected — see the
  Cloudinary setup note above for the tradeoff this involves.
- The admin login uses constant-time comparison for the username and
  password check, so response timing can't be used to guess credentials
  character by character.
- Admin sessions are signed tokens separate from student access tokens,
  so one can never be substituted for the other.
- Recovery codes are single-use, expire after 10 minutes, and the
  request-code endpoint always responds identically whether or not the
  submitted email actually paid — so it can't be used to find out which
  emails are paying customers.
