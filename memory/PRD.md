# Tskflow — Product Requirements & Feature Log

TskFlow is positioned as an **Accountability Management Platform**. It goes beyond task management by making ownership, visibility, and follow-through the default: every commitment has a clear owner, a due time, an acceptance step, and completion proof.

## Continuation Batch — Production-Ready Feature Drop (July 2026)

### 1. Task Drafts (Complete)
- Auto-save the moment a user starts typing in Create Task (title, description, assignee, due date, priority, attachments).
- Status indicator in the modal: "Saving…", "Saved", "Save failed — will retry".
- Offline queue in `src/lib/draftStore.js` — buffers create/update/delete operations in localStorage and flushes when navigator.onLine fires.
- Draft list on dashboard with Resume + Delete (trash) buttons. `DELETE /api/tasks/drafts/{id}` implemented.
- Submitting the create form promotes the draft into a task and removes it. Recurring submissions delete the draft.

### 2. Recurring Tasks (Complete)
- Backend collection `recurring_series` + tasks are linked via `recurring_series_id`.
- Frequencies: daily, weekdays, weekly, biweekly, monthly, yearly, custom (every N days).
- End types: never, on_date, after_count.
- Rolling generation window: `_generate_occurrences(series, window_days=60, max_occurrences=25)`.
- Background scheduler (`_scheduler_loop`) regenerates every 5 minutes.
- Edit series with scope=this|future|all (`PUT /api/recurring/{id}`).
- Skip a specific occurrence (`POST /api/recurring/{id}/skip`).
- Delete/stop series (`DELETE /api/recurring/{id}`).
- Dedicated page at `/recurring` with per-series occurrence history.
- UI editor: `src/components/RecurrenceEditor.js` embedded in the Create Task advanced options.

### 3. Global Floating Create Button
- `src/components/GlobalFAB.js` — bottom-left, visible on every authenticated page (hidden on /login /register /verify-email /forgot-password).
- Dispatches `tskflow:open-create-task` DOM event so TaskHub opens its modal in place; otherwise navigates to `/dashboard?create=1`.

### 4. Voice Mode Redesign
- `src/components/VoiceMode.js` — persistent bottom-right widget mounted at App root, survives navigation.
- Tapping the mic starts listening IMMEDIATELY (no popup).
- Minimal listening indicator with Stop/Cancel; also supports a small typed input for accessibility.
- Keyboard shortcut Ctrl/Cmd + Shift + M.
- Old modal VoiceCommandCenter decommissioned from TaskHub.

### 5. Voice Assistant (KB-grounded)
- New `VOICE_ASSISTANT_SYSTEM` prompt embeds `TSKFLOW_KB` (feature knowledge base).
- New action.type = "assistant_answer" for how-to questions; existing action types still handled.

### 6. AI Consistency (Single Source of Truth)
- Voice, EOD, analytics, and AI summaries all query MongoDB live.

### 7. Smart Task Creation
- `POST /api/ai/parse-task` returns structured {title, description, priority, category, due_date, action_items, assignee_hints, is_sales_task, requires_screen_recording, confidence}.
- CreateTask modal auto-parses descriptions >= 25 chars (debounced 1.5s) and pre-fills the form.

### 8. Analytics Redesign
- Section tabs: "Overall Analytics", "Team Leaderboard", "Organization Leaderboard".
- LeaderboardTab rewritten with search + sortable columns + streaks + badges.

### 9. Better Time Formatting
- `src/lib/formatTime.js` — never displays "0.4 hours"; instead "24 minutes" or "2 hours 30 minutes".

### 10. Task Leaderboard (Group Tasks)
- Existing `/task/{id}` group task leaderboard preserved.

### 11. Smart Reminders
- Backend: `GET/PUT /api/reminders/rules` per-user config. `_check_smart_reminders` job runs every 5 min.
- Triggers: time_before_due, no_progress, no_response, approaching_deadline, overdue.
- Configurable frequency, priorities, and channels (in-app, email, Slack).
- UI: SmartRemindersCard in Settings.

### 12. Help Center
- `/help` route with Docs (searchable), 5-step Walkthrough, and What's New.

### 13. Landing Page
- Repositioned as an Accountability Management Platform. Hero: "Own it. Close it."

### 14. In-App Guidance
- Help button in nav now navigates to full Help Center.

## Test Users
- owner@acmecorp.com / Password123 (Teams plan)
- alice@acmecorp.com / Password123 (Teams member)
- bob@acmecorp.com / Password123 (Teams member)
- prouser@acmecorp.com / Password123 (Pro tier)
- freeuser@example.org / Password123 (Free tier)
