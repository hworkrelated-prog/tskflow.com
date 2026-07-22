import asyncio, os, uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

USERS = [
    {"name": "Test Pro", "email": "prouser@acmecorp.com", "password": "Password123", "tier": "pro"},
    {"name": "Test Teams Owner", "email": "owner@acmecorp.com", "password": "Password123", "tier": "teams", "owner": True},
    {"name": "Alice Team Member", "email": "alice@acmecorp.com", "password": "Password123", "tier": "teams"},
    {"name": "Bob Team Member", "email": "bob@acmecorp.com", "password": "Password123", "tier": "teams"},
    {"name": "Test Free", "email": "freeuser@example.org", "password": "Password123", "tier": "free"},
]

async def main():
    for u in USERS:
        domain = u["email"].split("@")[1]
        doc = {
            "id": str(uuid.uuid4()),
            "name": u["name"],
            "email": u["email"],
            "password_hash": pwd.hash(u["password"]),
            "subscription_tier": u["tier"],
            "company_domain": domain,
            "email_verified": True,
            "is_team_owner": u.get("owner", False),
            "team_owner_email": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_active": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.update_one({"email": u["email"]}, {"$set": doc}, upsert=True)
        print(f"seeded {u['email']} ({u['tier']})")
    client.close()

asyncio.run(main())
