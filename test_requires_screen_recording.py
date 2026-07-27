#!/usr/bin/env python3
"""
Focused Test for requires_screen_recording Field
Tests that the field is properly returned in all task responses
"""

import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "http://localhost:8001/api"
OWNER_EMAIL = "owner@acmecorp.com"
OWNER_PASSWORD = "Password123"
ALICE_EMAIL = "alice@acmecorp.com"
ALICE_PASSWORD = "Password123"

# Test results tracking
test_results = []

def log_test(test_name, passed, message="", response_data=None):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = {
        "test": test_name,
        "passed": passed,
        "message": message,
        "response_data": response_data
    }
    test_results.append(result)
    print(f"{status}: {test_name}")
    if message:
        print(f"  → {message}")
    if response_data:
        print(f"  → Response data: {json.dumps(response_data, indent=2)}")

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

def test_bulk_task_with_requires_screen_recording(token, alice_id):
    """Test 1: POST /api/tasks/bulk with requires_screen_recording=true"""
    print("\n=== Test 1: POST /api/tasks/bulk with requires_screen_recording=true ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "POST /api/tasks/bulk with requires_screen_recording=true"
    try:
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "proof",
                "description": "Test task with screen recording requirement",
                "assigned_to": [alice_id, "bob@acmecorp.com"],
                "due_date": "2025-12-31",
                "priority": "High",
                "requires_screen_recording": True
            },
            headers=headers,
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"  Response status: 200 ✓")
            print(f"  Number of tasks created: {len(data)}")
            
            # Check if all items have requires_screen_recording=true
            all_have_field = True
            field_values = []
            
            for idx, task in enumerate(data):
                field_value = task.get("requires_screen_recording")
                field_values.append(field_value)
                print(f"  Task {idx+1}: requires_screen_recording = {field_value}")
                
                if field_value != True:
                    all_have_field = False
            
            if all_have_field:
                log_test(test_name, True, f"All {len(data)} tasks have requires_screen_recording=true", {"field_values": field_values})
                return data  # Return tasks for further testing
            else:
                log_test(test_name, False, f"Not all tasks have requires_screen_recording=true. Values: {field_values}", {"tasks": data})
                return data
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}")
            return None
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
        return None

def test_get_subtask(token, subtask_id):
    """Test 2: GET /api/tasks/{child_id} for one subtask"""
    print(f"\n=== Test 2: GET /api/tasks/{subtask_id} ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = f"GET /api/tasks/{subtask_id} (verify requires_screen_recording=true)"
    try:
        response = requests.get(
            f"{BASE_URL}/tasks/{subtask_id}",
            headers=headers,
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"  Response status: 200 ✓")
            
            field_value = data.get("requires_screen_recording")
            print(f"  requires_screen_recording = {field_value}")
            
            if field_value == True:
                log_test(test_name, True, f"requires_screen_recording=true in response", {"requires_screen_recording": field_value})
            else:
                log_test(test_name, False, f"requires_screen_recording={field_value} (expected True)", {"task": data})
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_single_task_with_requires_screen_recording(token, user_id):
    """Test 3: POST /api/tasks (single) with requires_screen_recording=true"""
    print("\n=== Test 3: POST /api/tasks (single) with requires_screen_recording=true ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "POST /api/tasks (single) with requires_screen_recording=true"
    try:
        response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "single",
                "description": "Single task with screen recording requirement",
                "assigned_to": user_id,
                "due_date": "2025-12-31",
                "priority": "Medium",
                "requires_screen_recording": True
            },
            headers=headers,
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"  Response status: 200 ✓")
            
            field_value = data.get("requires_screen_recording")
            print(f"  requires_screen_recording = {field_value}")
            
            if field_value == True:
                log_test(test_name, True, f"requires_screen_recording=true in response", {"requires_screen_recording": field_value})
            else:
                log_test(test_name, False, f"requires_screen_recording={field_value} (expected True)", {"task": data})
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_bulk_task_without_requires_screen_recording(token, alice_id):
    """Test 4: POST /api/tasks/bulk WITHOUT requires_screen_recording field"""
    print("\n=== Test 4: POST /api/tasks/bulk WITHOUT requires_screen_recording (should default to false) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "POST /api/tasks/bulk WITHOUT requires_screen_recording (defaults to false)"
    try:
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "no recording requirement",
                "description": "Task without screen recording requirement",
                "assigned_to": [alice_id, "bob@acmecorp.com"],
                "due_date": "2025-12-31",
                "priority": "Low"
                # Note: requires_screen_recording is NOT included
            },
            headers=headers,
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"  Response status: 200 ✓")
            print(f"  Number of tasks created: {len(data)}")
            
            # Check if all items have requires_screen_recording=false (default)
            all_default_false = True
            field_values = []
            
            for idx, task in enumerate(data):
                field_value = task.get("requires_screen_recording")
                field_values.append(field_value)
                print(f"  Task {idx+1}: requires_screen_recording = {field_value}")
                
                if field_value != False:
                    all_default_false = False
            
            if all_default_false:
                log_test(test_name, True, f"All {len(data)} tasks have requires_screen_recording=false (default)", {"field_values": field_values})
            else:
                log_test(test_name, False, f"Not all tasks have requires_screen_recording=false. Values: {field_values}", {"tasks": data})
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}")
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY - requires_screen_recording Field")
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
            print(f"  • {r['test']}")
            if r["message"]:
                print(f"    → {r['message']}")
    
    print("\n" + "="*80)
    
    # Return overall pass/fail
    return failed == 0

def main():
    """Main test execution"""
    print("="*80)
    print("FOCUSED TEST: requires_screen_recording Field")
    print("="*80)
    
    # Login as owner
    print("\n🔐 Logging in as owner@acmecorp.com...")
    owner_token, owner_user = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not owner_token:
        print("❌ CRITICAL: Owner login failed. Cannot proceed with tests.")
        return False
    print(f"✓ Owner logged in: {owner_user.get('name')} ({owner_user.get('email')})")
    owner_id = owner_user.get("id")
    
    # Login as alice to get her ID
    print("\n🔐 Logging in as alice@acmecorp.com...")
    alice_token, alice_user = login(ALICE_EMAIL, ALICE_PASSWORD)
    if not alice_token:
        print("❌ CRITICAL: Alice login failed. Cannot proceed with tests.")
        return False
    print(f"✓ Alice logged in: {alice_user.get('name')} ({alice_user.get('email')})")
    alice_id = alice_user.get("id")
    
    # Run tests
    # Test 1: Bulk task creation with requires_screen_recording=true
    bulk_tasks = test_bulk_task_with_requires_screen_recording(owner_token, alice_id)
    
    # Test 2: Get one of the subtasks
    if bulk_tasks and len(bulk_tasks) > 0:
        subtask_id = bulk_tasks[0].get("id")
        test_get_subtask(owner_token, subtask_id)
    else:
        print("\n⚠️  Skipping Test 2 (GET subtask) - no tasks created in Test 1")
    
    # Test 3: Single task creation with requires_screen_recording=true
    test_single_task_with_requires_screen_recording(owner_token, alice_id)
    
    # Test 4: Bulk task creation WITHOUT requires_screen_recording (should default to false)
    test_bulk_task_without_requires_screen_recording(owner_token, alice_id)
    
    # Print summary
    all_passed = print_summary()
    
    return all_passed

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
