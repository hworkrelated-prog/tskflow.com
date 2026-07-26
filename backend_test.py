#!/usr/bin/env python3
"""
Backend API Testing Script for Group Task Features
Tests:
1. Login as owner@acmecorp.com
2. GET /api/tasks/{task_id}/leaderboard endpoint
3. POST /api/tasks/{task_id}/comments with mentions
"""

import requests
import json
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://auth-status-1.preview.emergentagent.com/api"
TEST_EMAIL = "owner@acmecorp.com"
TEST_PASSWORD = "Password123"

# Test results tracking
test_results = []

def log_test(test_name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    test_results.append({
        "test": test_name,
        "passed": passed,
        "details": details
    })
    print(f"{status}: {test_name}")
    if details:
        print(f"  Details: {details}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for r in test_results if r["passed"])
    total = len(test_results)
    print(f"Total: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    print("\nFailed tests:")
    for r in test_results:
        if not r["passed"]:
            print(f"  ❌ {r['test']}: {r['details']}")
    print("="*80)

# Test 1: Login
print("\n" + "="*80)
print("TEST 1: Login as owner@acmecorp.com")
print("="*80)

try:
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=10
    )
    
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        user_id = data.get("user", {}).get("id")
        user_name = data.get("user", {}).get("name")
        
        if token and user_id:
            log_test("Login successful", True, f"User: {user_name} (ID: {user_id})")
            headers = {"Authorization": f"Bearer {token}"}
        else:
            log_test("Login successful", False, "Missing token or user_id in response")
            exit(1)
    else:
        log_test("Login successful", False, f"Status {response.status_code}: {response.text}")
        exit(1)
except Exception as e:
    log_test("Login successful", False, f"Exception: {str(e)}")
    exit(1)

# Test 2: Create a parent task for testing leaderboard
print("\n" + "="*80)
print("TEST 2: Create a parent task (group task) for leaderboard testing")
print("="*80)

try:
    # First, get alice's user ID for bulk task creation
    response = requests.get(
        f"{BASE_URL}/team/potential-reports",
        headers=headers,
        timeout=10
    )
    
    if response.status_code == 200:
        potential_reports = response.json()
        alice = next((u for u in potential_reports if u["email"] == "alice@acmecorp.com"), None)
        bob = next((u for u in potential_reports if u["email"] == "bob@acmecorp.com"), None)
        
        if alice and bob:
            alice_id = alice["id"]
            bob_id = bob["id"]
            log_test("Get team members for bulk task", True, f"Alice ID: {alice_id}, Bob ID: {bob_id}")
        else:
            log_test("Get team members for bulk task", False, "Alice or Bob not found in potential reports")
            alice_id = None
            bob_id = None
    else:
        log_test("Get team members for bulk task", False, f"Status {response.status_code}")
        alice_id = None
        bob_id = None
    
    # Create bulk task (creates parent + children)
    if alice_id and bob_id:
        bulk_task_data = {
            "title": f"Test Group Task for Leaderboard - {datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "description": "Testing leaderboard endpoint with group task",
            "assigned_to": [alice_id, bob_id],
            "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "priority": "medium"
        }
        
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            headers=headers,
            json=bulk_task_data,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            # Response is a list of TaskResponse objects (children)
            if isinstance(data, list) and len(data) > 0:
                log_test("Bulk task creation successful", True, f"Created {len(data)} child tasks")
                
                # Get parent tasks to find the one we just created
                parents_response = requests.get(
                    f"{BASE_URL}/tasks/parents",
                    headers=headers,
                    timeout=10
                )
                
                if parents_response.status_code == 200:
                    parents = parents_response.json()
                    # Find the most recent parent task (should be the one we just created)
                    if isinstance(parents, list) and len(parents) > 0:
                        parent_task_id = parents[0].get("id")
                        log_test("Create parent task", True, f"Parent ID: {parent_task_id}, Children: {len(data)}")
                    else:
                        log_test("Create parent task", False, "No parent tasks found")
                        parent_task_id = None
                else:
                    log_test("Create parent task", False, f"Failed to fetch parent tasks: {parents_response.status_code}")
                    parent_task_id = None
            else:
                log_test("Create parent task", False, "Invalid response format or empty task list")
                parent_task_id = None
        else:
            log_test("Create parent task", False, f"Status {response.status_code}: {response.text}")
            parent_task_id = None
    else:
        log_test("Create parent task", False, "Skipped due to missing team member IDs")
        parent_task_id = None

except Exception as e:
    log_test("Create parent task", False, f"Exception: {str(e)}")
    parent_task_id = None

# Test 3: GET /api/tasks/{task_id}/leaderboard
print("\n" + "="*80)
print("TEST 3: GET /api/tasks/{task_id}/leaderboard")
print("="*80)

if parent_task_id:
    try:
        response = requests.get(
            f"{BASE_URL}/tasks/{parent_task_id}/leaderboard",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            leaderboard = data.get("leaderboard", [])
            visibility_message = data.get("visibility_message", "")
            
            if isinstance(leaderboard, list):
                log_test("Leaderboard endpoint returns data", True, 
                        f"Found {len(leaderboard)} entries")
                
                # Verify leaderboard structure
                if len(leaderboard) > 0:
                    first_entry = leaderboard[0]
                    required_fields = ["rank", "assignee_id", "name", "status", "engagement_score", "task_id"]
                    missing_fields = [f for f in required_fields if f not in first_entry]
                    
                    if not missing_fields:
                        log_test("Leaderboard structure valid", True, 
                                f"All required fields present: {', '.join(required_fields)}")
                        print(f"\n  Sample entry:")
                        print(f"    Rank: {first_entry.get('rank')}")
                        print(f"    Name: {first_entry.get('name')}")
                        print(f"    Status: {first_entry.get('status')}")
                        print(f"    Engagement Score: {first_entry.get('engagement_score')}")
                        print(f"    Completion Hours: {first_entry.get('completion_hours')}")
                    else:
                        log_test("Leaderboard structure valid", False, 
                                f"Missing fields: {', '.join(missing_fields)}")
                else:
                    log_test("Leaderboard structure valid", False, "Leaderboard is empty")
                
                # Verify visibility message
                if visibility_message:
                    log_test("Visibility message present", True, f"Message: {visibility_message}")
                else:
                    log_test("Visibility message present", False, "No visibility message")
            else:
                log_test("Leaderboard endpoint returns data", False, "Leaderboard is not a list")
        else:
            log_test("Leaderboard endpoint returns data", False, 
                    f"Status {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Leaderboard endpoint returns data", False, f"Exception: {str(e)}")
else:
    log_test("Leaderboard endpoint returns data", False, "Skipped - no parent task available")

# Test 4: POST /api/tasks/{task_id}/comments with mentions
print("\n" + "="*80)
print("TEST 4: POST /api/tasks/{task_id}/comments with mentions")
print("="*80)

if parent_task_id and alice_id:
    try:
        # Add comment with mention
        comment_data = {
            "content": f"Great work team! @alice let's discuss this further.",
            "mentions": [alice_id]
        }
        
        response = requests.post(
            f"{BASE_URL}/tasks/{parent_task_id}/comments",
            headers=headers,
            json=comment_data,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            comment = data.get("comment", {})
            message = data.get("message", "")
            
            if comment:
                log_test("Comment creation successful", True, 
                        f"Comment ID: {comment.get('id')}")
                
                # Verify comment structure
                required_fields = ["id", "user_id", "user_name", "content", "mentions", "created_at"]
                missing_fields = [f for f in required_fields if f not in comment]
                
                if not missing_fields:
                    log_test("Comment structure valid", True, 
                            f"All required fields present")
                    print(f"\n  Comment details:")
                    print(f"    User: {comment.get('user_name')}")
                    print(f"    Content: {comment.get('content')}")
                    print(f"    Mentions: {comment.get('mentions')}")
                    print(f"    Created: {comment.get('created_at')}")
                else:
                    log_test("Comment structure valid", False, 
                            f"Missing fields: {', '.join(missing_fields)}")
                
                # Verify mentions
                if alice_id in comment.get("mentions", []):
                    log_test("Mentions working correctly", True, 
                            f"Alice ({alice_id}) mentioned successfully")
                else:
                    log_test("Mentions working correctly", False, 
                            f"Alice not found in mentions: {comment.get('mentions')}")
            else:
                log_test("Comment creation successful", False, "No comment in response")
        else:
            log_test("Comment creation successful", False, 
                    f"Status {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Comment creation successful", False, f"Exception: {str(e)}")
else:
    log_test("Comment creation successful", False, 
            "Skipped - no parent task or alice_id available")

# Test 5: GET /api/tasks/{task_id}/comments to verify comment was saved
print("\n" + "="*80)
print("TEST 5: GET /api/tasks/{task_id}/comments to verify comment persistence")
print("="*80)

if parent_task_id:
    try:
        response = requests.get(
            f"{BASE_URL}/tasks/{parent_task_id}/comments",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            comments = data.get("comments", [])
            
            if isinstance(comments, list) and len(comments) > 0:
                log_test("Comments retrieval successful", True, 
                        f"Found {len(comments)} comment(s)")
                
                # Verify the comment we just added is present
                latest_comment = comments[-1]
                if "Great work team!" in latest_comment.get("content", ""):
                    log_test("Comment persistence verified", True, 
                            "Latest comment matches what we added")
                else:
                    log_test("Comment persistence verified", False, 
                            "Latest comment doesn't match")
            else:
                log_test("Comments retrieval successful", False, 
                        "No comments found or invalid format")
        else:
            log_test("Comments retrieval successful", False, 
                    f"Status {response.status_code}: {response.text}")
    except Exception as e:
        log_test("Comments retrieval successful", False, f"Exception: {str(e)}")
else:
    log_test("Comments retrieval successful", False, "Skipped - no parent task available")

# Print summary
print_summary()

# Exit with appropriate code
exit(0 if all(r["passed"] for r in test_results) else 1)
