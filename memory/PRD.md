# Tskflow - Product Requirements Document

## Overview
Tskflow is a B2B task management platform focused on clear commitments, time realism, and ownership through acceptance.

## Core Philosophy
- Clear commitments over task dumping
- Time realism through calendar blocking
- Ownership through acceptance flow
- Company-focused (no personal email usage for Teams)

## Target Users
- Teams within companies using custom email domains
- Managers who need to delegate and track tasks
- Team members who need clear task ownership

---

## Implemented Features (Jan 2026)

### Authentication & Users
- JWT-based authentication
- Email verification flow
- Password reset via email
- Distinct login error messages ("No account found" vs "Incorrect password")
- Company email enforcement for Teams features

### Task Management
- Task creation with title, description, priority, due date
- Task assignment to anyone (by email)
- Task acceptance/decline flow with counter-proposals
- Task completion with notes and images
- Soft delete with 30-day recovery
- Real-time polling (10-second refresh)
- Sound notifications for new tasks

### Google Calendar Integration ✨ NEW
- OAuth flow with user's Google account
- Auto-creates 30-min calendar events for high/urgent tasks when accepted
- Event includes task title, description, and link back to Tskflow

### Team Features
- Domain-based team workspaces
- Team leaderboard and analytics
- Shared task visibility within teams
- Company email required (Gmail, Yahoo, Outlook blocked)

### Subscription Tiers
- **Free**: Unlimited tasks, basic features
- **Pro** ($9/month): Calendar auto-blocking, file attachments
- **Teams** ($12/month): Team workspace, analytics, admin controls (company email required)

### Admin Features
- `/api/admin/stats` - View all user metrics, subscription tiers, flagged accounts
- `/admin` portal with manual Pro/Teams access grants (by email or domain)

### User Groups (Pro & Teams) ✨ NEW (Jun 2026)
- Create named email groups (e.g. "My Team", "Design Squad") for one-click multi-assign
- Duplicate group-name prevention (case-insensitive) + email de-duplication
- Available only on Pro & Teams; managed from the New Task modal ("Manage groups")

### Prospecting / Leads CRM ✨ NEW (Jun 2026) — PRIVATE ADMIN TOOL
- `/leads` page: a private, admin-gated repository of sales prospects (NOT a per-user app feature)
- Accessed via direct link + admin password (same `ADMIN_PASSWORD` as `/admin`); no in-app nav button
- Curated Ideal Customer Profile guide (personas, industries, US/CA regions, search strings, where to find buyers)
- Pipeline statuses (To Call → Called → Interested → Won/Lost) with counts
- Full CRUD + CSV import (max 5000/import) + search & status filters
- **Apollo.io integration**: "Find Leads (Apollo)" searches Apollo's People DB by title/location/company-size, and "Save & unlock" enriches a person (People Match: reveal email + phone via async webhook). Auth via `X-Api-Key`. NOTE: requires a PAID Apollo plan — the current key is on the free plan, so the API returns a clear "upgrade your plan" message; CSV/manual still work.

### Task Creation (updated Jun 2026)
- Removed Notes & Category fields from the create-task modal
- New custom Due Date & Time picker (quick presets + calendar + hour/minute/AM-PM)

### Email System (via Resend)
- Task assignment notifications
- User invite flow with email links
- Password reset emails

### Monetization (Stripe - Live Mode)
- Checkout for Pro/Teams plans
- 30-day free trial for Teams
- Subscription management portal

---

## Blocked Email Domains (Teams)
gmail.com, yahoo.com, outlook.com, hotmail.com, live.com, aol.com, icloud.com, me.com, mail.com, protonmail.com, zoho.com, yandex.com, gmx.com, inbox.com

---

## Technical Stack
- **Frontend**: React, Tailwind CSS, ShadCN UI, Framer Motion
- **Backend**: FastAPI, MongoDB (motor), Pydantic
- **Auth**: JWT, passlib/bcrypt
- **Calendar**: Google Calendar API (OAuth)
- **Email**: Resend
- **Payments**: Stripe (live mode)

---

## Backlog

### Code Quality
- Refactor server.py (2900+ lines) into route modules
- Split TaskHub.js (~940 lines) — extract New Task modal & Groups modal into components

### Future Features
- Group editing UI (rename / edit members) — backend PUT /api/groups/{id} already exists
- Leads: bulk actions, CSV export, optional paid B2B data API (Apollo/Hunter) auto-enrichment
- Calendar event updates when tasks rescheduled
- Calendar event deletion when tasks declined/deleted
- Export reports
- API integrations
