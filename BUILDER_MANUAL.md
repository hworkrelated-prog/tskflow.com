# tskbox Builder Manual

## Task Lifecycle

### 1. Task Creation
- User creates task with: title, description, due date, priority, category (optional), note (optional), images (optional)
- Task assigned to: self, existing user, or email address (invites new user)
- Bulk creation: assign same task to multiple users at once
- Initial status: `Pending` (or `Accepted` if self-assigned)
- System generates unique `invite_token` for each task

### 2. Task Assignment Flow
- Assignee receives email notification with task link
- Link format: `/invite?token={invite_token}`
- Assignee can: Accept, Decline (with reason), or Counter-Propose (new due date)

### 3. Task Completion
- Only assignee can mark task complete
- Completion prompts for optional note and screenshots
- Self-assigned tasks: immediately marked `Completed`
- Assigned tasks: set to `Review Pending` status

### 4. Review Pending State
- Task creator sees "Your Review Pending" indicator
- Countdown shows time until auto-completion (24 hours)
- Creator actions:
  - **Accept**: Task marked `Completed`, assignee notified
  - **Send Back**: Task returns to `Accepted` status with feedback, previous completion note preserved in `previous_completion_note`

### 5. Auto-Completion
- Tasks in `Review Pending` for 24+ hours auto-complete
- Triggered by `/api/tasks/auto-complete-reviews` endpoint
- Can be called via cron job or scheduled task

### Status Flow
```
Pending → Accepted → Review Pending → Completed
       ↘ Declined     ↗ (send back)
       ↘ Counter-Proposed
```

---

## Invite Flow and Routing

### Flow
1. Task created → `invite_token` generated
2. Email sent with link: `{APP_URL}/invite?token={token}`
3. User clicks link → `/invite` route handles:
   - Fetches task via `/api/invite/{token}`
   - If logged in: redirects to `/task/{task_id}`
   - If not logged in: stores `task_id` in localStorage, redirects to `/login`
4. After login: user redirected to stored task

### Key Points
- Invite links work without active preview session
- Token stored in `invite_token` field on task document
- `assigned_to_email` preserved for routing context

---

## Deleted Tasks Behavior

### Soft Delete
- Tasks marked `deleted: true`, not removed from database
- Fields added: `deleted_at`, `deleted_by`
- Hidden from main dashboard views

### Recently Deleted Section
- Collapsible section at bottom of TaskHub
- Shows tasks deleted by current user
- Restore button returns task to active state

### Auto-Purge
- Tasks deleted 3+ days ago permanently removed
- Purge runs on `/api/tasks/deleted` endpoint call
- Query: `deleted_at < (now - 3 days)`

### Analytics Treatment
- Tasks deleted BEFORE completion: excluded from analytics
- Tasks completed BEFORE deletion: included in analytics
- Query filter: `$or: [{deleted: {$ne: true}}, {$and: [{deleted: true}, {completed_at: {$ne: null}}]}]`

---

## Teams Package Features

### Team Hierarchy
- Users can set a manager (`reports_to` field)
- Users can add direct reports
- Domain-based team grouping via `company_domain`

### Manager Dashboard
- View tasks assigned to direct reports (created by you)
- Privacy preserved: can't see reports' other tasks

### Performance Analytics (`/api/team/performance`)
- Per-report metrics:
  - Tasks assigned (by you)
  - Tasks completed
  - Completion rate (%)
  - Average completion time (days)
- Leaderboard: ranked by completion rate

### Direct Reports Management
- Add/remove direct reports
- View who reports to you
- See your manager

---

## Analytics Rules

### What's Counted
- Tasks where user is creator OR assignee
- Date range filtered by `created_at`
- Completed tasks with valid `completed_at` timestamp

### What's Excluded
- Tasks deleted before completion
- Tasks outside selected date range
- Tasks from other users (non-teams)

### Metrics Calculated
- Assigned to others count
- Assigned to self count
- Received from others count
- Completed count
- Per-assignee breakdown:
  - Name, email
  - Tasks assigned
  - Tasks completed
  - Completion rate
  - Average completion time

### Teams-Specific
- Performance metrics only count tasks YOU assigned to reports
- Leaderboard ranks by completion rate, then task count
