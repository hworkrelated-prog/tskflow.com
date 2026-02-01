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
- Refactor server.py (2600+ lines) into route modules

### Future Features
- Calendar event updates when tasks rescheduled
- Calendar event deletion when tasks declined/deleted
- Export reports
- API integrations
