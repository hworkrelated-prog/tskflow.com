# Tskflow - Product Requirements Document

## Overview
Tskflow is a B2B task management platform focused on clear commitments, time realism, and ownership through acceptance.

## Core Philosophy
- Clear commitments over task dumping
- Time realism through calendar blocking
- Ownership through acceptance flow
- Company-focused (no personal email usage)

## Target Users
- Teams within companies using custom email domains
- Managers who need to delegate and track tasks
- Team members who need clear task ownership

---

## Implemented Features

### Authentication & Users
- JWT-based authentication
- Email verification flow
- Password reset via email
- Login error messages differentiate between non-existent accounts and wrong passwords

### Task Management
- Task creation with title, description, priority, due date
- Task assignment to anyone (by email)
- Task acceptance/decline flow with counter-proposals
- Task completion with notes and images
- Soft delete with 30-day recovery
- Real-time polling (10-second refresh)
- Sound notifications for new tasks

### Team Features
- Domain-based team workspaces
- Team leaderboard and analytics
- Shared task visibility within teams

### Subscription Tiers
- **Free**: Unlimited tasks, basic features, no file attachments
- **Pro** ($9/month): Priority support, file attachments
- **Teams** ($12/month): Team workspace, analytics, admin controls

### Email System (via Resend)
- Task assignment notifications
- User invite flow with email links
- Password reset emails
- Trial end billing reminders
- Daily analytics email to founder

### Monetization (Stripe)
- Live mode checkout for Pro/Teams
- 30-day free trial for Teams
- Subscription management portal

---

## Recently Implemented (Jan 2026)

### Company Email Enforcement
- Personal email domains blocked for Teams features
- Blocked domains: gmail.com, yahoo.com, outlook.com, hotmail.com, live.com, aol.com, icloud.com, me.com, mail.com, protonmail.com, zoho.com, yandex.com, gmx.com, inbox.com
- Enforcement at: Trial activation, Teams purchase

### Admin Stats Endpoint
- GET /api/admin/stats - View all user metrics
- Shows personal email teams users for cleanup

### Login Error Improvements
- "No account found" vs "Incorrect password" messages

---

## Pending / In Progress

### P0: Google Calendar Integration
- Auto-block calendar time for high/urgent tasks after acceptance
- Default 30 min, configurable up to 60 min
- Event includes: task title, description, due date, task link
- Requires: Google OAuth credentials or Emergent OAuth with Calendar scope

### P1: Landing/Pricing Page Updates
- Communicate B2B value proposition
- Company email requirement messaging
- Calendar auto-blocking feature highlight

### P2: Cleanup Personal Email Teams Accounts
- 2 accounts identified: hworkrelated@gmail.com, h1workrelated@gmail.com
- Awaiting confirmation to deactivate

---

## Backlog

### Code Quality
- Refactor server.py (2500+ lines) into route modules
- Extract VisualDemo component from LandingPage.js

### Future Features
- Export reports
- API integrations
- Advanced team analytics

---

## Technical Stack
- **Frontend**: React, Tailwind CSS, ShadCN UI, Framer Motion
- **Backend**: FastAPI, MongoDB (motor), Pydantic
- **Auth**: JWT, passlib/bcrypt
- **Email**: Resend
- **Payments**: Stripe (live mode)
- **Analytics**: Microsoft Clarity, APScheduler for daily emails

---

## Key Endpoints
- POST /api/auth/login - User login
- POST /api/auth/register - User registration
- POST /api/start-teams-trial - Start 30-day trial (company email only)
- POST /api/payments/create-checkout - Stripe checkout (teams requires company email)
- GET /api/admin/stats - View user statistics
