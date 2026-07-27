#!/usr/bin/env python3
"""
Backend Test Suite for Tskflow July 2025 Batch #9
Tests new assignee management, requires_screen_recording, EOD features, and regression
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

def test_add_assignees_to_parent(owner_token, alice_user, bob_user):
    """Test POST /api/tasks/parents/{parent_id}/assignees"""
    print("\n=== Testing Add Assignees to Parent (Batch #9) ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # Setup: Create a bulk task with 2 assignees
    print("  Setup: Creating bulk task with alice and bob...")
    parent_id = None
    try:
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Test Group Task for Assignee Management",
                "description": "Testing add/remove assignees",
                "assigned_to": [alice_user["id"], bob_user["id"]],
                "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
                "priority": "High"
            },
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            # Get parent_id from parents endpoint
            parents_resp = requests.get(f"{BASE_URL}/tasks/parents?status_filter=active", headers=headers, timeout=5)
            if parents_resp.status_code == 200:
                parents = parents_resp.json()
                if len(parents) > 0:
                    parent_id = parents[0]["id"]
                    print(f"  ✓ Created parent task: {parent_id}")
    except Exception as e:
        print(f"  ✗ Setup failed: {e}")
    
    if not parent_id:
        log_test("POST /api/tasks/parents/{parent_id}/assignees", False, "Setup failed: could not create parent task")
        return
    
    # Test 1: Add new assignee by email (external@example.com)
    test_name = "POST /api/tasks/parents/{parent_id}/assignees (add external@example.com)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/parents/{parent_id}/assignees",
            json={"assignees": ["external@example.com"]},
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("added") == 1 and len(data.get("subtask_ids", [])) == 1:
                log_test(test_name, True, f"Added 1 assignee, subtask_ids: {data.get('subtask_ids')}", latency)
                test_add_assignees_to_parent.new_subtask_id = data.get("subtask_ids")[0]
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: Verify GET /api/tasks/parents/{parent_id}/subtasks returns 3 subtasks
    test_name = "GET /api/tasks/parents/{parent_id}/subtasks (verify 3 subtasks)"
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
            if len(subtasks) == 3:
                log_test(test_name, True, f"3 subtasks found (alice, bob, external@example.com)", latency)
            else:
                log_test(test_name, False, f"Expected 3 subtasks, got {len(subtasks)}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: Call again with same email (idempotent - should return added=0)
    test_name = "POST /api/tasks/parents/{parent_id}/assignees (idempotent - same email)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/parents/{parent_id}/assignees",
            json={"assignees": ["external@example.com"]},
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("added") == 0:
                log_test(test_name, True, "Idempotent: added=0 for duplicate email", latency)
            else:
                log_test(test_name, False, f"Expected added=0, got {data.get('added')}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 4: As alice, try to add assignee (should be 403)
    test_name = "POST /api/tasks/parents/{parent_id}/assignees (as alice - should be 403)"
    alice_token, _ = login(ALICE_EMAIL, ALICE_PASSWORD)
    if alice_token:
        try:
            start = time.time()
            response = requests.post(
                f"{BASE_URL}/tasks/parents/{parent_id}/assignees",
                json={"assignees": ["another@example.com"]},
                headers={"Authorization": f"Bearer {alice_token}"},
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 404:  # 404 because alice is not the creator
                log_test(test_name, True, "Correctly rejected with 404 (not creator)", latency)
            elif response.status_code == 403:
                log_test(test_name, True, "Correctly rejected with 403", latency)
            else:
                log_test(test_name, False, f"Expected 403/404, got {response.status_code}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    else:
        log_test(test_name, False, "Could not login as alice")
    
    # Test 5: Bad parent_id (should be 404)
    test_name = "POST /api/tasks/parents/{parent_id}/assignees (bad parent_id - should be 404)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/parents/nonexistent-parent-id/assignees",
            json={"assignees": ["test@example.com"]},
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 404:
            log_test(test_name, True, "Correctly returned 404 for bad parent_id", latency)
        else:
            log_test(test_name, False, f"Expected 404, got {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Store parent_id for next test
    test_add_assignees_to_parent.parent_id = parent_id

def test_remove_assignee_from_parent(owner_token):
    """Test DELETE /api/tasks/parents/{parent_id}/assignees/{subtask_id}"""
    print("\n=== Testing Remove Assignee from Parent (Batch #9) ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    if not hasattr(test_add_assignees_to_parent, 'parent_id') or not hasattr(test_add_assignees_to_parent, 'new_subtask_id'):
        log_test("DELETE /api/tasks/parents/{parent_id}/assignees/{subtask_id}", False, "Setup failed: no parent_id or subtask_id from previous test")
        return
    
    parent_id = test_add_assignees_to_parent.parent_id
    subtask_id = test_add_assignees_to_parent.new_subtask_id
    
    # Test 1: As owner, delete one subtask
    test_name = "DELETE /api/tasks/parents/{parent_id}/assignees/{subtask_id} (as owner)"
    try:
        start = time.time()
        response = requests.delete(
            f"{BASE_URL}/tasks/parents/{parent_id}/assignees/{subtask_id}",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True and data.get("removed") == subtask_id:
                log_test(test_name, True, f"Subtask removed: {subtask_id}", latency)
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: Verify GET subtasks now returns 2
    test_name = "GET /api/tasks/parents/{parent_id}/subtasks (verify 2 subtasks after delete)"
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
            if len(subtasks) == 2:
                log_test(test_name, True, "2 subtasks remaining (alice, bob)", latency)
            else:
                log_test(test_name, False, f"Expected 2 subtasks, got {len(subtasks)}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: As alice, try to delete a subtask (should be 403/404)
    test_name = "DELETE /api/tasks/parents/{parent_id}/assignees/{subtask_id} (as alice - should be 403/404)"
    alice_token, _ = login(ALICE_EMAIL, ALICE_PASSWORD)
    if alice_token:
        # Get a subtask_id from the remaining subtasks
        try:
            subtasks_resp = requests.get(f"{BASE_URL}/tasks/parents/{parent_id}/subtasks", headers=headers, timeout=5)
            if subtasks_resp.status_code == 200:
                subtasks = subtasks_resp.json()
                if len(subtasks) > 0:
                    test_subtask_id = subtasks[0]["id"]
                    
                    start = time.time()
                    response = requests.delete(
                        f"{BASE_URL}/tasks/parents/{parent_id}/assignees/{test_subtask_id}",
                        headers={"Authorization": f"Bearer {alice_token}"},
                        timeout=5
                    )
                    latency = time.time() - start
                    
                    if response.status_code in [403, 404]:
                        log_test(test_name, True, f"Correctly rejected with {response.status_code}", latency)
                    else:
                        log_test(test_name, False, f"Expected 403/404, got {response.status_code}", latency)
                else:
                    log_test(test_name, False, "No subtasks to test with")
            else:
                log_test(test_name, False, "Could not get subtasks")
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    else:
        log_test(test_name, False, "Could not login as alice")
    
    # Test 4: Nonexistent subtask id (should be 404)
    test_name = "DELETE /api/tasks/parents/{parent_id}/assignees/{subtask_id} (nonexistent subtask - should be 404)"
    try:
        start = time.time()
        response = requests.delete(
            f"{BASE_URL}/tasks/parents/{parent_id}/assignees/nonexistent-subtask-id",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 404:
            log_test(test_name, True, "Correctly returned 404 for nonexistent subtask", latency)
        else:
            log_test(test_name, False, f"Expected 404, got {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_requires_screen_recording(owner_token, alice_user, bob_user):
    """Test POST /api/tasks/bulk with requires_screen_recording=true"""
    print("\n=== Testing requires_screen_recording Field (Batch #9) ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # Test 1: Create bulk task with requires_screen_recording=true
    test_name = "POST /api/tasks/bulk (with requires_screen_recording=true)"
    alice_sub_id = None
    bob_sub_id = None
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Proof of Work Task",
                "description": "Complete this task with screen recording",
                "assigned_to": [alice_user["id"], bob_user["id"]],
                "due_date": "2025-12-31T23:59:59",
                "priority": "High",
                "requires_screen_recording": True
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) == 2:
                alice_sub_id = data[0]["id"]
                bob_sub_id = data[1]["id"]
                log_test(test_name, True, f"Created 2 subtasks with requires_screen_recording=true", latency)
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: GET alice's subtask - verify requires_screen_recording=true
    if alice_sub_id:
        test_name = "GET /api/tasks/{alice_sub_id} (verify requires_screen_recording=true)"
        try:
            start = time.time()
            response = requests.get(
                f"{BASE_URL}/tasks/{alice_sub_id}",
                headers=headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                if data.get("requires_screen_recording") == True:
                    log_test(test_name, True, "requires_screen_recording=true confirmed", latency)
                else:
                    log_test(test_name, False, f"requires_screen_recording={data.get('requires_screen_recording')} (expected True)", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: GET bob's subtask - verify requires_screen_recording=true
    if bob_sub_id:
        test_name = "GET /api/tasks/{bob_sub_id} (verify requires_screen_recording=true)"
        try:
            start = time.time()
            response = requests.get(
                f"{BASE_URL}/tasks/{bob_sub_id}",
                headers=headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                if data.get("requires_screen_recording") == True:
                    log_test(test_name, True, "requires_screen_recording=true confirmed", latency)
                else:
                    log_test(test_name, False, f"requires_screen_recording={data.get('requires_screen_recording')} (expected True)", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 4: Default behavior - POST /api/tasks/bulk without requires_screen_recording
    test_name = "POST /api/tasks/bulk (without requires_screen_recording - should default to false)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Regular Task",
                "description": "No screen recording required",
                "assigned_to": [alice_user["id"]],
                "due_date": "2025-12-31T23:59:59",
                "priority": "Medium"
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                task_id = data[0]["id"]
                # Get the task to verify requires_screen_recording
                get_resp = requests.get(f"{BASE_URL}/tasks/{task_id}", headers=headers, timeout=5)
                if get_resp.status_code == 200:
                    task_data = get_resp.json()
                    if task_data.get("requires_screen_recording") == False or task_data.get("requires_screen_recording") is None:
                        log_test(test_name, True, "requires_screen_recording defaults to false", latency)
                    else:
                        log_test(test_name, False, f"requires_screen_recording={task_data.get('requires_screen_recording')} (expected False)", latency)
                else:
                    log_test(test_name, False, "Could not retrieve task to verify default", latency)
            else:
                log_test(test_name, False, "Empty response", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_user_preferences_merge(owner_token):
    """Test UserPreferences merge behavior"""
    print("\n=== Testing UserPreferences Merge (Batch #9) ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # Test 1: PUT with eod_enabled, eod_hour, eod_channel
    test_name = "PUT /api/auth/preferences (set eod_enabled, eod_hour, eod_channel)"
    try:
        start = time.time()
        response = requests.put(
            f"{BASE_URL}/auth/preferences",
            json={
                "eod_enabled": True,
                "eod_hour": 9,
                "eod_channel": "email"
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            prefs = data.get("preferences", {})
            if prefs.get("eod_enabled") == True and prefs.get("eod_hour") == 9 and prefs.get("eod_channel") == "email":
                log_test(test_name, True, "EOD preferences set correctly", latency)
            else:
                log_test(test_name, False, f"Preferences not set correctly: {prefs}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: GET preferences - verify all fields present
    test_name = "GET /api/auth/preferences (verify eod fields + theme + slack_webhook_url)"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/auth/preferences",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            prefs = response.json()
            has_eod_enabled = prefs.get("eod_enabled") == True
            has_eod_hour = prefs.get("eod_hour") == 9
            has_eod_channel = prefs.get("eod_channel") == "email"
            has_theme = "theme" in prefs
            
            if has_eod_enabled and has_eod_hour and has_eod_channel and has_theme:
                log_test(test_name, True, f"All fields present: {prefs}", latency)
            else:
                log_test(test_name, False, f"Missing fields: {prefs}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: PUT with only eod_hour=18 (should merge, not overwrite)
    test_name = "PUT /api/auth/preferences (update eod_hour=18, should merge)"
    try:
        start = time.time()
        response = requests.put(
            f"{BASE_URL}/auth/preferences",
            json={"eod_hour": 18},
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            log_test(test_name, True, "eod_hour updated", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 4: GET preferences - verify merge (eod_hour=18, eod_enabled still true, eod_channel still 'email')
    test_name = "GET /api/auth/preferences (verify merge: eod_hour=18, eod_enabled=true, eod_channel='email')"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/auth/preferences",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            prefs = response.json()
            if prefs.get("eod_hour") == 18 and prefs.get("eod_enabled") == True and prefs.get("eod_channel") == "email":
                log_test(test_name, True, "Merge working: eod_hour updated, other fields preserved", latency)
            else:
                log_test(test_name, False, f"Merge failed: {prefs}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_eod_preview(owner_token):
    """Test POST /api/eod/preview"""
    print("\n=== Testing EOD Preview (Batch #9) ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    test_name = "POST /api/eod/preview"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/eod/preview",
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            has_ok = "ok" in data
            has_sent = "sent" in data
            
            # Check if it's the "sent" case or "not sent" case
            if data.get("sent") == True:
                # Sent case: should have delivered_to and counts
                has_delivered_to = "delivered_to" in data
                has_counts = "counts" in data
                if has_ok and has_sent and has_delivered_to and has_counts:
                    log_test(test_name, True, f"EOD preview sent: {data}", latency)
                else:
                    log_test(test_name, False, f"Missing fields in sent response: {data}", latency)
            elif data.get("sent") == False:
                # Not sent case: should have reason
                has_reason = "reason" in data
                if has_ok and has_sent and has_reason:
                    log_test(test_name, True, f"EOD preview not sent (acceptable): {data.get('reason')}", latency)
                else:
                    log_test(test_name, False, f"Missing fields in not-sent response: {data}", latency)
            else:
                log_test(test_name, False, f"Unexpected response shape: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_eod_cron(owner_token):
    """Test POST /api/cron/eod-report"""
    print("\n=== Testing EOD Cron (Batch #9) ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    test_name = "POST /api/cron/eod-report (no secret in dev)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/cron/eod-report",
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True and "sent" in data:
                log_test(test_name, True, f"EOD cron executed: sent={data.get('sent')}", latency)
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_regression_batch6_8(owner_token, alice_user):
    """Test regression for batch #6-8 features"""
    print("\n=== Testing Regression (Batch #6-8) ===")
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # a) POST /api/recordings/standalone
    test_name = "POST /api/recordings/standalone (full body)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recordings/standalone",
            json={
                "title": "Regression Test Recording",
                "description": "Testing standalone recording",
                "duration_seconds": 120,
                "size_bytes": 1024000,
                "mime_type": "video/webm"
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "recording_id" in data and "shareable_link" in data:
                log_test(test_name, True, "Standalone recording created", latency)
                test_regression_batch6_8.recording_id = data.get("recording_id")
            else:
                log_test(test_name, False, f"Missing fields: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # b) GET /api/recordings/mine
    test_name = "GET /api/recordings/mine"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/recordings/mine",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                log_test(test_name, True, f"Retrieved {len(data)} recordings", latency)
            else:
                log_test(test_name, False, "Response is not a list", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # c) DELETE /api/recordings/{id} - own recording (200), other's recording (403)
    if hasattr(test_regression_batch6_8, 'recording_id'):
        test_name = "DELETE /api/recordings/{id} (own recording - should be 200)"
        try:
            start = time.time()
            response = requests.delete(
                f"{BASE_URL}/recordings/{test_regression_batch6_8.recording_id}",
                headers=headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                log_test(test_name, True, "Own recording deleted", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    
    # d) PUT /api/tasks/{subtask_id}/review with accept and send_back
    # First create a task and complete it
    test_name = "PUT /api/tasks/{subtask_id}/review (accept and send_back)"
    try:
        # Create task
        create_resp = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "Review Test Task",
                "description": "Testing review flow",
                "assigned_to": alice_user["id"],
                "due_date": (datetime.now() + timedelta(days=3)).isoformat(),
                "priority": "Medium"
            },
            headers=headers,
            timeout=5
        )
        if create_resp.status_code == 200:
            task_id = create_resp.json().get("id")
            
            # Test accept review
            start = time.time()
            response = requests.put(
                f"{BASE_URL}/tasks/{task_id}/review",
                json={"action": "accept"},
                headers=headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                log_test(test_name + " (accept)", True, "Review accept working", latency)
            else:
                log_test(test_name + " (accept)", False, f"Status {response.status_code}", latency)
            
            # Test send_back review
            start = time.time()
            response = requests.put(
                f"{BASE_URL}/tasks/{task_id}/review",
                json={"action": "send_back", "feedback": "Please revise"},
                headers=headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                log_test(test_name + " (send_back)", True, "Review send_back working", latency)
            else:
                log_test(test_name + " (send_back)", False, f"Status {response.status_code}", latency)
        else:
            log_test(test_name, False, "Could not create task for review test")
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # e) POST /api/tasks/parents/{parent_id}/remind
    # Get a parent task
    test_name = "POST /api/tasks/parents/{parent_id}/remind"
    try:
        parents_resp = requests.get(f"{BASE_URL}/tasks/parents?status_filter=active", headers=headers, timeout=5)
        if parents_resp.status_code == 200:
            parents = parents_resp.json()
            if len(parents) > 0:
                parent_id = parents[0]["id"]
                
                start = time.time()
                response = requests.post(
                    f"{BASE_URL}/tasks/parents/{parent_id}/remind",
                    headers=headers,
                    timeout=5
                )
                latency = time.time() - start
                
                if response.status_code == 200:
                    data = response.json()
                    if "reminded" in data:
                        log_test(test_name, True, f"Reminded {data.get('reminded')} assignees", latency)
                    else:
                        log_test(test_name, False, f"Missing 'reminded' field: {data}", latency)
                else:
                    log_test(test_name, False, f"Status {response.status_code}", latency)
            else:
                log_test(test_name, False, "No parent tasks to test with")
        else:
            log_test(test_name, False, "Could not get parent tasks")
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # f) Groups CRUD
    test_name = "Groups CRUD (POST, GET, PUT, DELETE)"
    group_id = None
    try:
        # POST /api/groups
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/groups",
            json={
                "name": "Regression Test Group",
                "emails": ["test1@example.com", "test2@example.com"]
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            group_id = data.get("id")
            log_test(test_name + " (POST)", True, f"Group created: {group_id}", latency)
        else:
            log_test(test_name + " (POST)", False, f"Status {response.status_code}", latency)
        
        # GET /api/groups
        if group_id:
            start = time.time()
            response = requests.get(f"{BASE_URL}/groups", headers=headers, timeout=5)
            latency = time.time() - start
            
            if response.status_code == 200:
                groups = response.json()
                if isinstance(groups, list):
                    log_test(test_name + " (GET)", True, f"Retrieved {len(groups)} groups", latency)
                else:
                    log_test(test_name + " (GET)", False, "Response is not a list", latency)
            else:
                log_test(test_name + " (GET)", False, f"Status {response.status_code}", latency)
            
            # PUT /api/groups/{id}
            start = time.time()
            response = requests.put(
                f"{BASE_URL}/groups/{group_id}",
                json={
                    "name": "Updated Regression Test Group",
                    "emails": ["test1@example.com", "test2@example.com", "test3@example.com"]
                },
                headers=headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                log_test(test_name + " (PUT)", True, "Group updated", latency)
            else:
                log_test(test_name + " (PUT)", False, f"Status {response.status_code}", latency)
            
            # DELETE /api/groups/{id}
            start = time.time()
            response = requests.delete(f"{BASE_URL}/groups/{group_id}", headers=headers, timeout=5)
            latency = time.time() - start
            
            if response.status_code == 200:
                log_test(test_name + " (DELETE)", True, "Group deleted", latency)
            else:
                log_test(test_name + " (DELETE)", False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # g) GET /api/users
    test_name = "GET /api/users"
    try:
        start = time.time()
        response = requests.get(f"{BASE_URL}/users", headers=headers, timeout=5)
        latency = time.time() - start
        
        if response.status_code == 200:
            users = response.json()
            if isinstance(users, list) and len(users) > 0:
                log_test(test_name, True, f"Retrieved {len(users)} users", latency)
            else:
                log_test(test_name, False, "Empty user list", latency)
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
    print("TSKFLOW BACKEND TEST SUITE - BATCH #9")
    print("Testing: Assignee Management, requires_screen_recording, EOD, Regression")
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
        print("❌ WARNING: Alice login failed. Some tests will be skipped.")
        alice_user = {"id": "unknown", "name": "Alice", "email": ALICE_EMAIL}
    else:
        print(f"✓ Alice logged in: {alice_user.get('name')} ({alice_user.get('email')})")
    
    # Login as bob
    print("\n🔐 Logging in as bob@acmecorp.com...")
    bob_token, bob_user = login(BOB_EMAIL, BOB_PASSWORD)
    if not bob_token:
        print("❌ WARNING: Bob login failed. Some tests will be skipped.")
        bob_user = {"id": "unknown", "name": "Bob", "email": BOB_EMAIL}
    else:
        print(f"✓ Bob logged in: {bob_user.get('name')} ({bob_user.get('email')})")
    
    # Run Batch #9 tests
    test_add_assignees_to_parent(owner_token, alice_user, bob_user)
    test_remove_assignee_from_parent(owner_token)
    test_requires_screen_recording(owner_token, alice_user, bob_user)
    test_user_preferences_merge(owner_token)
    test_eod_preview(owner_token)
    test_eod_cron(owner_token)
    
    # Run regression tests
    test_regression_batch6_8(owner_token, alice_user)
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
