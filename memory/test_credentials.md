# Test Credentials

All seeded via `/app/backend/seed_test_users.py` (email_verified=True). Password is the same for all.

| Role | Email | Password | Tier |
|------|-------|----------|------|
| Pro user | prouser@acmecorp.com | Password123 | pro |
| Teams owner | owner@acmecorp.com | Password123 | teams |
| Free user | freeuser@example.org | Password123 | free |

## Admin Portal & Prospecting (private)
- Admin Portal route: `/admin`
- Prospecting / Leads route: `/leads` (now ADMIN-GATED — not a per-user app feature)
- Password for both (env `ADMIN_PASSWORD`): `3369434114Ha.`

## Notes
- Groups feature (create named email groups) requires Pro or Teams tier (in the New Task modal).
- Prospecting/Leads page (`/leads`) is a private admin tool reached via direct link + admin password.
- Apollo lead search uses `APOLLO_API_KEY` in backend/.env. The current key is on a FREE Apollo plan, so the Apollo API returns 402/"plan upgrade required". CSV import + manual add still work. Upgrade Apollo to a paid plan (Basic+) to enable live search — no code change needed.
