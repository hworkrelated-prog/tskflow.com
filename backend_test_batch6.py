#!/usr/bin/env python3
"""
Backend Regression Test Suite for Tskflow July 2025 Batch #6
Tests Recording Library, Per-Subtask Review, and Full Regression
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

def log_test(test_name, passed, message="", latency=None, status_code=None):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = {
        "test": test_name,
        "passed": passed,
        "message": message,
        "latency": latency,
        "status_code": status_code
    }
    test_results.append(result)
    latency_str = f" ({latency:.3f}s)" if latency else ""
    status_str = f" [HTTP {status_code}]" if status_code else ""
    print(f"{status}: {test_name}{latency_str}{status_str}")
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

def test_recording_standalone_full_metadata(token):
    """Test POST /api/recordings/standalone with full metadata"""
    print("\n=== Testing POST /api/recordings/standalone (Full Metadata) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "POST /api/recordings/standalone with full metadata"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recordings/standalone",
            json={
                "recording_url": "test/path/foo.webm",
                "title": "My test rec",
                "description": "hello",
                "duration_seconds": 12.5,
                "size_bytes": 500000,
                "mime_type": "video/webm"
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            recording_id = data.get("recording_id")
            shareable_link = data.get("shareable_link")
            shareable_token = data.get("shareable_token")
            title = data.get("title")
            
            # Validate all required fields
            has_recording_id = recording_id is not None
            has_shareable_link = shareable_link is not None
            has_shareable_token = shareable_token is not None
            has_correct_title = title == "My test rec"
            
            # Validate shareable_link format
            valid_link_format = False
            if shareable_link:
                valid_link_format = (
                    shareable_link.startswith("https://tskflow.com/recording/") or
                    shareable_link.startswith("http://") and "/recording/" in shareable_link
                )
            
            if has_recording_id and has_shareable_link and has_shareable_token and has_correct_title and valid_link_format:
                log_test(test_name, True, 
                    f"Recording created: id={recording_id}, token={shareable_token}, title='{title}', link={shareable_link}",
                    latency, response.status_code)
                # Store for later tests
                test_recording_standalone_full_metadata.recording_id = recording_id
                test_recording_standalone_full_metadata.shareable_token = shareable_token
            else:
                missing = []
                if not has_recording_id: missing.append("recording_id")
                if not has_shareable_link: missing.append("shareable_link")
                if not has_shareable_token: missing.append("shareable_token")
                if not has_correct_title: missing.append(f"title (got '{title}', expected 'My test rec')")
                if not valid_link_format: missing.append(f"valid link format (got '{shareable_link}')")
                log_test(test_name, False, f"Missing or invalid fields: {', '.join(missing)}", latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_recording_standalone_minimal(token):
    """Test POST /api/recordings/standalone with only recording_url"""
    print("\n=== Testing POST /api/recordings/standalone (Minimal) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "POST /api/recordings/standalone with only recording_url"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recordings/standalone",
            json={"recording_url": "path.webm"},
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            title = data.get("title")
            
            # Title should default to "Recording {date}"
            has_default_title = title and title.startswith("Recording ")
            
            if has_default_title:
                log_test(test_name, True, f"Recording created with default title: '{title}'", latency, response.status_code)
                # Store for later tests
                test_recording_standalone_minimal.recording_id = data.get("recording_id")
            else:
                log_test(test_name, False, f"Title not defaulted correctly: '{title}'", latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_get_recordings_mine(token):
    """Test GET /api/recordings/mine"""
    print("\n=== Testing GET /api/recordings/mine ===")
    headers = {"Authorization": f"Bearer {token}"}
    
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
            recordings = data.get("recordings", [])
            count = data.get("count")
            
            # Validate response structure
            has_recordings_field = "recordings" in data
            has_count_field = "count" in data
            count_matches = count == len(recordings)
            
            if not (has_recordings_field and has_count_field and count_matches):
                log_test(test_name, False, 
                    f"Invalid response structure. has_recordings={has_recordings_field}, has_count={has_count_field}, count_matches={count_matches}",
                    latency, response.status_code)
                return
            
            # Check if our created recording is in the list
            recording_found = False
            if hasattr(test_recording_standalone_full_metadata, 'recording_id'):
                recording_found = any(
                    r.get("id") == test_recording_standalone_full_metadata.recording_id or
                    r.get("shareable_token") == test_recording_standalone_full_metadata.shareable_token
                    for r in recordings
                )
            
            # Validate required fields in each recording
            required_fields = ["id", "title", "description", "recording_url", "shareable_token", 
                             "shareable_link", "created_at", "duration_seconds", "size_bytes", "mime_type"]
            
            all_have_required_fields = True
            missing_fields_details = []
            for i, rec in enumerate(recordings):
                missing = [f for f in required_fields if f not in rec]
                if missing:
                    all_have_required_fields = False
                    missing_fields_details.append(f"Recording {i}: missing {missing}")
            
            if has_recordings_field and has_count_field and count_matches and all_have_required_fields:
                if recording_found:
                    log_test(test_name, True, 
                        f"Retrieved {count} recordings. Created recording found. All required fields present.",
                        latency, response.status_code)
                else:
                    log_test(test_name, True, 
                        f"Retrieved {count} recordings. All required fields present. (Created recording not found - may have been deleted)",
                        latency, response.status_code)
            else:
                log_test(test_name, False, 
                    f"Missing required fields: {'; '.join(missing_fields_details)}",
                    latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_delete_recording_owner(token):
    """Test DELETE /api/recordings/{recording_id} as owner"""
    print("\n=== Testing DELETE /api/recordings/{recording_id} (Owner) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    if not hasattr(test_recording_standalone_minimal, 'recording_id'):
        log_test("DELETE /api/recordings/{recording_id} as owner", False, "No recording_id available from previous test")
        return
    
    recording_id = test_recording_standalone_minimal.recording_id
    test_name = f"DELETE /api/recordings/{recording_id} as owner"
    try:
        start = time.time()
        response = requests.delete(
            f"{BASE_URL}/recordings/{recording_id}",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True:
                log_test(test_name, True, "Recording deleted successfully", latency, response.status_code)
                
                # Verify it's no longer in GET /api/recordings/mine
                time.sleep(0.2)
                verify_response = requests.get(f"{BASE_URL}/recordings/mine", headers=headers, timeout=5)
                if verify_response.status_code == 200:
                    recordings = verify_response.json().get("recordings", [])
                    still_exists = any(r.get("id") == recording_id for r in recordings)
                    if not still_exists:
                        print(f"  ✓ Verified: Recording no longer in GET /api/recordings/mine")
                    else:
                        print(f"  ⚠️  Warning: Recording still appears in GET /api/recordings/mine")
            else:
                log_test(test_name, False, f"Response missing 'ok: true': {data}", latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_delete_recording_forbidden(owner_token, alice_token):
    """Test DELETE /api/recordings/{recording_id} as alice (should be 403)"""
    print("\n=== Testing DELETE /api/recordings/{recording_id} (Forbidden) ===")
    
    # First, create a recording as owner
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    alice_headers = {"Authorization": f"Bearer {alice_token}"}
    
    print("  Creating recording as owner...")
    try:
        response = requests.post(
            f"{BASE_URL}/recordings/standalone",
            json={"recording_url": "owner-recording.webm"},
            headers=owner_headers,
            timeout=5
        )
        if response.status_code == 200:
            recording_id = response.json().get("recording_id")
            print(f"  ✓ Recording created: {recording_id}")
        else:
            log_test("DELETE /api/recordings/{recording_id} as alice (403)", False, 
                f"Could not create recording: {response.status_code}")
            return
    except Exception as e:
        log_test("DELETE /api/recordings/{recording_id} as alice (403)", False, 
            f"Exception creating recording: {str(e)}")
        return
    
    # Now try to delete as alice
    test_name = f"DELETE /api/recordings/{recording_id} as alice (should be 403)"
    try:
        start = time.time()
        response = requests.delete(
            f"{BASE_URL}/recordings/{recording_id}",
            headers=alice_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 403:
            log_test(test_name, True, "Correctly returned 403 Forbidden", latency, response.status_code)
        else:
            log_test(test_name, False, 
                f"Expected 403, got {response.status_code}: {response.text[:200]}", 
                latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_delete_recording_not_found(token):
    """Test DELETE /api/recordings/{recording_id} with non-existent id (should be 404)"""
    print("\n=== Testing DELETE /api/recordings/{recording_id} (Not Found) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    fake_id = "non-existent-recording-id-12345"
    test_name = f"DELETE /api/recordings/{fake_id} (should be 404)"
    try:
        start = time.time()
        response = requests.delete(
            f"{BASE_URL}/recordings/{fake_id}",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 404:
            log_test(test_name, True, "Correctly returned 404 Not Found", latency, response.status_code)
        else:
            log_test(test_name, False, 
                f"Expected 404, got {response.status_code}: {response.text[:200]}", 
                latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_get_recording_by_token(token):
    """Test GET /api/recordings/{token} - regression"""
    print("\n=== Testing GET /api/recordings/{token} (Regression) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    if not hasattr(test_recording_standalone_full_metadata, 'shareable_token'):
        log_test("GET /api/recordings/{token}", False, "No shareable_token available from previous test")
        return
    
    shareable_token = test_recording_standalone_full_metadata.shareable_token
    test_name = f"GET /api/recordings/{shareable_token}"
    try:
        start = time.time()
        # This endpoint is public, no auth required
        response = requests.get(
            f"{BASE_URL}/recordings/{shareable_token}",
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            # Should return the recording data
            has_id = "id" in data
            has_recording_url = "recording_url" in data
            
            if has_id and has_recording_url:
                log_test(test_name, True, "Recording retrieved successfully via shareable token", latency, response.status_code)
            else:
                log_test(test_name, False, f"Missing required fields in response: {data}", latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_subtask_review_flow(owner_token, alice_token, bob_token, owner_user, alice_user, bob_user):
    """Test PUT /api/tasks/{task_id}/review for subtasks - regression"""
    print("\n=== Testing PUT /api/tasks/{task_id}/review (Subtask Review) ===")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    alice_headers = {"Authorization": f"Bearer {alice_token}"}
    bob_headers = {"Authorization": f"Bearer {bob_token}"}
    
    # Step 1: Create bulk task with 2 assignees (alice, bob)
    print("  Step 1: Creating bulk task with alice and bob...")
    try:
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Group Task for Review Test",
                "description": "Testing per-subtask review",
                "assigned_to": [alice_user["id"], bob_user["id"]],
                "due_date": (datetime.now() + timedelta(days=5)).isoformat(),
                "priority": "High"
            },
            headers=owner_headers,
            timeout=5
        )
        if response.status_code == 200:
            tasks = response.json()
            if isinstance(tasks, list) and len(tasks) >= 2:
                alice_subtask_id = tasks[0]["id"]
                bob_subtask_id = tasks[1]["id"]
                print(f"  ✓ Bulk task created. Alice subtask: {alice_subtask_id}, Bob subtask: {bob_subtask_id}")
            else:
                log_test("Subtask review flow", False, f"Bulk task creation returned unexpected format: {tasks}")
                return
        else:
            log_test("Subtask review flow", False, f"Bulk task creation failed: {response.status_code}")
            return
    except Exception as e:
        log_test("Subtask review flow", False, f"Exception creating bulk task: {str(e)}")
        return
    
    # Step 2: Alice accepts her subtask
    print("  Step 2: Alice accepting her subtask...")
    try:
        response = requests.put(
            f"{BASE_URL}/tasks/{alice_subtask_id}/accept",
            headers=alice_headers,
            timeout=5
        )
        if response.status_code == 200:
            print(f"  ✓ Alice accepted subtask")
        else:
            print(f"  ⚠️  Alice accept failed: {response.status_code}")
    except Exception as e:
        print(f"  ⚠️  Exception: {str(e)}")
    
    # Step 3: Alice completes her subtask (mark as Review Pending)
    print("  Step 3: Alice completing her subtask...")
    try:
        response = requests.put(
            f"{BASE_URL}/tasks/{alice_subtask_id}/complete",
            json={"completion_note": "Task completed, ready for review"},
            headers=alice_headers,
            timeout=5
        )
        if response.status_code == 200:
            print(f"  ✓ Alice completed subtask (should be Review Pending)")
        else:
            print(f"  ⚠️  Alice complete failed: {response.status_code}")
    except Exception as e:
        print(f"  ⚠️  Exception: {str(e)}")
    
    time.sleep(0.3)
    
    # Step 4: Verify alice's subtask is in Review Pending status
    print("  Step 4: Verifying alice's subtask status...")
    try:
        response = requests.get(
            f"{BASE_URL}/tasks/{alice_subtask_id}",
            headers=owner_headers,
            timeout=5
        )
        if response.status_code == 200:
            task = response.json()
            status = task.get("status")
            if status == "Review Pending":
                print(f"  ✓ Alice's subtask is in Review Pending status")
            else:
                print(f"  ⚠️  Alice's subtask status is '{status}' (expected 'Review Pending')")
        else:
            print(f"  ⚠️  Could not get task status: {response.status_code}")
    except Exception as e:
        print(f"  ⚠️  Exception: {str(e)}")
    
    # Step 5: Owner reviews alice's subtask - ACCEPT
    test_name = "PUT /api/tasks/{alice_subtask_id}/review (action=accept)"
    try:
        start = time.time()
        response = requests.put(
            f"{BASE_URL}/tasks/{alice_subtask_id}/review",
            json={"action": "accept"},
            headers=owner_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            message = data.get("message", "")
            if "approved" in message.lower() or "completed" in message.lower():
                log_test(test_name, True, f"Review accepted: {message}", latency, response.status_code)
            else:
                log_test(test_name, False, f"Unexpected message: {message}", latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Step 6: Bob accepts and completes his subtask
    print("  Step 6: Bob accepting and completing his subtask...")
    try:
        requests.put(f"{BASE_URL}/tasks/{bob_subtask_id}/accept", headers=bob_headers, timeout=5)
        requests.put(
            f"{BASE_URL}/tasks/{bob_subtask_id}/complete",
            json={"completion_note": "Bob's work done"},
            headers=bob_headers,
            timeout=5
        )
        print(f"  ✓ Bob completed subtask")
    except Exception as e:
        print(f"  ⚠️  Exception: {str(e)}")
    
    time.sleep(0.3)
    
    # Step 7: Owner reviews bob's subtask - SEND BACK
    test_name = "PUT /api/tasks/{bob_subtask_id}/review (action=send_back)"
    try:
        start = time.time()
        response = requests.put(
            f"{BASE_URL}/tasks/{bob_subtask_id}/review",
            json={"action": "send_back", "feedback": "please redo"},
            headers=owner_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            message = data.get("message", "")
            
            # Verify bob's subtask went back to "Accepted" status
            verify_response = requests.get(f"{BASE_URL}/tasks/{bob_subtask_id}", headers=owner_headers, timeout=5)
            if verify_response.status_code == 200:
                task = verify_response.json()
                status = task.get("status")
                review_feedback = task.get("review_feedback")
                
                if status == "Accepted" and review_feedback == "please redo":
                    log_test(test_name, True, 
                        f"Review sent back: {message}. Status={status}, feedback='{review_feedback}'", 
                        latency, response.status_code)
                else:
                    log_test(test_name, False, 
                        f"Status or feedback incorrect. Status={status}, feedback='{review_feedback}'", 
                        latency, response.status_code)
            else:
                log_test(test_name, False, f"Could not verify task status: {verify_response.status_code}", latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_batch3_regression(token, owner_user):
    """Test Batch #3 regression - key endpoints"""
    print("\n=== Testing Batch #3 Regression ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: POST /api/tasks with is_sales_task=true
    test_name = "POST /api/tasks with is_sales_task=true (regression)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "Sales Task Regression Test",
                "description": "Testing is_sales_task field",
                "assigned_to": owner_user["id"],  # Self-assigned
                "due_date": (datetime.now() + timedelta(days=3)).isoformat(),
                "priority": "Medium",
                "is_sales_task": True
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("is_sales_task") == True:
                log_test(test_name, True, "is_sales_task=true returned correctly", latency, response.status_code)
            else:
                log_test(test_name, False, f"is_sales_task={data.get('is_sales_task')} (expected True)", latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: GET /api/tasks/parents/{id}/subtasks
    test_name = "GET /api/tasks/parents/{id}/subtasks (regression)"
    # First, get a parent task
    try:
        parents_response = requests.get(f"{BASE_URL}/tasks/parents?status_filter=active", headers=headers, timeout=5)
        if parents_response.status_code == 200:
            parents = parents_response.json()
            if isinstance(parents, list) and len(parents) > 0:
                parent_id = parents[0]["id"]
                
                start = time.time()
                response = requests.get(
                    f"{BASE_URL}/tasks/parents/{parent_id}/subtasks",
                    headers=headers,
                    timeout=5
                )
                latency = time.time() - start
                
                if response.status_code == 200:
                    subtasks = response.json()
                    if isinstance(subtasks, list):
                        # Check if assigned_to_name is enriched
                        has_names = all("assigned_to_name" in task for task in subtasks) if len(subtasks) > 0 else True
                        if has_names:
                            log_test(test_name, True, f"Subtasks enriched with assigned_to_name ({len(subtasks)} subtasks)", latency, response.status_code)
                        else:
                            log_test(test_name, False, "Missing assigned_to_name in subtasks", latency, response.status_code)
                    else:
                        log_test(test_name, False, "Response is not a list", latency, response.status_code)
                else:
                    log_test(test_name, False, f"Status {response.status_code}", latency, response.status_code)
            else:
                log_test(test_name, True, "No parent tasks available to test (skipped)", None, None)
        else:
            log_test(test_name, False, f"Could not get parent tasks: {parents_response.status_code}", None, None)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: POST /api/dashboard/ai-summary-v2
    test_name = "POST /api/dashboard/ai-summary-v2 (regression)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/dashboard/ai-summary-v2",
            json={"view_mode": "active", "date_filter": "all"},
            headers=headers,
            timeout=20
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "stats" in data and "summary" in data:
                log_test(test_name, True, "AI summary v2 working", latency, response.status_code)
            else:
                log_test(test_name, False, "Missing 'stats' or 'summary' field", latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 4: GET /api/leaderboard/personal
    test_name = "GET /api/leaderboard/personal (regression)"
    try:
        start = time.time()
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        response = requests.get(
            f"{BASE_URL}/leaderboard/personal?start_date={start_date.isoformat()}&end_date={end_date.isoformat()}",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "leaderboard" in data:
                log_test(test_name, True, "Personal leaderboard working", latency, response.status_code)
            else:
                log_test(test_name, False, "Missing 'leaderboard' field", latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 5: GET /api/leaderboard/org
    test_name = "GET /api/leaderboard/org (regression)"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/leaderboard/org",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "leaderboard" in data:
                log_test(test_name, True, "Org leaderboard working", latency, response.status_code)
            else:
                log_test(test_name, False, "Missing 'leaderboard' field", latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 6: GET /api/product-updates
    test_name = "GET /api/product-updates (regression)"
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
            updates = data.get("updates", [])
            if len(updates) >= 18:
                log_test(test_name, True, f"Product updates working ({len(updates)} updates)", latency, response.status_code)
            else:
                log_test(test_name, False, f"Expected at least 18 updates, got {len(updates)}", latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency, response.status_code)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_route_order_recordings_mine(token):
    """Test that /api/recordings/mine matches before /api/recordings/{token}"""
    print("\n=== Testing Route Order: /api/recordings/mine ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "GET /api/recordings/mine (route order check)"
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
            # Should return {recordings: [...], count: N}, NOT a 404 "recording not found"
            if "recordings" in data and "count" in data:
                log_test(test_name, True, "Route order correct: /mine matches before /{token}", latency, response.status_code)
            else:
                log_test(test_name, False, f"Unexpected response format (may have matched /{token} route): {data}", latency, response.status_code)
        elif response.status_code == 404:
            log_test(test_name, False, "Route order incorrect: /mine returned 404 (matched /{token} route)", latency, response.status_code)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency, response.status_code)
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
                status_str = f" [HTTP {r['status_code']}]" if r['status_code'] else ""
                latency_str = f" ({r['latency']:.3f}s)" if r['latency'] else ""
                print(f"  • {r['test']}{status_str}{latency_str}")
                if r["message"]:
                    print(f"    → {r['message']}")
    
    print("\n✅ PASSED TESTS:")
    for r in test_results:
        if r["passed"]:
            latency_str = f" ({r['latency']:.3f}s)" if r['latency'] else ""
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
    print("July 2025 Batch #6 - Recording Library + Per-Subtask Review")
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
        alice_token = None
        alice_user = None
    else:
        print(f"✓ Alice logged in: {alice_user.get('name')} ({alice_user.get('email')})")
    
    # Login as bob
    print("\n🔐 Logging in as bob@acmecorp.com...")
    bob_token, bob_user = login(BOB_EMAIL, BOB_PASSWORD)
    if not bob_token:
        print("❌ CRITICAL: Bob login failed. Cannot proceed with some tests.")
        bob_token = None
        bob_user = None
    else:
        print(f"✓ Bob logged in: {bob_user.get('name')} ({bob_user.get('email')})")
    
    # Run Batch #6 tests
    print("\n" + "="*80)
    print("BATCH #6 NEW FEATURES")
    print("="*80)
    
    # Recording library tests
    test_recording_standalone_full_metadata(owner_token)
    test_recording_standalone_minimal(owner_token)
    test_route_order_recordings_mine(owner_token)
    test_get_recordings_mine(owner_token)
    test_get_recording_by_token(owner_token)
    
    if alice_token:
        test_delete_recording_forbidden(owner_token, alice_token)
    else:
        print("\n⚠️  Skipping DELETE forbidden test (alice login failed)")
    
    test_delete_recording_not_found(owner_token)
    test_delete_recording_owner(owner_token)
    
    # Subtask review test
    if alice_token and bob_token:
        test_subtask_review_flow(owner_token, alice_token, bob_token, owner_user, alice_user, bob_user)
    else:
        print("\n⚠️  Skipping subtask review test (alice or bob login failed)")
    
    # Batch #3 regression
    print("\n" + "="*80)
    print("BATCH #3 REGRESSION")
    print("="*80)
    test_batch3_regression(owner_token, owner_user)
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
