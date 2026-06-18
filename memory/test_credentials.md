# Test Credentials

All seeded via `/app/backend/seed_test_users.py` (email_verified=True). Password is the same for all.

| Role | Email | Password | Tier |
|------|-------|----------|------|
| Pro user | prouser@acmecorp.com | Password123 | pro |
| Teams owner | owner@acmecorp.com | Password123 | teams |
| Free user | freeuser@example.org | Password123 | free |

## Admin Portal
- Route: `/admin`
- Password (env `ADMIN_PASSWORD`): `3369434114Ha.`

## Notes
- Groups feature (create named email groups) requires Pro or Teams tier.
- Prospecting/Leads page (`/leads`) is available to all tiers.
