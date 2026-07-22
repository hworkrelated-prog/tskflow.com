#!/usr/bin/env python3
"""
Regression test for two backend endpoints affected by latest fixes:
1. GET /api/team/potential-reports - should now include pro-tier users from same domain
2. POST /api/analytics - should now include response_rate and avg_response_hours
3. POST /api/team/set-manager - test setting and removing manager
"""

import requests
import sys
from datetime import datetime, timedelta
import time

# Read backend URL from frontend/.env
with open('/app/frontend/.env', 'r') as f:
    for line in f:
        if line.startswith('REACT_APP_BACKEND_URL='):
            BASE_URL = line.split('=')[1].strip()
            break

API_URL = f"{BASE_URL}/api"

# Test credentials from /app/memory/test_credentials.md
OWNER_EMAIL = "owner@acmecorp.com"
OWNER_PASSWORD = "Password123"
ALICE_EMAIL = "alice@acmecorp.com"
ALICE_PASSWORD = "Password123"
BOB_EMAIL = "bob@acmecorp.com"
BOB_PASSWORD = "Password123"
PROUSER_EMAIL = "prouser@acmecorp.com"
PROUSER_PASSWORD = "Password123"

def login(email, password):
    """Login and return token"""
    response = requests.post(f"{API_URL}/auth/login", json={
        "email": email,
        "password": password
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        print(f"❌ Login failed for {email}: {response.status_code} - {response.text}")
        return None

def test_potential_reports():
    """Test 1: GET /api/team/potential-reports should include prouser@acmecorp.com"""
    print("\n" + "="*80)
    print("TEST 1: GET /api/team/potential-reports")
    print("="*80)
    
    owner_token = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not owner_token:
        return False
    
    response = requests.get(
        f"{API_URL}/team/potential-reports",
        headers={"Authorization": f"Bearer {owner_token}"}
    )
    
    print(f"Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    data = response.json()
    
    if not isinstance(data, list):
        print(f"❌ FAILED: Response is not a list")
        return False
    
    print(f"✅ Response is a list with {len(data)} members")
    
    # Check for required users
    emails = [user["email"] for user in data]
    print(f"\nEmails in potential-reports: {emails}")
    
    # Should include alice, bob, and prouser (pro tier on same domain)
    expected_emails = [ALICE_EMAIL, BOB_EMAIL, PROUSER_EMAIL]
    missing = []
    for email in expected_emails:
        if email not in emails:
            missing.append(email)
    
    # Should NOT include owner (current user)
    if OWNER_EMAIL in emails:
        print(f"❌ FAILED: Current user (owner@acmecorp.com) should NOT be in potential-reports")
        return False
    
    if missing:
        print(f"❌ FAILED: Missing users: {missing}")
        print(f"   Expected to find alice, bob, AND prouser (pro tier on same domain)")
        return False
    
    print(f"✅ PASSED: All expected users found (alice, bob, prouser)")
    
    # Check structure of each item
    for user in data:
        required_fields = ["id", "name", "email", "current_manager", "reports_to_you"]
        for field in required_fields:
            if field not in user:
                print(f"❌ FAILED: Missing field '{field}' in user object")
                return False
    
    print(f"✅ PASSED: All required fields present (id, name, email, current_manager, reports_to_you)")
    
    # Show prouser details
    prouser = next((u for u in data if u["email"] == PROUSER_EMAIL), None)
    if prouser:
        print(f"\n📊 prouser@acmecorp.com details:")
        print(f"   - id: {prouser['id']}")
        print(f"   - name: {prouser['name']}")
        print(f"   - current_manager: {prouser['current_manager']}")
        print(f"   - reports_to_you: {prouser['reports_to_you']}")
    
    return True

def test_analytics_with_response_metrics():
    """Test 2: POST /api/analytics should include response_rate and avg_response_hours"""
    print("\n" + "="*80)
    print("TEST 2: POST /api/analytics with response_rate and avg_response_hours")
    print("="*80)
    
    owner_token = login(OWNER_EMAIL, OWNER_PASSWORD)
    alice_token = login(ALICE_EMAIL, ALICE_PASSWORD)
    
    if not owner_token or not alice_token:
        return False
    
    # First, create some test tasks to ensure we have data
    print("\n📝 Creating test tasks for analytics...")
    
    # Create 2 tasks assigned to alice
    for i in range(2):
        task_data = {
            "title": f"Regression Test Task {i+1}",
            "description": f"Test task for analytics regression test",
            "assigned_to": ALICE_EMAIL,
            "due_date": (datetime.now() + timedelta(days=7)).isoformat(),
            "priority": "Medium"
        }
        response = requests.post(
            f"{API_URL}/tasks",
            json=task_data,
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        if response.status_code == 200:
            task_id = response.json()["id"]
            print(f"✅ Created task {i+1}: {task_id}")
            
            # Have alice accept the first task
            if i == 0:
                time.sleep(1)
                accept_response = requests.post(
                    f"{API_URL}/tasks/{task_id}/accept",
                    headers={"Authorization": f"Bearer {alice_token}"}
                )
                if accept_response.status_code == 200:
                    print(f"✅ Alice accepted task {i+1}")
                    
                    # Complete the task
                    time.sleep(1)
                    complete_response = requests.post(
                        f"{API_URL}/tasks/{task_id}/complete",
                        headers={"Authorization": f"Bearer {alice_token}"}
                    )
                    if complete_response.status_code == 200:
                        print(f"✅ Alice completed task {i+1}")
        else:
            print(f"⚠️  Failed to create task {i+1}: {response.status_code}")
    
    # Wait a moment for data to settle
    time.sleep(2)
    
    # Now test analytics endpoint
    print("\n📊 Testing analytics endpoint...")
    
    start_date = (datetime.now() - timedelta(days=7)).isoformat()
    end_date = (datetime.now() + timedelta(days=1)).isoformat()
    
    response = requests.post(
        f"{API_URL}/analytics",
        json={
            "start_date": start_date,
            "end_date": end_date
        },
        headers={"Authorization": f"Bearer {owner_token}"}
    )
    
    print(f"Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    data = response.json()
    
    # Check for assignee_breakdown
    if "assignee_breakdown" not in data:
        print(f"❌ FAILED: Missing 'assignee_breakdown' field")
        return False
    
    assignee_breakdown = data["assignee_breakdown"]
    
    if not isinstance(assignee_breakdown, list):
        print(f"❌ FAILED: assignee_breakdown is not a list")
        return False
    
    print(f"✅ assignee_breakdown is a list with {len(assignee_breakdown)} entries")
    
    if len(assignee_breakdown) == 0:
        print(f"⚠️  WARNING: assignee_breakdown is empty (no tasks assigned to others in date range)")
        print(f"   This is acceptable but we can't verify the new fields")
        return True
    
    # Check structure of assignee_breakdown entries
    print(f"\n📊 Checking assignee_breakdown structure...")
    
    required_fields = [
        "name", "email", "tasks_assigned", "tasks_completed", "tasks_pending",
        "completion_rate", "avg_completion_days", "response_rate", "avg_response_hours"
    ]
    
    for i, assignee in enumerate(assignee_breakdown):
        print(f"\n   Assignee {i+1}: {assignee.get('name', 'Unknown')} ({assignee.get('email', 'Unknown')})")
        
        for field in required_fields:
            if field not in assignee:
                print(f"   ❌ FAILED: Missing field '{field}'")
                return False
        
        print(f"   ✅ All required fields present")
        
        # Show the NEW fields
        print(f"   📈 NEW FIELDS:")
        print(f"      - response_rate: {assignee['response_rate']}%")
        print(f"      - avg_response_hours: {assignee['avg_response_hours']}")
        
        # Validate types
        if not isinstance(assignee['response_rate'], (int, float)):
            print(f"   ❌ FAILED: response_rate is not a number")
            return False
        
        if assignee['avg_response_hours'] is not None and not isinstance(assignee['avg_response_hours'], (int, float)):
            print(f"   ❌ FAILED: avg_response_hours is not a number or null")
            return False
        
        # Validate ranges
        if not (0 <= assignee['response_rate'] <= 100):
            print(f"   ❌ FAILED: response_rate should be 0-100, got {assignee['response_rate']}")
            return False
        
        if assignee['avg_response_hours'] is not None and assignee['avg_response_hours'] < 0:
            print(f"   ❌ FAILED: avg_response_hours should be positive or null, got {assignee['avg_response_hours']}")
            return False
        
        print(f"   ✅ NEW FIELDS validated (response_rate: {assignee['response_rate']}%, avg_response_hours: {assignee['avg_response_hours']})")
        
        # Show existing fields for context
        print(f"   📊 EXISTING FIELDS:")
        print(f"      - tasks_assigned: {assignee['tasks_assigned']}")
        print(f"      - tasks_completed: {assignee['tasks_completed']}")
        print(f"      - tasks_pending: {assignee['tasks_pending']}")
        print(f"      - completion_rate: {assignee['completion_rate']}%")
        print(f"      - avg_completion_days: {assignee['avg_completion_days']}")
    
    print(f"\n✅ PASSED: All required fields present including NEW response_rate and avg_response_hours")
    
    return True

def test_set_manager():
    """Test 3: POST /api/team/set-manager - set and remove manager"""
    print("\n" + "="*80)
    print("TEST 3: POST /api/team/set-manager")
    print("="*80)
    
    alice_token = login(ALICE_EMAIL, ALICE_PASSWORD)
    owner_token = login(OWNER_EMAIL, OWNER_PASSWORD)
    
    if not alice_token or not owner_token:
        return False
    
    # Get owner's user_id
    owner_profile = requests.get(
        f"{API_URL}/auth/me",
        headers={"Authorization": f"Bearer {owner_token}"}
    )
    if owner_profile.status_code != 200:
        print(f"❌ FAILED: Could not get owner profile: {owner_profile.status_code} - {owner_profile.text}")
        return False
    
    owner_id = owner_profile.json()["id"]
    print(f"Owner ID: {owner_id}")
    
    # Test 3a: Set manager
    print("\n📝 Test 3a: Alice sets manager to owner...")
    
    response = requests.post(
        f"{API_URL}/team/set-manager",
        json={"manager_id": owner_id},
        headers={"Authorization": f"Bearer {alice_token}"}
    )
    
    print(f"Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    data = response.json()
    print(f"Response: {data}")
    
    if "message" not in data:
        print(f"❌ FAILED: Missing 'message' field")
        return False
    
    if "manager" not in data:
        print(f"❌ FAILED: Missing 'manager' field")
        return False
    
    print(f"✅ PASSED: Alice set manager to owner")
    print(f"   Message: {data['message']}")
    print(f"   Manager: {data['manager']}")
    
    # Test 3b: Remove manager
    print("\n📝 Test 3b: Alice removes manager...")
    
    response = requests.post(
        f"{API_URL}/team/set-manager",
        json={"manager_id": None},
        headers={"Authorization": f"Bearer {alice_token}"}
    )
    
    print(f"Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"❌ FAILED: Expected 200, got {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    data = response.json()
    print(f"Response: {data}")
    
    if data.get("message") != "Manager removed":
        print(f"❌ FAILED: Expected 'Manager removed' message, got: {data.get('message')}")
        return False
    
    if data.get("manager") is not None:
        print(f"❌ FAILED: Expected manager to be null, got: {data.get('manager')}")
        return False
    
    print(f"✅ PASSED: Alice removed manager")
    print(f"   Message: {data['message']}")
    print(f"   Manager: {data['manager']}")
    
    return True

def main():
    print("🚀 Starting Regression Tests for Backend Endpoints")
    print(f"Backend URL: {API_URL}")
    print("="*80)
    
    results = {
        "potential-reports": False,
        "analytics": False,
        "set-manager": False
    }
    
    # Run tests
    try:
        results["potential-reports"] = test_potential_reports()
    except Exception as e:
        print(f"❌ Test 1 failed with exception: {e}")
    
    try:
        results["analytics"] = test_analytics_with_response_metrics()
    except Exception as e:
        print(f"❌ Test 2 failed with exception: {e}")
    
    try:
        results["set-manager"] = test_set_manager()
    except Exception as e:
        print(f"❌ Test 3 failed with exception: {e}")
    
    # Summary
    print("\n" + "="*80)
    print("📊 REGRESSION TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    print(f"\n1. GET /api/team/potential-reports: {'✅ PASSED' if results['potential-reports'] else '❌ FAILED'}")
    print(f"2. POST /api/analytics: {'✅ PASSED' if results['analytics'] else '❌ FAILED'}")
    print(f"3. POST /api/team/set-manager: {'✅ PASSED' if results['set-manager'] else '❌ FAILED'}")
    
    print(f"\n{'='*80}")
    print(f"Results: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    print(f"{'='*80}")
    
    if passed == total:
        print("🎉 All regression tests passed!")
        return 0
    else:
        print("⚠️  Some regression tests failed. See details above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
