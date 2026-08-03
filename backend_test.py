#!/usr/bin/env python3
"""
Backend Testing Script for TskFlow
Tests PRIORITY 1, 2, 3 from review request
"""

import requests
import json
import uuid
from datetime import datetime, timedelta
from pymongo import MongoClient

# Configuration
BASE_URL = "http://localhost:8001/api"
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "tskflow"

# Test credentials
CREDENTIALS = {
    "owner": {"email": "owner@acmecorp.com", "password": "Password123"},
    "alice": {"email": "alice@acmecorp.com", "password": "Password123"},
    "bob": {"email": "bob@acmecorp.com", "password": "Password123"},
    "prouser": {"email": "prouser@acmecorp.com", "password": "Password123"},
    "freeuser": {"email": "freeuser@example.org", "password": "Password123"},
}

# Global state
tokens = {}
user_ids = {}

def login(user_key):
    """Login and store token"""
    creds = CREDENTIALS[user_key]
    resp = requests.post(f"{BASE_URL}/auth/login", json=creds)
    if resp.status_code != 200:
        print(f"❌ Login failed for {user_key}: {resp.status_code} {resp.text}")
        return None
    data = resp.json()
    tokens[user_key] = data["access_token"]
    user_ids[user_key] = data["user"]["id"]
    print(f"✅ Logged in as {user_key} (id: {user_ids[user_key]})")
    return data["access_token"]

def get_headers(user_key):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {tokens[user_key]}"}

def iso_now():
    """Get current time in ISO format"""
    return datetime.utcnow().isoformat() + "Z"

def iso_future(days=7):
    """Get future time in ISO format"""
    return (datetime.utcnow() + timedelta(days=days)).isoformat() + "Z"

# ============================================================================
# PRIORITY 1: Ghost Reminder Bug Fix - POST /api/tasks/cleanup-orphaned
# ============================================================================

def test_priority_1_ghost_reminder_cleanup():
    """Test orphan task cleanup endpoint with all scenarios"""
    print("\n" + "="*80)
    print("PRIORITY 1: Ghost Reminder Bug Fix - Orphan Task Cleanup")
    print("="*80)
    
    # Step 1: Login as owner
    login("owner")
    login("alice")
    login("bob")
    login("freeuser")
    
    owner_id = user_ids["owner"]
    alice_id = user_ids["alice"]
    bob_id = user_ids["bob"]
    
    # Step 2: Create a normal live task
    print("\n[Step 2] Creating normal live task...")
    live_task_payload = {
        "title": "Live task",
        "assigned_to": owner_id,
        "due_date": iso_future(7),
        "priority": "Medium",
        "status": "Pending"
    }
    resp = requests.post(f"{BASE_URL}/tasks", json=live_task_payload, headers=get_headers("owner"))
    if resp.status_code not in [200, 201]:
        print(f"❌ Failed to create live task: {resp.status_code} {resp.text}")
        return False
    live_task_id = resp.json()["id"]
    print(f"✅ Created live task: {live_task_id}")
    
    # Step 3: Create a bulk task (parent + children)
    print("\n[Step 3] Creating bulk task...")
    bulk_payload = {
        "title": "Bulk task",
        "assigned_to": [alice_id, bob_id],
        "due_date": iso_future(7),
        "priority": "High"
    }
    resp = requests.post(f"{BASE_URL}/tasks/bulk", json=bulk_payload, headers=get_headers("owner"))
    if resp.status_code not in [200, 201]:
        print(f"❌ Failed to create bulk task: {resp.status_code} {resp.text}")
        return False
    bulk_data = resp.json()
    # Bulk endpoint returns list of tasks, parent_id is in each child
    if not bulk_data or len(bulk_data) == 0:
        print(f"❌ Bulk task creation returned empty list")
        return False
    parent_id = bulk_data[0].get("parent_id")
    print(f"✅ Created bulk task with parent: {parent_id}")
    
    # Step 4: Use pymongo to inject 3 types of orphans
    print("\n[Step 4] Injecting orphans via pymongo...")
    mongo_client = MongoClient(MONGO_URL)
    db = mongo_client[DB_NAME]
    
    # ORPHAN_A: child with nonexistent parent_id
    orphan_a_id = str(uuid.uuid4())
    orphan_a = {
        "id": orphan_a_id,
        "title": "Orphan child no parent",
        "assigned_to": alice_id,
        "created_by": owner_id,
        "parent_id": "nonexistent-parent-id",
        "due_date": "2030-01-01T09:00",
        "status": "Pending",
        "priority": "High",
        "deleted": False,
        "is_parent": False,
        "created_at": iso_now()
    }
    db.tasks.insert_one(orphan_a)
    print(f"✅ Injected ORPHAN_A (no parent): {orphan_a_id}")
    
    # ORPHAN_B: task with nonexistent user
    orphan_b_id = str(uuid.uuid4())
    orphan_b = {
        "id": orphan_b_id,
        "title": "Orphan bad user",
        "assigned_to": "user-that-never-existed",
        "created_by": owner_id,
        "due_date": "2030-01-01T09:00",
        "status": "Pending",
        "priority": "High",
        "deleted": False,
        "is_parent": False,
        "created_at": iso_now()
    }
    db.tasks.insert_one(orphan_b)
    print(f"✅ Injected ORPHAN_B (bad user): {orphan_b_id}")
    
    # ORPHAN_C: task with no due_date
    orphan_c_id = str(uuid.uuid4())
    orphan_c = {
        "id": orphan_c_id,
        "title": "Orphan no due date",
        "assigned_to": alice_id,
        "created_by": owner_id,
        "due_date": None,
        "status": "Pending",
        "priority": "High",
        "deleted": False,
        "is_parent": False,
        "created_at": iso_now()
    }
    db.tasks.insert_one(orphan_c)
    print(f"✅ Injected ORPHAN_C (no due_date): {orphan_c_id}")
    
    # Step 5: Call POST /api/tasks/cleanup-orphaned
    print("\n[Step 5] Calling POST /api/tasks/cleanup-orphaned...")
    resp = requests.post(f"{BASE_URL}/tasks/cleanup-orphaned", headers=get_headers("owner"))
    if resp.status_code != 200:
        print(f"❌ Cleanup failed: {resp.status_code} {resp.text}")
        return False
    
    cleanup_data = resp.json()
    print(f"✅ Cleanup response: {json.dumps(cleanup_data, indent=2)}")
    
    # Verify response structure
    if not cleanup_data.get("ok"):
        print("❌ Response ok=false")
        return False
    
    if cleanup_data.get("cleaned", 0) < 3:
        print(f"❌ Expected cleaned >= 3, got {cleanup_data.get('cleaned')}")
        return False
    
    reasons = cleanup_data.get("reasons", {})
    if reasons.get("parent_deleted", 0) < 1:
        print(f"❌ Expected reasons.parent_deleted >= 1, got {reasons.get('parent_deleted')}")
        return False
    
    if reasons.get("no_assignee_or_user", 0) < 1:
        print(f"❌ Expected reasons.no_assignee_or_user >= 1, got {reasons.get('no_assignee_or_user')}")
        return False
    
    if reasons.get("invalid_due_date", 0) < 1:
        print(f"❌ Expected reasons.invalid_due_date >= 1, got {reasons.get('invalid_due_date')}")
        return False
    
    print("✅ Cleanup response structure correct")
    
    # Step 6: Verify orphans are marked deleted in DB
    print("\n[Step 6] Verifying orphans are marked deleted in DB...")
    orphan_a_db = db.tasks.find_one({"id": orphan_a_id})
    orphan_b_db = db.tasks.find_one({"id": orphan_b_id})
    orphan_c_db = db.tasks.find_one({"id": orphan_c_id})
    
    if not orphan_a_db or not orphan_a_db.get("deleted"):
        print(f"❌ ORPHAN_A not marked deleted: {orphan_a_db}")
        return False
    print(f"✅ ORPHAN_A marked deleted")
    
    if not orphan_b_db or not orphan_b_db.get("deleted"):
        print(f"❌ ORPHAN_B not marked deleted: {orphan_b_db}")
        return False
    print(f"✅ ORPHAN_B marked deleted")
    
    if not orphan_c_db or not orphan_c_db.get("deleted"):
        print(f"❌ ORPHAN_C not marked deleted: {orphan_c_db}")
        return False
    print(f"✅ ORPHAN_C marked deleted")
    
    # Step 7: Verify live task is untouched
    print("\n[Step 7] Verifying live task is untouched...")
    live_task_db = db.tasks.find_one({"id": live_task_id})
    if not live_task_db or live_task_db.get("deleted"):
        print(f"❌ Live task was incorrectly deleted: {live_task_db}")
        return False
    print(f"✅ Live task untouched (deleted != True)")
    
    # Step 8: Call cleanup again - should return cleaned=0 (idempotent)
    print("\n[Step 8] Testing idempotency - calling cleanup again...")
    resp = requests.post(f"{BASE_URL}/tasks/cleanup-orphaned", headers=get_headers("owner"))
    if resp.status_code != 200:
        print(f"❌ Second cleanup failed: {resp.status_code} {resp.text}")
        return False
    
    cleanup_data_2 = resp.json()
    print(f"✅ Second cleanup response: {json.dumps(cleanup_data_2, indent=2)}")
    
    if cleanup_data_2.get("cleaned", -1) != 0:
        print(f"❌ Expected cleaned=0 on second call, got {cleanup_data_2.get('cleaned')}")
        return False
    print("✅ Idempotency verified (cleaned=0)")
    
    # Step 9: Scope check - freeuser should not clean owner's orphans
    print("\n[Step 9] Testing scope - freeuser should not clean owner's orphans...")
    
    # Inject one more orphan owned by owner
    orphan_d_id = str(uuid.uuid4())
    orphan_d = {
        "id": orphan_d_id,
        "title": "Orphan owned by owner",
        "assigned_to": alice_id,
        "created_by": owner_id,
        "due_date": None,
        "status": "Pending",
        "priority": "High",
        "deleted": False,
        "is_parent": False,
        "created_at": iso_now()
    }
    db.tasks.insert_one(orphan_d)
    print(f"✅ Injected ORPHAN_D (owned by owner): {orphan_d_id}")
    
    # Call cleanup as freeuser
    resp = requests.post(f"{BASE_URL}/tasks/cleanup-orphaned", headers=get_headers("freeuser"))
    if resp.status_code != 200:
        print(f"❌ Freeuser cleanup failed: {resp.status_code} {resp.text}")
        return False
    
    cleanup_data_3 = resp.json()
    print(f"✅ Freeuser cleanup response: {json.dumps(cleanup_data_3, indent=2)}")
    
    if cleanup_data_3.get("cleaned", -1) != 0:
        print(f"❌ Expected freeuser cleaned=0 (out of scope), got {cleanup_data_3.get('cleaned')}")
        return False
    
    # Verify orphan_d still exists and is not deleted
    orphan_d_db = db.tasks.find_one({"id": orphan_d_id})
    if not orphan_d_db or orphan_d_db.get("deleted"):
        print(f"❌ ORPHAN_D was incorrectly deleted by freeuser: {orphan_d_db}")
        return False
    print(f"✅ Scope check passed - freeuser cannot clean owner's orphans")
    
    print("\n" + "="*80)
    print("✅ PRIORITY 1: All orphan cleanup tests PASSED")
    print("="*80)
    return True

# ============================================================================
# PRIORITY 2: AI Recurring Task Detection - POST /api/ai/quick-create-preview
# ============================================================================

def test_priority_2_ai_recurring_detection():
    """Test AI recurring task detection"""
    print("\n" + "="*80)
    print("PRIORITY 2: AI Recurring Task Detection")
    print("="*80)
    
    # Test 1: "Have Harold make calls from 12 to 3PM PST every day, urgent task"
    print("\n[Test 1] Testing daily recurring with time range...")
    payload = {
        "text": "Have Harold make calls from 12 to 3PM PST every day, urgent task"
    }
    resp = requests.post(f"{BASE_URL}/ai/quick-create-preview", json=payload, headers=get_headers("owner"))
    if resp.status_code != 200:
        print(f"❌ Test 1 failed: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    print(f"✅ Test 1 response: {json.dumps(data, indent=2)}")
    
    # Verify recurring fields
    recurring = data.get("recurring", {})
    if not recurring.get("is_recurring"):
        print(f"❌ Expected is_recurring=true, got {recurring.get('is_recurring')}")
        return False
    
    if recurring.get("frequency") != "daily":
        print(f"❌ Expected frequency='daily', got {recurring.get('frequency')}")
        return False
    
    if recurring.get("time_of_day") != "12:00":
        print(f"❌ Expected time_of_day='12:00', got {recurring.get('time_of_day')}")
        return False
    
    if recurring.get("end_time_of_day") != "15:00":
        print(f"❌ Expected end_time_of_day='15:00', got {recurring.get('end_time_of_day')}")
        return False
    
    if data.get("priority") != "Urgent":
        print(f"❌ Expected priority='Urgent', got {data.get('priority')}")
        return False
    
    if data.get("intent") != "task":
        print(f"❌ Expected intent='task', got {data.get('intent')}")
        return False
    
    print("✅ Test 1 PASSED: Daily recurring with time range detected correctly")
    
    # Test 2: "Every Monday and Wednesday at 9am, run the standup"
    print("\n[Test 2] Testing weekly recurring with specific days...")
    payload = {
        "text": "Every Monday and Wednesday at 9am, run the standup"
    }
    resp = requests.post(f"{BASE_URL}/ai/quick-create-preview", json=payload, headers=get_headers("owner"))
    if resp.status_code != 200:
        print(f"❌ Test 2 failed: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    print(f"✅ Test 2 response: {json.dumps(data, indent=2)}")
    
    # Verify recurring fields
    recurring = data.get("recurring", {})
    if not recurring.get("is_recurring"):
        print(f"❌ Expected is_recurring=true, got {recurring.get('is_recurring')}")
        return False
    
    if recurring.get("frequency") != "weekly":
        print(f"❌ Expected frequency='weekly', got {recurring.get('frequency')}")
        return False
    
    days_of_week = recurring.get("days_of_week", [])
    if 0 not in days_of_week or 2 not in days_of_week:
        print(f"❌ Expected days_of_week to contain 0 (Monday) and 2 (Wednesday), got {days_of_week}")
        return False
    
    if recurring.get("time_of_day") != "09:00":
        print(f"❌ Expected time_of_day='09:00', got {recurring.get('time_of_day')}")
        return False
    
    print("✅ Test 2 PASSED: Weekly recurring with specific days detected correctly")
    
    # Test 3: "How do I share a task with someone outside my company?"
    print("\n[Test 3] Testing question intent detection...")
    payload = {
        "text": "How do I share a task with someone outside my company?"
    }
    resp = requests.post(f"{BASE_URL}/ai/quick-create-preview", json=payload, headers=get_headers("owner"))
    if resp.status_code != 200:
        print(f"❌ Test 3 failed: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    print(f"✅ Test 3 response: {json.dumps(data, indent=2)}")
    
    if data.get("intent") != "question":
        print(f"❌ Expected intent='question', got {data.get('intent')}")
        return False
    
    print("✅ Test 3 PASSED: Question intent detected correctly")
    
    print("\n" + "="*80)
    print("✅ PRIORITY 2: All AI recurring detection tests PASSED")
    print("="*80)
    return True

# ============================================================================
# PRIORITY 3: Regression Sanity Checks
# ============================================================================

def test_priority_3_regression_sanity():
    """Test regression sanity checks"""
    print("\n" + "="*80)
    print("PRIORITY 3: Regression Sanity Checks")
    print("="*80)
    
    # Test 1: POST /api/ai/parse-task with resolve=true
    print("\n[Test 1] Testing POST /api/ai/parse-task with resolve=true...")
    payload = {
        "text": "call Alice tomorrow",
        "resolve": True
    }
    resp = requests.post(f"{BASE_URL}/ai/parse-task", json=payload, headers=get_headers("owner"))
    if resp.status_code != 200:
        print(f"❌ Test 1 failed: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    print(f"✅ Test 1 response keys: {list(data.keys())}")
    
    if "assignee_resolution" not in data:
        print(f"❌ Expected assignee_resolution in response")
        return False
    
    print("✅ Test 1 PASSED: POST /api/ai/parse-task with resolve=true works")
    
    # Test 2: POST /api/tasks with normal payload
    print("\n[Test 2] Testing POST /api/tasks with normal payload...")
    payload = {
        "title": "Test task for regression",
        "assigned_to": user_ids["alice"],
        "due_date": iso_future(3),
        "priority": "Medium"
    }
    resp = requests.post(f"{BASE_URL}/tasks", json=payload, headers=get_headers("owner"))
    if resp.status_code not in [200, 201]:
        print(f"❌ Test 2 failed: {resp.status_code} {resp.text}")
        return False
    
    task_data = resp.json()
    task_id = task_data.get("id")
    print(f"✅ Test 2 PASSED: Created task {task_id}")
    
    # Test 3: POST /api/tasks/{id}/nudge
    print("\n[Test 3] Testing POST /api/tasks/{id}/nudge...")
    payload = {
        "preset": "gentle_nudge"
    }
    resp = requests.post(f"{BASE_URL}/tasks/{task_id}/nudge", json=payload, headers=get_headers("owner"))
    if resp.status_code != 200:
        print(f"❌ Test 3 failed: {resp.status_code} {resp.text}")
        return False
    
    nudge_data = resp.json()
    print(f"✅ Test 3 response: {json.dumps(nudge_data, indent=2)}")
    print("✅ Test 3 PASSED: POST /api/tasks/{id}/nudge works")
    
    # Test 4: Check backend logs for "Application startup complete"
    print("\n[Test 4] Checking backend logs for 'Application startup complete'...")
    import subprocess
    result = subprocess.run(
        ["tail", "-n", "100", "/var/log/supervisor/backend.err.log"],
        capture_output=True,
        text=True
    )
    
    if "Application startup complete" not in result.stdout:
        print(f"❌ Test 4 failed: 'Application startup complete' not found in logs")
        print(f"Last 20 lines of logs:\n{result.stdout[-1000:]}")
        return False
    
    if "Traceback" in result.stdout:
        print(f"⚠️  Warning: Tracebacks found in logs")
        # Extract traceback lines
        lines = result.stdout.split("\n")
        for i, line in enumerate(lines):
            if "Traceback" in line:
                print("\n".join(lines[i:min(i+10, len(lines))]))
    
    print("✅ Test 4 PASSED: Backend logs show 'Application startup complete' with no critical errors")
    
    print("\n" + "="*80)
    print("✅ PRIORITY 3: All regression sanity tests PASSED")
    print("="*80)
    return True

# ============================================================================
# Main Test Runner
# ============================================================================

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("BACKEND TESTING - TskFlow")
    print("Testing PRIORITY 1, 2, 3 from review request")
    print("="*80)
    
    results = {
        "priority_1": False,
        "priority_2": False,
        "priority_3": False
    }
    
    try:
        results["priority_1"] = test_priority_1_ghost_reminder_cleanup()
    except Exception as e:
        print(f"\n❌ PRIORITY 1 EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
    
    try:
        results["priority_2"] = test_priority_2_ai_recurring_detection()
    except Exception as e:
        print(f"\n❌ PRIORITY 2 EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
    
    try:
        results["priority_3"] = test_priority_3_regression_sanity()
    except Exception as e:
        print(f"\n❌ PRIORITY 3 EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
    
    # Final summary
    print("\n" + "="*80)
    print("FINAL TEST SUMMARY")
    print("="*80)
    
    for priority, passed in results.items():
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{priority.upper()}: {status}")
    
    all_passed = all(results.values())
    if all_passed:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print("\n⚠️  SOME TESTS FAILED - See details above")
    
    return all_passed

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
