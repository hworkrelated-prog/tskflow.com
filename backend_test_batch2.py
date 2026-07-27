#!/usr/bin/env python3
"""
Backend Regression + New Feature Test Suite for Tskflow July 2025 Batch #2 (13-feature rollup)
Tests all new endpoints and regression sanity checks
"""

import requests
import json
import time
import websocket
from datetime import datetime, timedelta

# Configuration
BASE_URL = "http://localhost:8001/api"
WS_URL = "ws://localhost:8001/api/ws"
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

def test_notification_center(owner_token, owner_user, alice_token, alice_user):
    """Test Notification Center endpoints"""
    print("\n=== Testing Notification Center ===")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    alice_headers = {"Authorization": f"Bearer {alice_token}"}
    
    # Create a task assigned to alice
    print("  Creating task for alice...")
    try:
        task_response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "Notification Test Task",
                "description": "Testing notification center",
                "assigned_to": alice_user["id"],
                "due_date": (datetime.now() + timedelta(days=3)).isoformat(),
                "priority": "Medium"
            },
            headers=owner_headers,
            timeout=5
        )
        if task_response.status_code == 200:
            task_data = task_response.json()
            task_id = task_data.get("id")
            print(f"  ✓ Task created: {task_id}")
        else:
            print(f"  ✗ Task creation failed")
            return
    except Exception as e:
        print(f"  ✗ Task creation error: {e}")
        return
    
    # Post a comment with mention
    test_name = "POST comment with @alice mention"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/{task_id}/comments",
            json={
                "content": f"@alice heads up on this task",
                "mentions": [alice_user["id"]]
            },
            headers=owner_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            log_test(test_name, True, "Comment with mention created", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Wait for notification to be created
    time.sleep(0.5)
    
    # Test 1: GET /api/notifications as alice
    test_name = "GET /api/notifications (should have unread mention)"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/notifications",
            headers=alice_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "notifications" in data and "unread" in data:
                notifications = data["notifications"]
                unread_count = data["unread"]
                if unread_count >= 1 and len(notifications) > 0:
                    first_notif = notifications[0]
                    if first_notif.get("type") == "mention":
                        log_test(test_name, True, f"Found {unread_count} unread notification(s), first is mention type", latency)
                        test_notification_center.notif_id = first_notif.get("id")
                    else:
                        log_test(test_name, False, f"First notification type is {first_notif.get('type')}, expected 'mention'", latency)
                else:
                    log_test(test_name, False, f"Expected unread >= 1, got {unread_count}", latency)
            else:
                log_test(test_name, False, "Missing 'notifications' or 'unread' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: POST /api/notifications/{id}/read
    if hasattr(test_notification_center, 'notif_id'):
        test_name = "POST /api/notifications/{id}/read"
        try:
            start = time.time()
            response = requests.post(
                f"{BASE_URL}/notifications/{test_notification_center.notif_id}/read",
                headers=alice_headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                # Verify unread count decreased
                check_response = requests.get(f"{BASE_URL}/notifications", headers=alice_headers, timeout=5)
                if check_response.status_code == 200:
                    check_data = check_response.json()
                    new_unread = check_data.get("unread", 0)
                    log_test(test_name, True, f"Marked as read, unread count now: {new_unread}", latency)
                else:
                    log_test(test_name, True, "Marked as read (verification failed)", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: POST /api/notifications/mark-all-read
    test_name = "POST /api/notifications/mark-all-read"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/notifications/mark-all-read",
            headers=alice_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            # Verify unread count is 0
            check_response = requests.get(f"{BASE_URL}/notifications", headers=alice_headers, timeout=5)
            if check_response.status_code == 200:
                check_data = check_response.json()
                unread = check_data.get("unread", -1)
                if unread == 0:
                    log_test(test_name, True, "All notifications marked as read, unread count = 0", latency)
                else:
                    log_test(test_name, False, f"Expected unread = 0, got {unread}", latency)
            else:
                log_test(test_name, True, "Marked all as read (verification failed)", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_leaderboards(owner_token):
    """Test Leaderboard endpoints"""
    print("\n=== Testing Leaderboards ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # Test 1: GET /api/leaderboard/personal
    test_name = "GET /api/leaderboard/personal"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/leaderboard/personal?start_date=2025-01-01&end_date=2025-12-31",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "leaderboard" in data:
                leaderboard = data["leaderboard"]
                if isinstance(leaderboard, list):
                    if len(leaderboard) > 0:
                        row = leaderboard[0]
                        required_fields = ["user_id", "name", "email", "completed", "avg_completion_hours", "avg_response_hours", "rank"]
                        missing = [f for f in required_fields if f not in row]
                        if not missing:
                            log_test(test_name, True, f"Leaderboard with {len(leaderboard)} entries, all fields present", latency)
                        else:
                            log_test(test_name, False, f"Missing fields: {missing}", latency)
                    else:
                        log_test(test_name, True, "Leaderboard returned (empty)", latency)
                else:
                    log_test(test_name, False, "Leaderboard is not a list", latency)
            else:
                log_test(test_name, False, "Missing 'leaderboard' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: GET /api/leaderboard/org
    test_name = "GET /api/leaderboard/org"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/leaderboard/org?start_date=2025-01-01&end_date=2025-12-31",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "leaderboard" in data and "scope" in data:
                leaderboard = data["leaderboard"]
                if isinstance(leaderboard, list):
                    if len(leaderboard) > 0:
                        row = leaderboard[0]
                        required_fields = ["user_id", "name", "email", "completed", "avg_completion_hours", "avg_response_hours", "performance_score", "rank"]
                        missing = [f for f in required_fields if f not in row]
                        if not missing:
                            log_test(test_name, True, f"Org leaderboard with {len(leaderboard)} entries, includes performance_score", latency)
                        else:
                            log_test(test_name, False, f"Missing fields: {missing}", latency)
                    else:
                        log_test(test_name, True, "Org leaderboard returned (empty)", latency)
                else:
                    log_test(test_name, False, "Leaderboard is not a list", latency)
            else:
                log_test(test_name, False, "Missing 'leaderboard' or 'scope' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_personal_analytics(owner_token):
    """Test Personal Analytics endpoint"""
    print("\n=== Testing Personal Analytics ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    test_name = "POST /api/analytics/personal"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/analytics/personal",
            json={
                "start_date": "2025-01-01",
                "end_date": "2025-12-31"
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ["total", "completed", "pending", "overdue", "completion_rate", "assignee_breakdown"]
            missing = [f for f in required_fields if f not in data]
            if not missing:
                breakdown = data["assignee_breakdown"]
                if isinstance(breakdown, list):
                    log_test(test_name, True, f"Personal analytics returned with {len(breakdown)} assignees", latency)
                else:
                    log_test(test_name, False, "assignee_breakdown is not a list", latency)
            else:
                log_test(test_name, False, f"Missing fields: {missing}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_ai_summary_v2(owner_token):
    """Test AI Summary v2 endpoint"""
    print("\n=== Testing AI Summary v2 ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    test_name = "POST /api/dashboard/ai-summary-v2"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/dashboard/ai-summary-v2",
            json={
                "view_mode": "active",
                "date_filter": "all"
            },
            headers=headers,
            timeout=20
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "stats" in data and "summary" in data:
                stats = data["stats"]
                required_stats = ["urgent_high_count", "due_in_hours_count", "due_today_count", "overdue_count", "total"]
                missing = [f for f in required_stats if f not in stats]
                if not missing:
                    if latency < 15:
                        log_test(test_name, True, f"AI summary v2 returned with stats and summary (latency OK)", latency)
                    else:
                        log_test(test_name, False, f"Latency too high: {latency:.2f}s (>15s)", latency)
                else:
                    log_test(test_name, False, f"Missing stats fields: {missing}", latency)
            else:
                log_test(test_name, False, "Missing 'stats' or 'summary' field", latency)
        elif response.status_code == 500:
            log_test(test_name, False, "500 error - should return graceful fallback when EMERGENT_LLM_KEY missing", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_group_subtasks(owner_token, owner_user, alice_user):
    """Test Group Subtasks endpoint"""
    print("\n=== Testing Group Subtasks ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # Create a group task first
    print("  Creating group task...")
    try:
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Group Task for Subtasks Test",
                "description": "Testing subtasks endpoint",
                "assigned_to": [alice_user["id"], owner_user["id"]],
                "due_date": (datetime.now() + timedelta(days=5)).isoformat(),
                "priority": "Medium"
            },
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            # Get parent_id from parents list
            parents_response = requests.get(
                f"{BASE_URL}/tasks/parents?status_filter=active",
                headers=headers,
                timeout=5
            )
            if parents_response.status_code == 200:
                parents = parents_response.json()
                if len(parents) > 0:
                    parent_id = parents[0]["id"]
                    print(f"  ✓ Group task created: {parent_id}")
                    
                    # Test GET /api/tasks/parents/{parent_id}/subtasks
                    test_name = "GET /api/tasks/parents/{parent_id}/subtasks"
                    try:
                        start = time.time()
                        response = requests.get(
                            f"{BASE_URL}/tasks/parents/{parent_id}/subtasks",
                            headers=headers,
                            timeout=5
                        )
                        latency = time.time() - start
                        
                        if response.status_code == 200:
                            subtasks = response.json()
                            if isinstance(subtasks, list) and len(subtasks) > 0:
                                # Check if assigned_to_name is enriched
                                first_subtask = subtasks[0]
                                if "assigned_to_name" in first_subtask:
                                    log_test(test_name, True, f"Subtasks returned with {len(subtasks)} entries, assigned_to_name enriched", latency)
                                else:
                                    log_test(test_name, False, "Missing assigned_to_name field", latency)
                            else:
                                log_test(test_name, False, "Empty subtasks list or not a list", latency)
                        else:
                            log_test(test_name, False, f"Status {response.status_code}", latency)
                    except Exception as e:
                        log_test(test_name, False, f"Exception: {str(e)}")
                else:
                    log_test("GET /api/tasks/parents/{parent_id}/subtasks", False, "No parent tasks found")
            else:
                log_test("GET /api/tasks/parents/{parent_id}/subtasks", False, "Could not fetch parent tasks")
        else:
            log_test("GET /api/tasks/parents/{parent_id}/subtasks", False, "Group task creation failed")
    except Exception as e:
        log_test("GET /api/tasks/parents/{parent_id}/subtasks", False, f"Exception: {str(e)}")

def test_mark_viewed(alice_token, alice_user, owner_token):
    """Test Mark Viewed endpoint"""
    print("\n=== Testing Mark Viewed ===")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    alice_headers = {"Authorization": f"Bearer {alice_token}"}
    
    # Create a task assigned to alice
    print("  Creating task for alice...")
    try:
        response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "Mark Viewed Test Task",
                "description": "Testing mark viewed",
                "assigned_to": alice_user["id"],
                "due_date": (datetime.now() + timedelta(days=3)).isoformat(),
                "priority": "Low"
            },
            headers=owner_headers,
            timeout=5
        )
        if response.status_code == 200:
            task_data = response.json()
            task_id = task_data.get("id")
            print(f"  ✓ Task created: {task_id}")
            
            # Test POST /api/tasks/{task_id}/mark-viewed (first call)
            test_name = "POST /api/tasks/{task_id}/mark-viewed (first call)"
            try:
                start = time.time()
                response = requests.post(
                    f"{BASE_URL}/tasks/{task_id}/mark-viewed",
                    headers=alice_headers,
                    timeout=5
                )
                latency = time.time() - start
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("ok") == True:
                        log_test(test_name, True, "Task marked as viewed", latency)
                    else:
                        log_test(test_name, False, "Response ok != true", latency)
                else:
                    log_test(test_name, False, f"Status {response.status_code}", latency)
            except Exception as e:
                log_test(test_name, False, f"Exception: {str(e)}")
            
            # Test POST /api/tasks/{task_id}/mark-viewed (second call - idempotent)
            test_name = "POST /api/tasks/{task_id}/mark-viewed (second call - idempotent)"
            try:
                start = time.time()
                response = requests.post(
                    f"{BASE_URL}/tasks/{task_id}/mark-viewed",
                    headers=alice_headers,
                    timeout=5
                )
                latency = time.time() - start
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("ok") == True:
                        log_test(test_name, True, "Idempotent - still returns ok", latency)
                    else:
                        log_test(test_name, False, "Response ok != true", latency)
                else:
                    log_test(test_name, False, f"Status {response.status_code}", latency)
            except Exception as e:
                log_test(test_name, False, f"Exception: {str(e)}")
        else:
            log_test("POST /api/tasks/{task_id}/mark-viewed", False, "Task creation failed")
    except Exception as e:
        log_test("POST /api/tasks/{task_id}/mark-viewed", False, f"Exception: {str(e)}")

def test_transcript_drafts(owner_token, alice_user):
    """Test Transcript → Drafts endpoints"""
    print("\n=== Testing Transcript → Drafts ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # Test 1: POST /api/task-drafts/from-transcript
    test_name = "POST /api/task-drafts/from-transcript"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/task-drafts/from-transcript",
            json={
                "text": "- John will send the proposal by Friday.\n- Sarah to schedule kickoff next week."
            },
            headers=headers,
            timeout=30
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "drafts" in data:
                drafts = data["drafts"]
                if isinstance(drafts, list) and len(drafts) > 0:
                    draft = drafts[0]
                    required_fields = ["id", "title", "description", "priority", "ambiguities", "status"]
                    missing = [f for f in required_fields if f not in draft]
                    if not missing:
                        if draft.get("status") == "Draft":
                            log_test(test_name, True, f"Created {len(drafts)} draft(s), status='Draft'", latency)
                            test_transcript_drafts.draft_ids = [d["id"] for d in drafts]
                        else:
                            log_test(test_name, False, f"Status is {draft.get('status')}, expected 'Draft'", latency)
                    else:
                        log_test(test_name, False, f"Missing fields: {missing}", latency)
                else:
                    log_test(test_name, False, "Empty drafts list or not a list", latency)
            else:
                log_test(test_name, False, "Missing 'drafts' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: GET /api/task-drafts
    test_name = "GET /api/task-drafts"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/task-drafts",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "drafts" in data:
                drafts = data["drafts"]
                if isinstance(drafts, list):
                    log_test(test_name, True, f"Retrieved {len(drafts)} draft(s)", latency)
                else:
                    log_test(test_name, False, "Drafts is not a list", latency)
            else:
                log_test(test_name, False, "Missing 'drafts' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: POST /api/task-drafts/{id}/publish
    if hasattr(test_transcript_drafts, 'draft_ids') and len(test_transcript_drafts.draft_ids) > 0:
        draft_id = test_transcript_drafts.draft_ids[0]
        test_name = "POST /api/task-drafts/{id}/publish"
        try:
            start = time.time()
            response = requests.post(
                f"{BASE_URL}/task-drafts/{draft_id}/publish",
                json={
                    "title": "Published Draft Task",
                    "description": "This was a draft, now published",
                    "assigned_to": alice_user["id"],
                    "due_date": "2026-01-15",
                    "priority": "Medium"
                },
                headers=headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                if data.get("ok") == True and "task_id" in data:
                    task_id = data["task_id"]
                    # Verify task was created
                    verify_response = requests.get(
                        f"{BASE_URL}/tasks/{task_id}",
                        headers=headers,
                        timeout=5
                    )
                    if verify_response.status_code == 200:
                        log_test(test_name, True, f"Draft published as task {task_id}", latency)
                    else:
                        log_test(test_name, False, f"Task {task_id} not found after publish", latency)
                else:
                    log_test(test_name, False, "Missing 'ok' or 'task_id' in response", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
        
        # Test 4: DELETE /api/task-drafts/{id}
        if len(test_transcript_drafts.draft_ids) > 1:
            draft_id_to_delete = test_transcript_drafts.draft_ids[1]
            test_name = "DELETE /api/task-drafts/{id}"
            try:
                start = time.time()
                response = requests.delete(
                    f"{BASE_URL}/task-drafts/{draft_id_to_delete}",
                    headers=headers,
                    timeout=5
                )
                latency = time.time() - start
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("ok") == True:
                        log_test(test_name, True, "Draft deleted successfully", latency)
                    else:
                        log_test(test_name, False, "Response ok != true", latency)
                else:
                    log_test(test_name, False, f"Status {response.status_code}", latency)
            except Exception as e:
                log_test(test_name, False, f"Exception: {str(e)}")

def test_product_updates(owner_token):
    """Test Product Updates endpoint"""
    print("\n=== Testing Product Updates ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    test_name = "GET /api/product-updates (should return exactly 13 entries)"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/product-updates",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "updates" in data:
                updates = data["updates"]
                if isinstance(updates, list):
                    if len(updates) == 13:
                        # Check structure of first update
                        if len(updates) > 0:
                            update = updates[0]
                            required_fields = ["id", "area", "change", "was"]
                            missing = [f for f in required_fields if f not in update]
                            if not missing:
                                log_test(test_name, True, f"Returned exactly 13 updates with all required fields", latency)
                            else:
                                log_test(test_name, False, f"Missing fields in update: {missing}", latency)
                        else:
                            log_test(test_name, False, "Updates list is empty", latency)
                    else:
                        log_test(test_name, False, f"Expected 13 updates, got {len(updates)}", latency)
                else:
                    log_test(test_name, False, "Updates is not a list", latency)
            else:
                log_test(test_name, False, "Missing 'updates' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_sales_task_field(owner_token, owner_user, alice_user):
    """Test is_sales_task field on task creation"""
    print("\n=== Testing Sales Task Field ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # Test 1: POST /api/tasks (single) with is_sales_task=true
    test_name = "POST /api/tasks (single) with is_sales_task=true"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "Sales Task Test",
                "description": "Testing sales task field",
                "assigned_to": alice_user["id"],
                "due_date": (datetime.now() + timedelta(days=3)).isoformat(),
                "priority": "High",
                "is_sales_task": True
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("is_sales_task") == True:
                log_test(test_name, True, "Task created with is_sales_task=true", latency)
            else:
                log_test(test_name, False, f"is_sales_task is {data.get('is_sales_task')}, expected True", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: POST /api/tasks (single) without is_sales_task
    test_name = "POST /api/tasks (single) without is_sales_task (should default to false)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "Non-Sales Task Test",
                "description": "Testing default sales task field",
                "assigned_to": alice_user["id"],
                "due_date": (datetime.now() + timedelta(days=3)).isoformat(),
                "priority": "Medium"
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("is_sales_task") == False:
                log_test(test_name, True, "Task created with is_sales_task=false (default)", latency)
            else:
                log_test(test_name, False, f"is_sales_task is {data.get('is_sales_task')}, expected False", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: POST /api/tasks/bulk with is_sales_task=true
    test_name = "POST /api/tasks/bulk with is_sales_task=true"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Bulk Sales Task Test",
                "description": "Testing bulk sales task",
                "assigned_to": [alice_user["id"], owner_user["id"]],
                "due_date": (datetime.now() + timedelta(days=3)).isoformat(),
                "priority": "High",
                "is_sales_task": True
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                # Check if first child task has is_sales_task=true
                first_task = data[0]
                if first_task.get("is_sales_task") == True:
                    log_test(test_name, True, f"Bulk task created with {len(data)} children, is_sales_task=true", latency)
                else:
                    log_test(test_name, False, f"Child task is_sales_task is {first_task.get('is_sales_task')}, expected True", latency)
            else:
                log_test(test_name, False, "Empty response or not a list", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_eod_cron(owner_token):
    """Test EOD Cron endpoint"""
    print("\n=== Testing EOD Cron ===")
    
    test_name = "POST /api/cron/eod-report (no secret if CRON_SECRET unset)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/cron/eod-report",
            timeout=30
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True and "sent" in data:
                sent_count = data["sent"]
                log_test(test_name, True, f"EOD report sent to {sent_count} user(s)", latency)
            else:
                log_test(test_name, False, "Missing 'ok' or 'sent' field", latency)
        elif response.status_code == 401:
            log_test(test_name, False, "401 Unauthorized - CRON_SECRET might be set", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_websocket(owner_token):
    """Test WebSocket endpoint"""
    print("\n=== Testing WebSocket ===")
    
    # Test 1: Connect with valid JWT
    test_name = "WebSocket connect with valid JWT (should accept)"
    try:
        ws = websocket.create_connection(f"{WS_URL}?token={owner_token}", timeout=5)
        # Send ping
        ws.send("ping")
        result = ws.recv()
        if result == "pong":
            log_test(test_name, True, "WebSocket connected and ping/pong working")
        else:
            log_test(test_name, False, f"Expected 'pong', got '{result}'")
        ws.close()
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: Connect with invalid token
    test_name = "WebSocket connect with invalid token (should close with 1008)"
    try:
        ws = websocket.create_connection(f"{WS_URL}?token=badtoken", timeout=5)
        # If we get here, connection was accepted (should not happen)
        ws.close()
        log_test(test_name, False, "Connection accepted with invalid token (should be rejected)")
    except websocket.WebSocketBadStatusException as e:
        # Connection was rejected
        log_test(test_name, True, "Connection rejected with invalid token")
    except Exception as e:
        # Check if it's a close code 1008
        if "1008" in str(e):
            log_test(test_name, True, "Connection closed with code 1008")
        else:
            log_test(test_name, False, f"Unexpected exception: {str(e)}")

def test_regression_sanity(owner_token, owner_user, alice_user):
    """Test Regression Sanity for Existing Endpoints"""
    print("\n=== Testing Regression Sanity ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # Test 1: POST /api/auth/login
    test_name = "POST /api/auth/login"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "access_token" in data and "user" in data:
                log_test(test_name, True, "Login successful", latency)
            else:
                log_test(test_name, False, "Missing access_token or user", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: POST /api/tasks (single)
    test_name = "POST /api/tasks (single) - regression"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "Regression Test Task",
                "description": "Testing regression",
                "assigned_to": alice_user["id"],
                "due_date": (datetime.now() + timedelta(days=3)).isoformat(),
                "priority": "Medium"
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "id" in data:
                log_test(test_name, True, f"Task created: {data['id']}", latency)
                test_regression_sanity.task_id = data["id"]
            else:
                log_test(test_name, False, "Missing id", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: POST /api/tasks/bulk
    test_name = "POST /api/tasks/bulk - regression"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Regression Bulk Task",
                "description": "Testing bulk regression",
                "assigned_to": [alice_user["id"], owner_user["id"]],
                "due_date": (datetime.now() + timedelta(days=3)).isoformat(),
                "priority": "High"
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                log_test(test_name, True, f"Bulk task created with {len(data)} children", latency)
            else:
                log_test(test_name, False, "Empty response or not a list", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 4: GET /api/tasks/parents?status_filter=active
    test_name = "GET /api/tasks/parents?status_filter=active - regression"
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
                log_test(test_name, True, f"Retrieved {len(data)} parent tasks", latency)
                if len(data) > 0:
                    test_regression_sanity.parent_id = data[0]["id"]
            else:
                log_test(test_name, False, "Response is not a list", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 5: GET /api/tasks/{parent_id}/leaderboard
    if hasattr(test_regression_sanity, 'parent_id'):
        test_name = "GET /api/tasks/{parent_id}/leaderboard - regression"
        try:
            start = time.time()
            response = requests.get(
                f"{BASE_URL}/tasks/{test_regression_sanity.parent_id}/leaderboard",
                headers=headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                if "leaderboard" in data:
                    log_test(test_name, True, "Leaderboard retrieved", latency)
                else:
                    log_test(test_name, False, "Missing 'leaderboard' field", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 6: POST /api/tasks/{task_id}/comments (with mentions)
    if hasattr(test_regression_sanity, 'task_id'):
        test_name = "POST /api/tasks/{task_id}/comments (with mentions) - regression"
        try:
            start = time.time()
            response = requests.post(
                f"{BASE_URL}/tasks/{test_regression_sanity.task_id}/comments",
                json={
                    "content": "Test comment with @alice mention",
                    "mentions": [alice_user["id"]]
                },
                headers=headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                if "comment" in data:
                    log_test(test_name, True, "Comment with mention created", latency)
                else:
                    log_test(test_name, False, "Missing 'comment' field", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
        
        # Test 7: GET /api/tasks/{task_id}/comments
        test_name = "GET /api/tasks/{task_id}/comments - regression"
        try:
            start = time.time()
            response = requests.get(
                f"{BASE_URL}/tasks/{test_regression_sanity.task_id}/comments",
                headers=headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                comments = response.json()
                if isinstance(comments, list):
                    log_test(test_name, True, f"Retrieved {len(comments)} comment(s)", latency)
                else:
                    log_test(test_name, False, "Response is not a list", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 8: POST /api/analytics
    test_name = "POST /api/analytics - regression"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/analytics",
            json={
                "start_date": "2025-01-01",
                "end_date": "2025-12-31"
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "assignee_breakdown" in data:
                log_test(test_name, True, "Analytics retrieved", latency)
            else:
                log_test(test_name, False, "Missing 'assignee_breakdown' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 9: POST /api/dashboard/ai-summary (v1)
    test_name = "POST /api/dashboard/ai-summary (v1) - regression"
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
                log_test(test_name, True, "AI summary v1 retrieved", latency)
            else:
                log_test(test_name, False, "Missing 'summary' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 10: POST /api/tasks/{task_id}/ai-summary
    if hasattr(test_regression_sanity, 'task_id'):
        test_name = "POST /api/tasks/{task_id}/ai-summary - regression"
        try:
            start = time.time()
            response = requests.post(
                f"{BASE_URL}/tasks/{test_regression_sanity.task_id}/ai-summary",
                headers=headers,
                timeout=20
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                if "summary" in data:
                    log_test(test_name, True, "Task AI summary retrieved", latency)
                else:
                    log_test(test_name, False, "Missing 'summary' field", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 11: POST /api/recordings/standalone (JSON body)
    test_name = "POST /api/recordings/standalone (JSON body) - regression"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recordings/standalone",
            json={"recording_url": "test/regression/recording.webm"},
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "recording_id" in data and "shareable_link" in data:
                log_test(test_name, True, "Recording created", latency)
            else:
                log_test(test_name, False, "Missing recording_id or shareable_link", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 12: GET /api/notifications/pending
    test_name = "GET /api/notifications/pending - regression"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/notifications/pending",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "notifications" in data:
                log_test(test_name, True, "Notifications retrieved", latency)
            else:
                log_test(test_name, False, "Missing 'notifications' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 13: GET /api/users/mentionable
    test_name = "GET /api/users/mentionable - regression"
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
            if isinstance(users, list):
                log_test(test_name, True, f"Retrieved {len(users)} mentionable users", latency)
            else:
                log_test(test_name, False, "Response is not a list", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
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
    
    print("\n" + "="*80)

def main():
    """Main test execution"""
    print("="*80)
    print("TSKFLOW BACKEND TEST SUITE")
    print("July 2025 Batch #2 (13-feature rollup)")
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
        print("❌ CRITICAL: Alice login failed. Cannot proceed with some tests.")
        return
    print(f"✓ Alice logged in: {alice_user.get('name')} ({alice_user.get('email')})")
    
    # Run NEW feature tests
    print("\n" + "="*80)
    print("NEW FEATURES TESTING")
    print("="*80)
    
    test_notification_center(owner_token, owner_user, alice_token, alice_user)
    test_leaderboards(owner_token)
    test_personal_analytics(owner_token)
    test_ai_summary_v2(owner_token)
    test_group_subtasks(owner_token, owner_user, alice_user)
    test_mark_viewed(alice_token, alice_user, owner_token)
    test_transcript_drafts(owner_token, alice_user)
    test_product_updates(owner_token)
    test_sales_task_field(owner_token, owner_user, alice_user)
    test_eod_cron(owner_token)
    test_websocket(owner_token)
    
    # Run REGRESSION tests
    print("\n" + "="*80)
    print("REGRESSION TESTING")
    print("="*80)
    
    test_regression_sanity(owner_token, owner_user, alice_user)
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
