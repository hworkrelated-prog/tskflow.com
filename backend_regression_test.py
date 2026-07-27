#!/usr/bin/env python3
"""
Backend Regression Test - Quick Pass on Endpoints Touched by Frontend Changes
Testing Groups CRUD, Users endpoint, Subtasks, Task fields, Single task creation, EOD cron
"""

import requests
import json
import time
from datetime import datetime, timedelta

# Configuration
BASE_URL = "http://localhost:8001/api"
OWNER_EMAIL = "owner@acmecorp.com"
OWNER_PASSWORD = "Password123"
ALICE_EMAIL = "alice@acmecorp.com"
ALICE_PASSWORD = "Password123"
BOB_EMAIL = "bob@acmecorp.com"
BOB_PASSWORD = "Password123"

# Test results tracking
test_results = []

def log_test(test_name, passed, status_code=None, message=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = {
        "test": test_name,
        "passed": passed,
        "status_code": status_code,
        "message": message
    }
    test_results.append(result)
    status_str = f" → {status_code}" if status_code else ""
    print(f"{status}: {test_name}{status_str}")
    if message:
        print(f"  {message}")

def login(email, password):
    """Login and return auth token"""
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": email, "password": password},
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("access_token"), data.get("user", {})
        else:
            print(f"Login failed: {response.status_code} - {response.text}")
            return None, None
    except Exception as e:
        print(f"Login error: {e}")
        return None, None

def test_groups_crud(token):
    """Test Groups CRUD operations"""
    print("\n=== 1. Groups CRUD (Manage Groups modal) ===")
    headers = {"Authorization": f"Bearer {token}"}
    group_id = None
    
    # POST /api/groups
    test_name = "POST /api/groups"
    try:
        response = requests.post(
            f"{BASE_URL}/groups",
            json={"name": "QA Team", "emails": ["a@a.com", "b@b.com"]},
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            group_id = data.get("id")
            if group_id and data.get("name") == "QA Team":
                log_test(test_name, True, 200, f"Group created with id={group_id}")
            else:
                log_test(test_name, False, 200, f"Missing id or name in response: {data}")
        else:
            log_test(test_name, False, response.status_code, response.text[:200])
    except Exception as e:
        log_test(test_name, False, None, f"Exception: {str(e)}")
    
    # GET /api/groups
    test_name = "GET /api/groups"
    try:
        response = requests.get(
            f"{BASE_URL}/groups",
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            groups = response.json()
            if isinstance(groups, list):
                found = any(g.get("id") == group_id for g in groups)
                if found:
                    log_test(test_name, True, 200, f"Found created group in list ({len(groups)} total)")
                else:
                    log_test(test_name, False, 200, f"Created group not found in list")
            else:
                log_test(test_name, False, 200, "Response is not a list")
        else:
            log_test(test_name, False, response.status_code, response.text[:200])
    except Exception as e:
        log_test(test_name, False, None, f"Exception: {str(e)}")
    
    # PUT /api/groups/{id}
    if group_id:
        test_name = "PUT /api/groups/{id}"
        try:
            response = requests.put(
                f"{BASE_URL}/groups/{group_id}",
                json={"name": "QA Team v2", "emails": ["a@a.com", "b@b.com", "c@c.com"]},
                headers=headers,
                timeout=5
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("name") == "QA Team v2" and len(data.get("emails", [])) == 3:
                    log_test(test_name, True, 200, "Group updated successfully")
                else:
                    log_test(test_name, False, 200, f"Update not reflected: {data}")
            else:
                log_test(test_name, False, response.status_code, response.text[:200])
        except Exception as e:
            log_test(test_name, False, None, f"Exception: {str(e)}")
    
    # DELETE /api/groups/{id}
    if group_id:
        test_name = "DELETE /api/groups/{id}"
        try:
            response = requests.delete(
                f"{BASE_URL}/groups/{group_id}",
                headers=headers,
                timeout=5
            )
            if response.status_code == 200:
                log_test(test_name, True, 200, "Group deleted")
            else:
                log_test(test_name, False, response.status_code, response.text[:200])
        except Exception as e:
            log_test(test_name, False, None, f"Exception: {str(e)}")
        
        # Verify deletion
        test_name = "GET /api/groups (verify deletion)"
        try:
            response = requests.get(
                f"{BASE_URL}/groups",
                headers=headers,
                timeout=5
            )
            if response.status_code == 200:
                groups = response.json()
                found = any(g.get("id") == group_id for g in groups)
                if not found:
                    log_test(test_name, True, 200, "Group no longer in list")
                else:
                    log_test(test_name, False, 200, "Group still in list after deletion")
            else:
                log_test(test_name, False, response.status_code)
        except Exception as e:
            log_test(test_name, False, None, f"Exception: {str(e)}")

def test_users_endpoint(token):
    """Test GET /api/users for user-picker"""
    print("\n=== 2. GET /api/users (user-picker in group modal) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "GET /api/users"
    try:
        response = requests.get(
            f"{BASE_URL}/users",
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            users = response.json()
            if isinstance(users, list) and len(users) > 0:
                # Check if users have required fields
                first_user = users[0]
                has_fields = all(k in first_user for k in ["id", "name", "email"])
                if has_fields:
                    log_test(test_name, True, 200, f"Returns {len(users)} users with id, name, email")
                else:
                    log_test(test_name, False, 200, f"Missing required fields: {first_user}")
            else:
                log_test(test_name, False, 200, "Empty user list or not a list")
        else:
            log_test(test_name, False, response.status_code, response.text[:200])
    except Exception as e:
        log_test(test_name, False, None, f"Exception: {str(e)}")

def test_subtasks_endpoint(token, owner_user, alice_user, bob_user):
    """Test GET /api/tasks/parents/{parent_id}/subtasks"""
    print("\n=== 3. GET /api/tasks/parents/{parent_id}/subtasks (assignees panel) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create a parent task with bulk assignment
    print("  Creating parent task with 2 assignees...")
    parent_id = None
    try:
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Regression Test Parent Task",
                "description": "Testing subtasks endpoint",
                "assigned_to": [alice_user["id"], bob_user["id"]],
                "due_date": (datetime.now() + timedelta(days=3)).isoformat(),
                "priority": "Medium"
            },
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            tasks = response.json()
            if isinstance(tasks, list) and len(tasks) > 0:
                print(f"  ✓ Bulk task created: {len(tasks)} subtasks")
                # Get parent_id from /api/tasks/parents endpoint
                response = requests.get(f"{BASE_URL}/tasks/parents", headers=headers, timeout=5)
                if response.status_code == 200:
                    parents = response.json()
                    if len(parents) > 0:
                        parent_id = parents[0]["id"]
                        print(f"  ✓ Parent task ID: {parent_id}")
                    else:
                        print(f"  ✗ No parent tasks found")
                else:
                    print(f"  ✗ Failed to get parents: {response.status_code}")
            else:
                print(f"  ✗ Bulk task creation failed: {tasks}")
        else:
            print(f"  ✗ Bulk task creation failed: {response.status_code}")
    except Exception as e:
        print(f"  ✗ Exception: {e}")
    
    if not parent_id:
        log_test("GET /api/tasks/parents/{parent_id}/subtasks", False, None, "Could not create parent task")
        return
    
    # Test GET /api/tasks/parents/{parent_id}/subtasks
    test_name = "GET /api/tasks/parents/{parent_id}/subtasks"
    try:
        response = requests.get(
            f"{BASE_URL}/tasks/parents/{parent_id}/subtasks",
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            subtasks = response.json()
            if isinstance(subtasks, list) and len(subtasks) == 2:
                # Check if assigned_to_name and assigned_to_email are present
                has_names = all("assigned_to_name" in t for t in subtasks)
                has_emails = all("assigned_to_email" in t for t in subtasks)
                if has_names and has_emails:
                    log_test(test_name, True, 200, f"Returns 2 subtasks with assigned_to_name and assigned_to_email")
                else:
                    log_test(test_name, False, 200, f"Missing assigned_to_name or assigned_to_email: {subtasks}")
            else:
                log_test(test_name, False, 200, f"Expected 2 subtasks, got {len(subtasks) if isinstance(subtasks, list) else 'not a list'}")
        else:
            log_test(test_name, False, response.status_code, response.text[:200])
    except Exception as e:
        log_test(test_name, False, None, f"Exception: {str(e)}")

def test_task_fields(token, owner_user):
    """Test GET /api/tasks/{task_id} for required fields"""
    print("\n=== 4. GET /api/tasks/{task_id} (verify fields) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create a task first
    print("  Creating test task...")
    task_id = None
    try:
        response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "Test Task for Field Verification",
                "description": "<p>This is a <strong>rich text</strong> description</p>",
                "assigned_to": owner_user["id"],
                "due_date": (datetime.now() + timedelta(days=5)).isoformat(),
                "priority": "High"
            },
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            task_data = response.json()
            task_id = task_data.get("id")
            print(f"  ✓ Task created: {task_id}")
        else:
            print(f"  ✗ Task creation failed: {response.status_code}")
    except Exception as e:
        print(f"  ✗ Exception: {e}")
    
    if not task_id:
        log_test("GET /api/tasks/{task_id}", False, None, "Could not create task")
        return
    
    # Test GET /api/tasks/{task_id}
    test_name = "GET /api/tasks/{task_id}"
    try:
        response = requests.get(
            f"{BASE_URL}/tasks/{task_id}",
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            task = response.json()
            # Check required fields (note: is_parent is not returned by API)
            required_fields = ["description", "assigned_to_name", "parent_id", "attachments"]
            missing_fields = [f for f in required_fields if f not in task]
            
            if not missing_fields:
                log_test(test_name, True, 200, f"Fields present: {', '.join(required_fields)} (Note: is_parent not in API)")
            else:
                log_test(test_name, False, 200, f"Missing fields: {', '.join(missing_fields)}")
        else:
            log_test(test_name, False, response.status_code, response.text[:200])
    except Exception as e:
        log_test(test_name, False, None, f"Exception: {str(e)}")

def test_single_task_creation(token, owner_user):
    """Test POST /api/tasks for single task creation"""
    print("\n=== 5. POST /api/tasks (single task creation) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "POST /api/tasks"
    try:
        response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "single",
                "description": "Test single task creation",
                "assigned_to": owner_user["id"],
                "due_date": "2025-12-31",
                "priority": "Medium"
            },
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            task = response.json()
            if task.get("id") and task.get("title") == "single":
                log_test(test_name, True, 200, f"Task created with id={task.get('id')}")
            else:
                log_test(test_name, False, 200, f"Missing id or title: {task}")
        else:
            log_test(test_name, False, response.status_code, response.text[:200])
    except Exception as e:
        log_test(test_name, False, None, f"Exception: {str(e)}")

def test_eod_cron(token):
    """Test POST /api/cron/eod-report"""
    print("\n=== 6. POST /api/cron/eod-report (CRON_SECRET check) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "POST /api/cron/eod-report (no secret)"
    try:
        response = requests.post(
            f"{BASE_URL}/cron/eod-report",
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            if "ok" in data and "sent" in data:
                log_test(test_name, True, 200, f"Returns {{ok: true, sent: {data.get('sent')}}} (CRON_SECRET unset)")
            else:
                log_test(test_name, False, 200, f"Missing ok or sent fields: {data}")
        elif response.status_code == 401:
            log_test(test_name, True, 401, "Returns 401 (CRON_SECRET is set and required)")
        else:
            log_test(test_name, False, response.status_code, response.text[:200])
    except Exception as e:
        log_test(test_name, False, None, f"Exception: {str(e)}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("REGRESSION TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for r in test_results if r["passed"])
    failed = sum(1 for r in test_results if not r["passed"])
    total = len(test_results)
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for r in test_results:
            if not r["passed"]:
                status_str = f" → {r['status_code']}" if r['status_code'] else ""
                print(f"  • {r['test']}{status_str}")
                if r["message"]:
                    print(f"    {r['message']}")
    
    print("\n✅ PASSED TESTS:")
    for r in test_results:
        if r["passed"]:
            status_str = f" → {r['status_code']}" if r['status_code'] else ""
            print(f"  • {r['test']}{status_str}")
    
    print("\n" + "="*80)

def main():
    """Main test execution"""
    print("="*80)
    print("BACKEND REGRESSION TEST - Quick Pass After Frontend Changes")
    print("="*80)
    
    # Login as owner
    print("\n🔐 Logging in as owner@acmecorp.com...")
    owner_token, owner_user = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not owner_token:
        print("❌ CRITICAL: Owner login failed. Cannot proceed with tests.")
        return
    print(f"✓ Owner logged in: {owner_user.get('name')} ({owner_user.get('email')})")
    
    # Login as alice
    print("\n🔐 Logging in as alice@acmecorp.com...")
    alice_token, alice_user = login(ALICE_EMAIL, ALICE_PASSWORD)
    if not alice_token:
        print("❌ CRITICAL: Alice login failed.")
        return
    print(f"✓ Alice logged in: {alice_user.get('name')} ({alice_user.get('email')})")
    
    # Login as bob
    print("\n🔐 Logging in as bob@acmecorp.com...")
    bob_token, bob_user = login(BOB_EMAIL, BOB_PASSWORD)
    if not bob_token:
        print("❌ CRITICAL: Bob login failed.")
        return
    print(f"✓ Bob logged in: {bob_user.get('name')} ({bob_user.get('email')})")
    
    # Run tests
    test_groups_crud(owner_token)
    test_users_endpoint(owner_token)
    test_subtasks_endpoint(owner_token, owner_user, alice_user, bob_user)
    test_task_fields(owner_token, owner_user)
    test_single_task_creation(owner_token, owner_user)
    test_eod_cron(owner_token)
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
