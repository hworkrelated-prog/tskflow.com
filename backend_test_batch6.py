#!/usr/bin/env python3
"""
Backend Regression Test Suite for Tskflow July 2025 Batch #6
Tests Recording Library + Per-Subtask Review
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

def test_recordings_standalone(token):
    """Test POST /api/recordings/standalone with full metadata and minimal body"""
    print("\n=== Testing POST /api/recordings/standalone ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1a: Full body with all metadata
    test_name = "POST /api/recordings/standalone (full metadata)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recordings/standalone",
            json={
                "recording_url": "test.webm",
                "title": "My rec",
                "description": "hi",
                "duration_seconds": 15,
                "size_bytes": 123456,
                "mime_type": "video/webm"
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            has_recording_id = "recording_id" in data
            has_shareable_link = "shareable_link" in data
            has_shareable_token = "shareable_token" in data
            has_title = data.get("title") == "My rec"
            
            if has_recording_id and has_shareable_link and has_shareable_token and has_title:
                log_test(test_name, True, f"All fields present. recording_id={data['recording_id']}, title={data['title']}", latency)
                # Store for later tests
                test_recordings_standalone.recording1_id = data["recording_id"]
                test_recordings_standalone.recording1_token = data["shareable_token"]
            else:
                log_test(test_name, False, f"Missing fields. Data: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 1b: Minimal body (just recording_url)
    test_name = "POST /api/recordings/standalone (minimal body - auto-generated title)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recordings/standalone",
            json={"recording_url": "test2.webm"},
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            has_recording_id = "recording_id" in data
            has_title = "title" in data and data["title"] != ""
            title_auto_generated = "Recording" in data.get("title", "")
            
            if has_recording_id and has_title and title_auto_generated:
                log_test(test_name, True, f"Title auto-generated: {data['title']}", latency)
                # Store for later tests
                test_recordings_standalone.recording2_id = data["recording_id"]
                test_recordings_standalone.recording2_token = data["shareable_token"]
            else:
                log_test(test_name, False, f"Title not auto-generated correctly. Data: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_recordings_mine(token):
    """Test GET /api/recordings/mine"""
    print("\n=== Testing GET /api/recordings/mine ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "GET /api/recordings/mine (verify both recordings present)"
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
            has_recordings = "recordings" in data
            has_count = "count" in data
            
            if not (has_recordings and has_count):
                log_test(test_name, False, f"Missing 'recordings' or 'count' field. Data: {data}", latency)
                return
            
            recordings = data["recordings"]
            count = data["count"]
            
            # Check if both recordings from step 1 are present
            recording1_found = False
            recording2_found = False
            
            for rec in recordings:
                # Check all required fields
                required_fields = ["id", "title", "description", "recording_url", "shareable_token", 
                                   "shareable_link", "created_at", "duration_seconds", "size_bytes", "mime_type"]
                missing_fields = [f for f in required_fields if f not in rec]
                
                if missing_fields:
                    log_test(test_name, False, f"Recording missing fields: {missing_fields}. Recording: {rec}", latency)
                    return
                
                # Check if this is one of our test recordings
                if hasattr(test_recordings_standalone, 'recording1_id') and rec["id"] == test_recordings_standalone.recording1_id:
                    recording1_found = True
                    if rec["title"] != "My rec":
                        log_test(test_name, False, f"Recording 1 title mismatch: {rec['title']} != 'My rec'", latency)
                        return
                
                if hasattr(test_recordings_standalone, 'recording2_id') and rec["id"] == test_recordings_standalone.recording2_id:
                    recording2_found = True
            
            if recording1_found and recording2_found:
                log_test(test_name, True, f"Both recordings found with all fields. Total count: {count}", latency)
            else:
                log_test(test_name, False, f"Not all recordings found. recording1={recording1_found}, recording2={recording2_found}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_recordings_delete(owner_token, alice_token):
    """Test DELETE /api/recordings/{id} with permission checks"""
    print("\n=== Testing DELETE /api/recordings/{id} ===")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    alice_headers = {"Authorization": f"Bearer {alice_token}"}
    
    # Test 3a: Owner deletes their own recording
    test_name = "DELETE /api/recordings/{id} (owner deletes own recording)"
    if hasattr(test_recordings_standalone, 'recording1_id'):
        try:
            start = time.time()
            response = requests.delete(
                f"{BASE_URL}/recordings/{test_recordings_standalone.recording1_id}",
                headers=owner_headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                if data.get("ok") == True:
                    log_test(test_name, True, "Owner successfully deleted own recording", latency)
                else:
                    log_test(test_name, False, f"Unexpected response: {data}", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    else:
        log_test(test_name, False, "recording1_id not available from previous test")
    
    # Test 3b: Alice tries to delete owner's recording (should be 403)
    test_name = "DELETE /api/recordings/{id} (alice tries to delete owner's recording - expect 403)"
    if hasattr(test_recordings_standalone, 'recording2_id'):
        try:
            start = time.time()
            response = requests.delete(
                f"{BASE_URL}/recordings/{test_recordings_standalone.recording2_id}",
                headers=alice_headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 403:
                log_test(test_name, True, "Correctly returned 403 Forbidden", latency)
            else:
                log_test(test_name, False, f"Expected 403, got {response.status_code}: {response.text[:200]}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    else:
        log_test(test_name, False, "recording2_id not available from previous test")
    
    # Test 3c: Delete nonexistent recording (should be 404)
    test_name = "DELETE /api/recordings/{id} (nonexistent id - expect 404)"
    try:
        start = time.time()
        response = requests.delete(
            f"{BASE_URL}/recordings/nonexistent-id-12345",
            headers=owner_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 404:
            log_test(test_name, True, "Correctly returned 404 Not Found", latency)
        else:
            log_test(test_name, False, f"Expected 404, got {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_recordings_get_by_token(token):
    """Test GET /api/recordings/{token}"""
    print("\n=== Testing GET /api/recordings/{token} ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "GET /api/recordings/{token} (retrieve recording by token)"
    if hasattr(test_recordings_standalone, 'recording2_token'):
        try:
            start = time.time()
            response = requests.get(
                f"{BASE_URL}/recordings/{test_recordings_standalone.recording2_token}",
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 200:
                data = response.json()
                has_id = "id" in data
                has_recording_url = "recording_url" in data
                has_shareable_token = "shareable_token" in data
                
                if has_id and has_recording_url and has_shareable_token:
                    log_test(test_name, True, f"Recording retrieved successfully. id={data.get('id')}", latency)
                else:
                    log_test(test_name, False, f"Missing fields in response: {data}", latency)
            else:
                log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    else:
        log_test(test_name, False, "recording2_token not available from previous test")

def test_route_order_sanity(token):
    """Test route order: GET /api/recordings/mine should NOT hit /api/recordings/{token}"""
    print("\n=== Testing Route Order Sanity ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "GET /api/recordings/mine (should not return 404 from {token} route)"
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
            if "recordings" in data and "count" in data:
                log_test(test_name, True, "Route order correct - /mine endpoint working", latency)
            else:
                log_test(test_name, False, f"Got 200 but wrong response format: {data}", latency)
        elif response.status_code == 404:
            log_test(test_name, False, "Route order issue - /mine hitting {token} route (404)", latency)
        else:
            log_test(test_name, False, f"Unexpected status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_subtask_review(owner_token, alice_token, bob_token, owner_user, alice_user, bob_user):
    """Test PUT /api/tasks/{subtask_id}/review with accept and send_back actions"""
    print("\n=== Testing PUT /api/tasks/{subtask_id}/review ===")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    alice_headers = {"Authorization": f"Bearer {alice_token}"}
    bob_headers = {"Authorization": f"Bearer {bob_token}"}
    
    # Step 1: Owner creates a bulk task with 2 subtasks (alice, bob)
    print("  Creating bulk task with 2 assignees (alice, bob)...")
    parent_id = None
    alice_subtask_id = None
    bob_subtask_id = None
    
    try:
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Batch #6 Review Test Task",
                "description": "Testing per-subtask review functionality",
                "assigned_to": [alice_user["id"], bob_user["id"]],
                "due_date": (datetime.now() + timedelta(days=3)).isoformat(),
                "priority": "High"
            },
            headers=owner_headers,
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) >= 2:
                # Find alice and bob's subtasks
                for task in data:
                    if task.get("assigned_to") == alice_user["id"]:
                        alice_subtask_id = task["id"]
                    elif task.get("assigned_to") == bob_user["id"]:
                        bob_subtask_id = task["id"]
                    
                    # Get parent_id from any subtask
                    if not parent_id and task.get("parent_id"):
                        parent_id = task["parent_id"]
                
                print(f"  ✓ Bulk task created. parent_id={parent_id}, alice_subtask={alice_subtask_id}, bob_subtask={bob_subtask_id}")
            else:
                print(f"  ✗ Unexpected bulk task response: {data}")
                log_test("Bulk task creation for review test", False, "Unexpected response format")
                return
        else:
            print(f"  ✗ Bulk task creation failed: {response.status_code}")
            log_test("Bulk task creation for review test", False, f"Status {response.status_code}")
            return
    except Exception as e:
        print(f"  ✗ Bulk task creation error: {e}")
        log_test("Bulk task creation for review test", False, f"Exception: {str(e)}")
        return
    
    if not alice_subtask_id or not bob_subtask_id:
        log_test("Bulk task creation for review test", False, "Could not find alice or bob subtasks")
        return
    
    # Step 2: Alice accepts her subtask
    print("  Alice accepting her subtask...")
    try:
        response = requests.put(
            f"{BASE_URL}/tasks/{alice_subtask_id}/accept",
            headers=alice_headers,
            timeout=5
        )
        if response.status_code == 200:
            print(f"  ✓ Alice accepted subtask")
        else:
            print(f"  ✗ Alice accept failed: {response.status_code}")
    except Exception as e:
        print(f"  ✗ Alice accept error: {e}")
    
    # Step 3: Alice completes her subtask
    print("  Alice completing her subtask...")
    try:
        response = requests.put(
            f"{BASE_URL}/tasks/{alice_subtask_id}/complete",
            json={"completion_note": "Alice completed the task"},
            headers=alice_headers,
            timeout=5
        )
        if response.status_code == 200:
            print(f"  ✓ Alice completed subtask - status should be 'Review Pending'")
        else:
            print(f"  ✗ Alice complete failed: {response.status_code}")
    except Exception as e:
        print(f"  ✗ Alice complete error: {e}")
    
    # Wait a bit for status to update
    time.sleep(0.5)
    
    # Step 4: Owner reviews alice's subtask with "accept" action
    test_name = "PUT /api/tasks/{subtask_id}/review (action: accept)"
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
            if "message" in data:
                log_test(test_name, True, f"Review accepted: {data['message']}", latency)
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Step 5: Bob accepts his subtask
    print("  Bob accepting his subtask...")
    try:
        response = requests.put(
            f"{BASE_URL}/tasks/{bob_subtask_id}/accept",
            headers=bob_headers,
            timeout=5
        )
        if response.status_code == 200:
            print(f"  ✓ Bob accepted subtask")
        else:
            print(f"  ✗ Bob accept failed: {response.status_code}")
    except Exception as e:
        print(f"  ✗ Bob accept error: {e}")
    
    # Step 6: Bob completes his subtask
    print("  Bob completing his subtask...")
    try:
        response = requests.put(
            f"{BASE_URL}/tasks/{bob_subtask_id}/complete",
            json={"completion_note": "Bob completed the task"},
            headers=bob_headers,
            timeout=5
        )
        if response.status_code == 200:
            print(f"  ✓ Bob completed subtask - status should be 'Review Pending'")
        else:
            print(f"  ✗ Bob complete failed: {response.status_code}")
    except Exception as e:
        print(f"  ✗ Bob complete error: {e}")
    
    # Wait a bit for status to update
    time.sleep(0.5)
    
    # Step 7: Owner reviews bob's subtask with "send_back" action
    test_name = "PUT /api/tasks/{subtask_id}/review (action: send_back with feedback)"
    try:
        start = time.time()
        response = requests.put(
            f"{BASE_URL}/tasks/{bob_subtask_id}/review",
            json={"action": "send_back", "feedback": "redo"},
            headers=owner_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "message" in data:
                log_test(test_name, True, f"Review sent back: {data['message']}", latency)
                
                # Verify bob's subtask status is back to "Accepted" with review_feedback
                time.sleep(0.5)
                verify_response = requests.get(
                    f"{BASE_URL}/tasks/{bob_subtask_id}",
                    headers=bob_headers,
                    timeout=5
                )
                if verify_response.status_code == 200:
                    task_data = verify_response.json()
                    if task_data.get("status") == "Accepted" and task_data.get("review_feedback") == "redo":
                        print(f"  ✓ Verified: Bob's subtask status is 'Accepted' with review_feedback='redo'")
                    else:
                        print(f"  ⚠️  Bob's subtask status: {task_data.get('status')}, review_feedback: {task_data.get('review_feedback')}")
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
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
        return
    print(f"✓ Alice logged in: {alice_user.get('name')} ({alice_user.get('email')})")
    
    # Login as bob
    print("\n🔐 Logging in as bob@acmecorp.com...")
    bob_token, bob_user = login(BOB_EMAIL, BOB_PASSWORD)
    if not bob_token:
        print("❌ CRITICAL: Bob login failed. Cannot proceed with some tests.")
        return
    print(f"✓ Bob logged in: {bob_user.get('name')} ({bob_user.get('email')})")
    
    # Run Batch #6 tests
    print("\n" + "="*80)
    print("SECTION 1: STANDALONE RECORDINGS")
    print("="*80)
    test_recordings_standalone(owner_token)
    
    print("\n" + "="*80)
    print("SECTION 2: RECORDINGS LIBRARY")
    print("="*80)
    test_recordings_mine(owner_token)
    
    print("\n" + "="*80)
    print("SECTION 3: RECORDINGS DELETE")
    print("="*80)
    test_recordings_delete(owner_token, alice_token)
    
    print("\n" + "="*80)
    print("SECTION 4: RECORDINGS GET BY TOKEN")
    print("="*80)
    test_recordings_get_by_token(owner_token)
    
    print("\n" + "="*80)
    print("SECTION 5: ROUTE ORDER SANITY")
    print("="*80)
    test_route_order_sanity(owner_token)
    
    print("\n" + "="*80)
    print("SECTION 6: PER-SUBTASK REVIEW")
    print("="*80)
    test_subtask_review(owner_token, alice_token, bob_token, owner_user, alice_user, bob_user)
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
