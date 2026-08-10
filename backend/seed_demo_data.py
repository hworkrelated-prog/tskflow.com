"""
Seed realistic demo data for the leaderboard / analytics / team views.

Creates a manager (owner@acmecorp.com) with several direct reports and a spread
of assigned tasks in various states so the Performance, Direct Reports,
Analytics and Leaderboard screens have meaningful, varied data to render.

Run AFTER seed_test_users.py and with the backend running on :8001.
    python3 seed_demo_data.py
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone, timedelta

import requests
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

BASE = os.environ.get('DEMO_BASE_URL', 'http://localhost:8001')
API = f"{BASE}/api"
PWD = "Password123"

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

# Extra teammates (added directly to the DB) so the leaderboard is fuller.
EXTRA_USERS = [
    {"name": "Carol Chen", "email": "carol@acmecorp.com"},
    {"name": "Dave Diaz", "email": "dave@acmecorp.com"},
]

# How many tasks to assign / complete per report -> drives completion-rate colors.
REPORTS_PLAN = [
    {"email": "alice@acmecorp.com", "assigned": 5, "completed": 4},   # 80% green
    {"email": "bob@acmecorp.com", "assigned": 4, "completed": 2},     # 50% amber
    {"email": "carol@acmecorp.com", "assigned": 6, "completed": 6},   # 100% green
    {"email": "dave@acmecorp.com", "assigned": 3, "completed": 1},    # 33% red
]

PRIORITIES = ["urgent", "high", "medium", "low"]


async def ensure_extra_users():
    for u in EXTRA_USERS:
        doc = {
            "id": str(uuid.uuid4()),
            "name": u["name"],
            "email": u["email"],
            "password_hash": pwd_ctx.hash(PWD),
            "subscription_tier": "teams",
            "company_domain": "acmecorp.com",
            "email_verified": True,
            "is_team_owner": False,
            "team_owner_email": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_active": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.update_one({"email": u["email"]}, {"$set": doc}, upsert=True)
    client.close()


def login(email):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": PWD})
    r.raise_for_status()
    return r.json()["access_token"]


def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def me(token):
    return requests.get(f"{API}/auth/me", headers=h(token)).json()


def main():
    asyncio.run(ensure_extra_users())

    owner_token = login("owner@acmecorp.com")
    owner = me(owner_token)
    print(f"owner: {owner['name']} ({owner['id']})")

    for plan in REPORTS_PLAN:
        email = plan["email"]
        token = login(email)
        user = me(token)
        uid = user["id"]

        # Make them a direct report of the owner.
        r = requests.post(f"{API}/team/add-direct-report", headers=h(owner_token),
                          json={"user_id": uid})
        print(f"  add-direct-report {email}: {r.status_code} {r.json().get('message', r.text)}")

        completed = 0
        for i in range(plan["assigned"]):
            due = (datetime.now(timezone.utc) + timedelta(days=(i % 5) - 1)).isoformat()
            body = {
                "title": f"{user['name'].split()[0]} task #{i + 1}",
                "description": "Demo task for analytics/leaderboard seeding.",
                "assigned_to": uid,
                "due_date": due,
                "priority": PRIORITIES[i % len(PRIORITIES)],
            }
            cr = requests.post(f"{API}/tasks", headers=h(owner_token), json=body)
            if cr.status_code != 200:
                print(f"    create task failed: {cr.status_code} {cr.text}")
                continue
            task_id = cr.json()["id"]

            # Assignee accepts.
            requests.put(f"{API}/tasks/{task_id}/accept", headers=h(token))

            # Complete a subset, then owner approves -> Completed.
            if completed < plan["completed"]:
                requests.put(f"{API}/tasks/{task_id}/complete", headers=h(token),
                             json={"completion_note": "Done and verified."})
                requests.put(f"{API}/tasks/{task_id}/review", headers=h(owner_token),
                             json={"action": "accept"})
                completed += 1

        print(f"  {email}: assigned={plan['assigned']} completed={completed}")

    print("Demo data seeding complete.")


if __name__ == "__main__":
    main()
