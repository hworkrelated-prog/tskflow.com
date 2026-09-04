# TskFlow Mobile App Plan

## Recommendation: do not spend $100 on Emergent conversion yet

The $100 is a one-time credit charge. The real cost of Emergent's convert is a **second frontend you must keep building forever**. TskFlow is a large SaaS (recordings, Stripe, Google OAuth, admin, analytics). A generated React Native app will not replace that, and every later web feature has to be built twice.

**Best option now: installable mobile web (PWA).**  
The site already has a standalone manifest, icons, service worker, Web Push, and phone layout work. Teammates can Add to Home Screen and use the same account, tasks, and backend. Cost: $0. One codebase.

**Best option if you need App Store / Play Store listing:** wrap this same React app with **Capacitor** (or equivalent). Store fees still apply ($99/year Apple, $25 Google). You do **not** pay Emergent $100, and a `frontend/` change is still the app.

**Pay Emergent $100 only if** you want a *smaller* native app on purpose — accept / complete / nudge on a phone — and you accept maintaining two UIs. In that case use the Phase 1 prompt below. Do not convert "the whole product."

| Option | Upfront | Ongoing | Store listing | Verdict for TskFlow |
| --- | --- | --- | --- | --- |
| PWA / Add to Home Screen | $0 | One web frontend | No | **Do this first** |
| Capacitor around current React | $0 + store fees | One frontend | Yes | **Best if you need store icons** |
| Emergent web → mobile | ~$100 credits + store fees | Two frontends | Yes | Only for a scoped native MVP |
| New Expo app in this repo | Engineering time | Two frontends | Yes | Same dual-UI cost, no $100 fee |

Do not start a second Emergent project.

---

## If you later choose Emergent conversion

The web app at [tskflow.com](https://tskflow.com) stays live. Conversion forks a new Expo / React Native frontend that talks to the **same FastAPI backend, MongoDB, and login**. Accounts and tasks stay one dataset. Frontend screens do not stay in sync — a web UI change does not appear on mobile until you build it again.

Treat conversion as **one-way for this product**. Official Emergent docs allow web ↔ mobile, but TskFlow should not rely on undoing the fork. Decide the MVP scope before you click Convert.

## What does not change

| Item | Who pays / what happens |
| --- | --- |
| Emergent subscription | Same monthly plan |
| Credits | Mobile preview/store builds take 10–20 minutes (web is seconds), so credit use goes up |
| Apple Developer Program | You — **$99/year**, billed by Apple to Unbiassly, Inc. |
| Google Play Developer | You — **$25 one-time**, billed by Google |
| Backend edits (Emergent agent, VS Code, or GitHub) | Apply to **both** web and mobile |
| React web frontend | Independent. Keep shipping web as usual |
| React Native frontend | Independent. Must be implemented or regenerated separately |

Register the store accounts **before** conversion. Apple enrollment can take days.

Recommended identifiers:

- App name: **TskFlow**
- Legal entity: **Unbiassly, Inc.**
- Bundle / application ID: `com.unbiassly.tskflow`
- Privacy / terms URLs (already live): `https://tskflow.com/privacy`, `https://tskflow.com/terms`, `https://tskflow.com/legal`

---

## Why we do not convert the whole product at once

TskFlow is an accountability platform with a large desktop surface. Several features cannot ship as native phone features, or should stay on the website:

| Feature | Why it stays web-first |
| --- | --- |
| Screen recording / Loom editor / PiP controls | `getDisplayMedia` is desktop-only. Phones cannot capture another app's screen the same way |
| Stripe checkout / customer portal | Keep billing on the website. Deep-link Settings → Upgrade to `https://tskflow.com/settings` |
| Admin + Leads (Apollo) | Internal tools, not an end-user mobile surface |
| Marketing landing page | Website only. The app opens on Login, then Task Hub |
| Google Calendar / Sheets OAuth | Browser redirect. Open the web Settings page or an in-app browser |
| Activity CSV export | Spreadsheet workflow. Link out if needed |
| Rich-text / transcript import | Usable later; not required to accept and close tasks on a phone |

The first mobile app should do one job well: **see what I own, accept it, close it, and get nudged**.

---

## Phase 0 — Do this before Convert

1. Enroll **Apple Developer** as Unbiassly, Inc. ($99/year). Create the App ID `com.unbiassly.tskflow` later in App Store Connect.
2. Enroll **Google Play Console** ($25). Identity verification can take a few days.
3. Confirm Emergent credit headroom. Budget several long mobile builds, not one.
4. Freeze large web feature work for a day so the fork is not mid-rewrite.
5. Update Privacy Policy and Terms so they cover the iOS/Android apps, device push tokens, camera/mic, and photo library (see checklist below). Store review will reject a web-only policy.
6. Paste the conversion prompt in the next section. Do not ask Emergent to "convert everything."

Privacy copy to add before store submission (web pages at `/privacy` and `/terms`):

- The Service includes the TskFlow websites **and** the TskFlow iOS and Android apps.
- We collect device push tokens to deliver task and mention notifications.
- Camera, microphone, and photo library are used only when the user attaches proof to a task.
- Screen recording remains a web/desktop feature.

---

## Phase 1 — Convert, then ship the accountability MVP

### Conversion prompt (paste into Emergent)

```
Convert this existing TskFlow web project to a mobile app (Expo / React Native).
Keep the current FastAPI + Mongo backend, database, and JWT login shared.
Do not create a new backend. Do not wrap the website in a WebView.

The mobile app is for team members who need to accept, do, and close work on a phone.
It is NOT a clone of every web page.

Build only these screens, talking to the existing /api endpoints:

1. Auth: login, register, verify-email, forgot/reset password.
   Store the JWT in secure storage (not localStorage).
2. Task Hub: Assigned to Me / My Focus / Delegated as three tabs (not a 3-column desktop grid).
   Search, filters, parent-task groups, accept / decline / complete from the card when possible.
3. Task Detail: status actions (accept, decline, counter-propose, complete, block),
   comments/@mentions, attachments (camera + photo library + files — NOT screen recording),
   activity, review accept/send-back.
4. Create Task: the AI quick-create / Jarvis bar as the primary create path.
   Voice input via the device speech APIs. Typed fallback.
5. Notifications: in-app bell + catch-up review. Register for native push (APNs/FCM).
6. Settings: name, password, EOD report, smart reminder prefs.
   Upgrade / billing and Google Calendar / Sheets: button that opens the website.
7. Team: claims inbox + my manager / reports (read + respond). No full org chart editor.

Do NOT port in v1:
- Landing / pricing / admin / leads
- Screen recorder, recording editor, recording library capture
- Stripe checkout
- Analytics, leaderboards, activity CSV
- Transcript import, recurring-series editor
- Google OAuth connect flows (link out to web)

Navigation: bottom tabs — Home, Inbox (catch-up + notifications), Create, Team, Settings.
Deep links: https://tskflow.com/invite?token=… and https://tskflow.com/task/:id must open the app when installed.
Invite emails already use /invite?token= — keep those URLs working on web AND mobile.

Design: keep TskFlow teal/slate, Outfit + Inter, calm productivity. Thumb-reachable primary actions.
Safe-area insets. One-handed Task Hub.

After the fork, list every existing /api route the mobile client calls so we can verify auth headers.
```

### What "done" means for v1

A teammate can:

1. Sign in with an existing tskflow.com account.
2. See tasks assigned to them.
3. Accept / decline / complete with an optional note and a photo.
4. Create a task with Jarvis (type or voice).
5. Get a native push when someone assigns them work or @mentions them.
6. Open an invite email on their phone and land on that task in the app.

Web users keep the full desktop product, including recordings and billing.

---

## Phase 2 — Power features (after v1 is on TestFlight / internal testing)

Add only after the MVP is stable on real phones:

- Recurring series list + skip / stop (full editor can stay web).
- Analytics + team leaderboard (the web already has a mobile-readable layout to copy).
- Transcript import (paste / open a Docs URL; no desktop picker required).
- **Play** existing recordings in-app. Do not capture screen recordings on the phone.
- Groups / parent-task management polish.
- Offline draft queue (web already has `draftStore` — port the idea to AsyncStorage).

---

## Phase 3 — Store listing and review

### Shared listing

- Name: TskFlow
- Subtitle: Own it. Close it.
- Category: Productivity
- Privacy policy: `https://tskflow.com/privacy`
- Support: `https://tskflow.com/contact` and hashim@tskflow.com
- Age rating: 4+ / Everyone (business productivity, no UGC social network)

### Screenshots to capture from the Expo preview

1. Task Hub — Assigned to Me
2. Task Detail — accept / complete
3. Jarvis create
4. Catch-up / notifications
5. Settings

### Review notes (paste into App Store Connect)

> TskFlow is a workplace accountability app. Sign in with a company email. Demo: owner@acmecorp.com / Password123 (or a dedicated reviewer account). Billing, screen recording, and admin tools stay on the website; the app is for accepting and completing assigned work. Push notifications are used only for task assignments, mentions, and reminders the user already configured.

Apple often rejects "login-only" apps. The reviewer account must already have tasks, a mention, and something to complete.

### Expected review time

- Apple: about 1–3 days after submit
- Google: about 1–7 days, plus Data safety form

---

## Backend work the shared API still needs

These are the only server changes required for a real store app. They belong in this repo (VS Code / GitHub). They automatically apply to web and mobile.

### 1. Native push beside today's Web Push

Today `send_web_push` uses VAPID + `pywebpush` (`POST /api/push/subscribe`). That does **not** reach a React Native app.

Add:

- `POST /api/push/device` — register `{ platform: "ios"|"android", token, device_id }`
- `DELETE /api/push/device`
- Fan-out from the existing `send_web_push` call sites (new task, mention, blocked, catch-up) to APNs and FCM as well

Web subscriptions stay as they are.

### 2. Universal Links / App Links

Invite mail already points at `{APP_URL}/invite?token=…`.

Add hosted files so the OS opens the app:

- `https://tskflow.com/.well-known/apple-app-site-association`
- `https://tskflow.com/.well-known/assetlinks.json`

Keep the web `/invite` route as the fallback when the app is not installed.

### 3. Auth header contract

Mobile must send `Authorization: Bearer <jwt>` on every `/api` call, same as web. Token lives in Expo SecureStore, not `localStorage`.

Google Calendar / Sheets remain website OAuth redirects. Do not rebuild them in v1.

### 4. Attachments

Reuse `POST /api/uploads/direct` and `POST /api/uploads/start`. Phone uploads are photos and files, not `getDisplayMedia` blobs.

---

## How you will work after the fork

```
                 ┌──────────── web React (tskflow.com)
                 │
FastAPI + Mongo ─┤   same JWT, same tasks
                 │
                 └──────────── Expo / React Native (App Store + Play)
```

- **Backend / data / email / Stripe webhooks:** change once. Test both clients if the response shape changes.
- **Web UI:** keep editing `frontend/` here.
- **Mobile UI:** edit the Emergent mobile tree (or the Expo app it generates). It will not pick up `TaskHub.js` changes automatically.
- **Rule of thumb:** if the change is an API or a Mongo field, do it in this repo first. Then tell the mobile agent "call the existing endpoint."
- **OTA (EAS Update):** JS/UI fixes can ship without a store review. New native permissions (camera, push) need a new binary.

Do not let the mobile agent invent parallel task or auth tables.

---

## Suggested sequence (checklist)

**This week (no Convert click yet)**

- [ ] Apple Developer enrollment started
- [ ] Google Play enrollment started
- [ ] Privacy / Terms mention the mobile apps
- [ ] Reviewer + demo accounts have live tasks
- [ ] Conversion prompt reviewed

**Conversion week**

- [ ] Run Emergent web → mobile with the Phase 1 prompt
- [ ] Preview on a real iPhone and a real Android (Expo Go, then a dev build once push/camera are in)
- [ ] Verify login with `owner@acmecorp.com` and a Teams member
- [ ] Verify accept / complete / comment / Jarvis create
- [ ] Confirm web Task Hub and recordings still work (shared backend, untouched web frontend)

**Before TestFlight / internal testing**

- [ ] Native device-token push on the shared backend
- [ ] Universal Links + Android App Links live on tskflow.com
- [ ] Invite email opens the app when installed
- [ ] Billing and Google connect only open the website

**Store submit**

- [ ] Production iOS + Android binaries (Emergent / EAS; 15–40 min each)
- [ ] Screenshots, privacy nutrition labels, Data safety form
- [ ] Submit iOS first (stricter review), then Play

---

## Cost snapshot

| Cost | Amount | When |
| --- | --- | --- |
| Emergent plan | unchanged | monthly |
| Extra Emergent credits | higher per mobile build | every preview / store build |
| Apple Developer | $99 / year | before iOS submit |
| Google Play | $25 once | before Play submit |
| Expo EAS | free tier is often enough to start (limited builds) | if you build outside Emergent |

There is no second TskFlow subscription for "having a mobile app." Users who already have an account on the website are the same users in the app.
