#!/usr/bin/env python3
"""
Backend Regression Test Suite for Tskflow July 2025 Continuation Batch
Tests AI Summary endpoints, Standalone Recording, Mentions Notifications, and Regression Sanity
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

# Test results tracking
test_results = []

def log_test(test_name, passed, message="", latency=None):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = {
        "test": test_name,
        "passed": passed,
        "message": message,
        "latency": latency
    }
    test_results.append(result)
    latency_str = f" ({latency:.3f}s)" if latency else ""
    print(f"{status}: {test_name}{latency_str}")
    if message:
        print(f"  → {message}")

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

def test_ai_summary_endpoints(token, owner_user):
    """Test AI Summary endpoints - must accept JSON body and return within 15s"""
    print("\n=== Testing AI Summary Endpoints ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: POST /api/dashboard/ai-summary with JSON body
    test_name = "POST /api/dashboard/ai-summary (JSON body)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/dashboard/ai-summary",
            json={"view_mode": "active", "date_filter": "all"},
            headers=headers,
            timeout=20
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "summary" in data:
                if latency < 15:
                    log_test(test_name, True, f"Summary: {data['summary'][:100]}...", latency)
                else:
                    log_test(test_name, False, f"Latency too high: {latency:.2f}s (>15s)", latency)
            else:
                log_test(test_name, False, f"Missing 'summary' field in response", latency)
        elif response.status_code == 422:
            log_test(test_name, False, f"422 Unprocessable Entity - JSON body not accepted", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except requests.exceptions.Timeout:
        log_test(test_name, False, "Request timed out (>20s)")
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: Create a task first for task-specific AI summary
    print("\n  Creating test task for AI summary...")
    task_id = None
    try:
        task_response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "Test Task for AI Summary",
                "description": "This is a test task to verify AI summary functionality",
                "assigned_to": owner_user["id"],
                "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
                "priority": "High"
            },
            headers=headers,
            timeout=5
        )
        if task_response.status_code == 200:
            task_data = task_response.json()
            task_id = task_data.get("id")
            print(f"  ✓ Task created: {task_id}")
        else:
            print(f"  ✗ Task creation failed: {task_response.status_code}")
    except Exception as e:
        print(f"  ✗ Task creation error: {e}")
    
    # Test 3: POST /api/tasks/{task_id}/ai-summary
    if task_id:
        test_name = "POST /api/tasks/{task_id}/ai-summary"
        try:
            start = time.time()
            response = requests.post(
                f"{BASE_URL}/tasks/{task_id}/ai-summary",
                headers=headers,
                timeout=20
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                if "summary" in data:
                    if latency < 15:
                        log_test(test_name, True, f"Summary: {data['summary'][:100]}...", latency)
                    else:
                        log_test(test_name, False, f"Latency too high: {latency:.2f}s (>15s)", latency)
                else:
                    log_test(test_name, False, f"Missing 'summary' field in response", latency)
            elif response.status_code == 422:
                log_test(test_name, False, f"422 Unprocessable Entity", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
        except requests.exceptions.Timeout:
            log_test(test_name, False, "Request timed out (>20s)")
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    else:
        log_test("POST /api/tasks/{task_id}/ai-summary", False, "Skipped - no task created")
    
    return task_id

def test_standalone_recording(token):
    """Test Standalone Recording - must accept JSON body"""
    print("\n=== Testing Standalone Recording ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: POST with JSON body {"recording_url": "test/path/recording.webm"}
    test_name = "POST /api/recordings/standalone (JSON body with URL)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recordings/standalone",
            json={"recording_url": "test/path/recording.webm"},
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ["recording_id", "shareable_link", "shareable_token"]
            missing = [f for f in required_fields if f not in data]
            if not missing:
                log_test(test_name, True, f"Recording created: {data['recording_id']}", latency)
                # Store for later retrieval test
                test_standalone_recording.token = data["shareable_token"]
            else:
                log_test(test_name, False, f"Missing fields: {missing}", latency)
        elif response.status_code == 422:
            log_test(test_name, False, f"422 Unprocessable Entity - JSON body not accepted", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: POST with JSON body {"recording_url": null}
    test_name = "POST /api/recordings/standalone (JSON body with null)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recordings/standalone",
            json={"recording_url": None},
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "recording_id" in data:
                log_test(test_name, True, f"Recording created with null URL", latency)
            else:
                log_test(test_name, False, f"Missing recording_id", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: Backwards compat - POST with query param
    test_name = "POST /api/recordings/standalone (query param - backwards compat)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recordings/standalone?recording_url=test/path",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            log_test(test_name, True, "Backwards compatibility maintained", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 4: GET /api/recordings/{shareable_token}
    if hasattr(test_standalone_recording, 'token'):
        test_name = "GET /api/recordings/{shareable_token}"
        try:
            start = time.time()
            response = requests.get(
                f"{BASE_URL}/recordings/{test_standalone_recording.token}",
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                if "recording_url" in data:
                    log_test(test_name, True, "Recording retrieved successfully", latency)
                else:
                    log_test(test_name, False, "Missing recording_url in response", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")

def test_mentions_notifications(owner_token, owner_user, alice_token, alice_user, task_id):
    """Test Mentions Notifications Flow"""
    print("\n=== Testing Mentions Notifications Flow ===")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    alice_headers = {"Authorization": f"Bearer {alice_token}"}
    
    # If no task_id from AI summary test, create a new one
    if not task_id:
        print("  Creating task for mentions test...")
        try:
            response = requests.post(
                f"{BASE_URL}/tasks",
                json={
                    "title": "Test Task for Mentions",
                    "description": "Testing mentions functionality",
                    "assigned_to": alice_user["id"],
                    "due_date": (datetime.now() + timedelta(days=3)).isoformat(),
                    "priority": "Medium"
                },
                headers=owner_headers,
                timeout=5
            )
            if response.status_code == 200:
                task_data = response.json()
                task_id = task_data.get("id")
                print(f"  ✓ Task created: {task_id}")
            else:
                print(f"  ✗ Task creation failed: {response.status_code}")
                log_test("Mentions Notifications Flow", False, "Could not create task")
                return
        except Exception as e:
            print(f"  ✗ Task creation error: {e}")
            log_test("Mentions Notifications Flow", False, f"Task creation error: {e}")
            return
    
    # Test 1: POST comment with mention
    test_name = "POST /api/tasks/{task_id}/comments (with mention)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/{task_id}/comments",
            json={
                "content": f"Hey @alice check this out!",
                "mentions": [alice_user["id"]]
            },
            headers=owner_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "comment" in data:
                comment = data["comment"]
                required_fields = ["id", "user_id", "user_name", "content", "mentions", "created_at"]
                missing = [f for f in required_fields if f not in comment]
                if not missing:
                    log_test(test_name, True, f"Comment created with mention", latency)
                else:
                    log_test(test_name, False, f"Missing fields: {missing}", latency)
            else:
                log_test(test_name, False, "Missing 'comment' in response", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Wait a moment for notification to be created
    time.sleep(0.5)
    
    # Test 2: GET /api/notifications/pending as alice (first call)
    test_name = "GET /api/notifications/pending (first call - should have notification)"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/notifications/pending",
            headers=alice_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "notifications" in data:
                notifications = data["notifications"]
                if len(notifications) > 0:
                    notif = notifications[0]
                    required_fields = ["type", "title", "body", "task_id"]
                    missing = [f for f in required_fields if f not in notif]
                    if not missing:
                        if notif["type"] == "mention" and "owner" in notif["title"].lower():
                            log_test(test_name, True, f"Notification found: {notif['title']}", latency)
                        else:
                            log_test(test_name, False, f"Notification type/title incorrect: {notif}", latency)
                    else:
                        log_test(test_name, False, f"Missing fields: {missing}", latency)
                else:
                    log_test(test_name, False, "No notifications returned (expected at least one)", latency)
            else:
                log_test(test_name, False, "Missing 'notifications' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: GET /api/notifications/pending as alice (second call - should be empty)
    test_name = "GET /api/notifications/pending (second call - should be empty)"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/notifications/pending",
            headers=alice_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "notifications" in data:
                notifications = data["notifications"]
                if len(notifications) == 0:
                    log_test(test_name, True, "No notifications (already delivered)", latency)
                else:
                    log_test(test_name, False, f"Still has {len(notifications)} notifications (should be 0)", latency)
            else:
                log_test(test_name, False, "Missing 'notifications' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_mentionable_users(token):
    """Test Mentionable Users Endpoint"""
    print("\n=== Testing Mentionable Users Endpoint ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "GET /api/users/mentionable"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/users/mentionable",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            users = response.json()
            if isinstance(users, list) and len(users) > 0:
                # Check if alice and owner are in the list
                emails = [u.get("email") for u in users]
                required_fields = ["id", "name", "email"]
                missing = [f for f in required_fields if f not in users[0]]
                
                if not missing:
                    if ALICE_EMAIL in emails and OWNER_EMAIL in emails:
                        log_test(test_name, True, f"Found {len(users)} mentionable users (includes alice and owner)", latency)
                    else:
                        log_test(test_name, False, f"Missing expected users. Found: {emails}", latency)
                else:
                    log_test(test_name, False, f"Missing fields in user objects: {missing}", latency)
            else:
                log_test(test_name, False, "Empty user list or not a list", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_regression_sanity(token, owner_user, alice_user):
    """Test Regression Sanity for Existing Endpoints"""
    print("\n=== Testing Regression Sanity ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: POST /api/tasks (single task)
    test_name = "POST /api/tasks (single task)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "Regression Test Single Task",
                "description": "Testing single task creation",
                "assigned_to": alice_user["id"],
                "due_date": (datetime.now() + timedelta(days=5)).isoformat(),
                "priority": "Low"
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "id" in data:
                log_test(test_name, True, f"Task created: {data['id']}", latency)
                test_regression_sanity.single_task_id = data["id"]
            else:
                log_test(test_name, False, "Missing id", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: POST /api/tasks/bulk (group of 2)
    test_name = "POST /api/tasks/bulk (group of 2)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Regression Test Bulk Task",
                "description": "Testing bulk task creation",
                "assigned_to": [alice_user["id"], owner_user["id"]],
                "due_date": (datetime.now() + timedelta(days=5)).isoformat(),
                "priority": "Medium"
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            # Response is a list of TaskResponse objects
            if isinstance(data, list) and len(data) > 0:
                # Find parent task by querying the database or checking if any task has is_parent
                # For now, we'll just check if tasks were created
                log_test(test_name, True, f"Bulk task created with {len(data)} child tasks", latency)
                # Get parent_id by querying the parent endpoint
                test_regression_sanity.bulk_created = True
            else:
                log_test(test_name, False, "Empty response or not a list", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: GET /api/tasks/parents?status_filter=active
    test_name = "GET /api/tasks/parents?status_filter=active"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/tasks/parents?status_filter=active",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                log_test(test_name, True, f"Retrieved {len(data)} active parent tasks", latency)
            else:
                log_test(test_name, False, "Response is not a list", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 4: GET /api/tasks/{parent_id}/leaderboard
    # First, get a parent task from the parents list
    test_name = "GET /api/tasks/{parent_id}/leaderboard"
    if hasattr(test_regression_sanity, 'bulk_created') and test_regression_sanity.bulk_created:
        try:
            # Get parent tasks first
            parents_response = requests.get(
                f"{BASE_URL}/tasks/parents?status_filter=active",
                headers=headers,
                timeout=5
            )
            if parents_response.status_code == 200:
                parents = parents_response.json()
                if len(parents) > 0:
                    parent_id = parents[0]["id"]
                    start = time.time()
                    response = requests.get(
                        f"{BASE_URL}/tasks/{parent_id}/leaderboard",
                        headers=headers,
                        timeout=5
                    )
                    latency = time.time() - start
                    
                    if response.status_code == 200:
                        data = response.json()
                        if "leaderboard" in data:
                            log_test(test_name, True, f"Leaderboard retrieved", latency)
                        else:
                            log_test(test_name, False, "Missing 'leaderboard' field", latency)
                    else:
                        log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
                else:
                    log_test(test_name, False, "No parent tasks found")
            else:
                log_test(test_name, False, "Could not fetch parent tasks")
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    else:
        log_test(test_name, False, "Skipped - no bulk task created")
    
    # Test 5: POST /api/analytics
    test_name = "POST /api/analytics"
    try:
        start = time.time()
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        response = requests.post(
            f"{BASE_URL}/analytics",
            json={
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat()
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "assignee_breakdown" in data:
                breakdown = data["assignee_breakdown"]
                if isinstance(breakdown, list) and len(breakdown) > 0:
                    # Check for new fields: response_rate and avg_response_hours
                    first_assignee = breakdown[0]
                    if "response_rate" in first_assignee and "avg_response_hours" in first_assignee:
                        log_test(test_name, True, f"Analytics with response_rate and avg_response_hours", latency)
                    else:
                        log_test(test_name, False, "Missing response_rate or avg_response_hours fields", latency)
                else:
                    log_test(test_name, True, "Analytics returned (empty breakdown)", latency)
            else:
                log_test(test_name, False, "Missing 'assignee_breakdown' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for r in test_results if r["passed"])
    failed = sum(1 for r in test_results if not r["passed"])
    total = len(test_results)
    
    print(f"\nTotal Tests: {total}")
    print(f"Passed: {passed} ({passed/total*100:.1f}%)")
    print(f"Failed: {failed} ({failed/total*100:.1f}%)")
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for r in test_results:
            if not r["passed"]:
                print(f"  • {r['test']}")
                if r["message"]:
                    print(f"    → {r['message']}")
    
    print("\n✅ PASSED TESTS:")
    for r in test_results:
        if r["passed"]:
            latency_str = f" ({r['latency']:.3f}s)" if r["latency"] else ""
            print(f"  • {r['test']}{latency_str}")
    
    # Check latency requirements
    print("\n⏱️  LATENCY ANALYSIS:")
    ai_tests = [r for r in test_results if "ai-summary" in r["test"].lower() and r["latency"]]
    other_tests = [r for r in test_results if "ai-summary" not in r["test"].lower() and r["latency"]]
    
    if ai_tests:
        avg_ai = sum(r["latency"] for r in ai_tests) / len(ai_tests)
        max_ai = max(r["latency"] for r in ai_tests)
        print(f"  AI Summary endpoints: avg={avg_ai:.2f}s, max={max_ai:.2f}s (requirement: <15s)")
    
    if other_tests:
        avg_other = sum(r["latency"] for r in other_tests) / len(other_tests)
        max_other = max(r["latency"] for r in other_tests)
        print(f"  Other endpoints: avg={avg_other:.2f}s, max={max_other:.2f}s (requirement: <2s)")
    
    print("\n" + "="*80)

def main():
    """Main test execution"""
    print("="*80)
    print("TSKFLOW BACKEND REGRESSION TEST SUITE")
    print("July 2025 Continuation Batch")
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
        print("❌ CRITICAL: Alice login failed. Cannot proceed with mentions tests.")
        alice_token = None
        alice_user = None
    else:
        print(f"✓ Alice logged in: {alice_user.get('name')} ({alice_user.get('email')})")
    
    # Run tests
    task_id = test_ai_summary_endpoints(owner_token, owner_user)
    test_standalone_recording(owner_token)
    test_mentionable_users(owner_token)
    
    if alice_token and alice_user:
        test_mentions_notifications(owner_token, owner_user, alice_token, alice_user, task_id)
    else:
        print("\n⚠️  Skipping mentions notifications tests (alice login failed)")
    
    test_regression_sanity(owner_token, owner_user, alice_user if alice_user else owner_user)
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
