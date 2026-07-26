#!/usr/bin/env python3
"""
Backend API Testing for Task Hub - Group Features Testing
Tests 5 core group fixes:
1. Organization-wide groups
2. Groups editable
3. Bulk group creation
4. Counter-proposal acceptance
5. Completed parent groups filtering
"""

import requests
import json
from datetime import datetime, timedelta

# Backend API URL
API_BASE = "http://127.0.0.1:8001/api"

# Test credentials from test_credentials.md
TEST_USERS = {
    "owner": {"email": "owner@acmecorp.com", "password": "Password123"},
    "alice": {"email": "alice@acmecorp.com", "password": "Password123"},
    "bob": {"email": "bob@acmecorp.com", "password": "Password123"},
    "prouser": {"email": "prouser@acmecorp.com", "password": "Password123"},
    "freeuser": {"email": "freeuser@example.org", "password": "Password123"}
}

def login(email, password):
    """Login and return access token"""
    response = requests.post(f"{API_BASE}/auth/login", json={
        "email": email,
        "password": password
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        print(f"❌ Login failed for {email}: {response.status_code} - {response.text}")
        return None

def get_headers(token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {token}"}

def print_test_header(test_name):
    """Print formatted test header"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")

def print_result(passed, message):
    """Print test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {message}")

# =============================================================================
# TEST 1: Organization-wide groups
# =============================================================================
def test_organization_wide_groups():
    """
    Test that users from the same company domain can see each other's groups.
    Steps:
    1. Register/login 2 users with same company domain (owner and alice)
    2. User 1 (owner) creates a group
    3. User 2 (alice) should be able to list and see that group
    4. Verify both users can edit the same group
    """
    print_test_header("1. Organization-wide Groups")
    
    # Login both users
    owner_token = login(TEST_USERS["owner"]["email"], TEST_USERS["owner"]["password"])
    alice_token = login(TEST_USERS["alice"]["email"], TEST_USERS["alice"]["password"])
    
    if not owner_token or not alice_token:
        print_result(False, "Failed to login users")
        return False
    
    # Owner creates a group
    group_data = {
        "name": f"Test Org Group {datetime.now().timestamp()}",
        "emails": ["test1@example.com", "test2@example.com"]
    }
    
    response = requests.post(
        f"{API_BASE}/groups",
        json=group_data,
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Owner failed to create group: {response.status_code} - {response.text}")
        return False
    
    created_group = response.json()
    group_id = created_group["id"]
    print_result(True, f"Owner created group: {created_group['name']} (ID: {group_id})")
    
    # Alice lists groups - should see owner's group
    response = requests.get(
        f"{API_BASE}/groups",
        headers=get_headers(alice_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Alice failed to list groups: {response.status_code} - {response.text}")
        return False
    
    alice_groups = response.json()
    group_found = any(g["id"] == group_id for g in alice_groups)
    
    if not group_found:
        print_result(False, f"Alice cannot see owner's group. Alice sees {len(alice_groups)} groups")
        return False
    
    print_result(True, f"Alice can see owner's group (found in {len(alice_groups)} total groups)")
    
    # Alice edits the group (org-wide edit permission)
    update_data = {
        "name": f"Updated by Alice {datetime.now().timestamp()}",
        "emails": ["test1@example.com", "test2@example.com", "test3@example.com"]
    }
    
    response = requests.put(
        f"{API_BASE}/groups/{group_id}",
        json=update_data,
        headers=get_headers(alice_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Alice failed to edit group: {response.status_code} - {response.text}")
        return False
    
    updated_group = response.json()
    print_result(True, f"Alice successfully edited owner's group: {updated_group['name']}")
    
    # Owner verifies the update
    response = requests.get(
        f"{API_BASE}/groups",
        headers=get_headers(owner_token)
    )
    
    if response.status_code == 200:
        owner_groups = response.json()
        updated = next((g for g in owner_groups if g["id"] == group_id), None)
        if updated and updated["name"] == update_data["name"]:
            print_result(True, f"Owner sees Alice's updates: {updated['name']}")
        else:
            print_result(False, "Owner doesn't see Alice's updates")
            return False
    
    # Cleanup
    requests.delete(f"{API_BASE}/groups/{group_id}", headers=get_headers(owner_token))
    
    return True

# =============================================================================
# TEST 2: Groups editable
# =============================================================================
def test_groups_editable():
    """
    Test that groups can be updated (name and emails).
    Steps:
    1. Create a group with 2 emails
    2. Update the group to add 1 more email and change the name
    3. Verify updates are persisted
    """
    print_test_header("2. Groups Editable")
    
    owner_token = login(TEST_USERS["owner"]["email"], TEST_USERS["owner"]["password"])
    if not owner_token:
        print_result(False, "Failed to login")
        return False
    
    # Create initial group
    initial_data = {
        "name": f"Editable Group {datetime.now().timestamp()}",
        "emails": ["user1@company.com", "user2@company.com"]
    }
    
    response = requests.post(
        f"{API_BASE}/groups",
        json=initial_data,
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Failed to create group: {response.status_code} - {response.text}")
        return False
    
    group = response.json()
    group_id = group["id"]
    print_result(True, f"Created group with {len(group['emails'])} emails: {group['emails']}")
    
    # Update group - change name and add email
    update_data = {
        "name": f"Updated Group Name {datetime.now().timestamp()}",
        "emails": ["user1@company.com", "user2@company.com", "user3@company.com"]
    }
    
    response = requests.put(
        f"{API_BASE}/groups/{group_id}",
        json=update_data,
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Failed to update group: {response.status_code} - {response.text}")
        return False
    
    updated = response.json()
    
    # Verify name changed
    if updated["name"] != update_data["name"]:
        print_result(False, f"Name not updated. Expected: {update_data['name']}, Got: {updated['name']}")
        return False
    
    print_result(True, f"Group name updated: {updated['name']}")
    
    # Verify emails updated
    if len(updated["emails"]) != 3:
        print_result(False, f"Emails not updated. Expected 3, Got {len(updated['emails'])}")
        return False
    
    if "user3@company.com" not in updated["emails"]:
        print_result(False, "New email not added to group")
        return False
    
    print_result(True, f"Emails updated: {updated['emails']}")
    
    # Verify persistence - fetch again
    response = requests.get(
        f"{API_BASE}/groups",
        headers=get_headers(owner_token)
    )
    
    if response.status_code == 200:
        groups = response.json()
        persisted = next((g for g in groups if g["id"] == group_id), None)
        if persisted and persisted["name"] == update_data["name"] and len(persisted["emails"]) == 3:
            print_result(True, "Updates persisted correctly")
        else:
            print_result(False, "Updates not persisted")
            return False
    
    # Cleanup
    requests.delete(f"{API_BASE}/groups/{group_id}", headers=get_headers(owner_token))
    
    return True

# =============================================================================
# TEST 3: Bulk group creation
# =============================================================================
def test_bulk_group_creation():
    """
    Test creating a group with multiple emails at once (simulating spreadsheet paste).
    Steps:
    1. Create a group by POSTing multiple emails at once
    2. Verify all emails are added
    """
    print_test_header("3. Bulk Group Creation")
    
    owner_token = login(TEST_USERS["owner"]["email"], TEST_USERS["owner"]["password"])
    if not owner_token:
        print_result(False, "Failed to login")
        return False
    
    # Create group with 10 emails at once (simulating bulk paste)
    bulk_emails = [f"employee{i}@company.com" for i in range(1, 11)]
    
    group_data = {
        "name": f"Bulk Group {datetime.now().timestamp()}",
        "emails": bulk_emails
    }
    
    response = requests.post(
        f"{API_BASE}/groups",
        json=group_data,
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Failed to create bulk group: {response.status_code} - {response.text}")
        return False
    
    group = response.json()
    group_id = group["id"]
    
    # Verify all emails were added
    if len(group["emails"]) != 10:
        print_result(False, f"Not all emails added. Expected 10, Got {len(group['emails'])}")
        return False
    
    print_result(True, f"Created group with {len(group['emails'])} emails in bulk")
    
    # Verify each email is present
    for email in bulk_emails:
        if email not in group["emails"]:
            print_result(False, f"Email {email} not found in group")
            return False
    
    print_result(True, f"All {len(bulk_emails)} emails verified in group")
    
    # Test adding more emails via update
    additional_emails = bulk_emails + [f"newemployee{i}@company.com" for i in range(1, 6)]
    
    response = requests.put(
        f"{API_BASE}/groups/{group_id}",
        json={"emails": additional_emails},
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Failed to update with more emails: {response.status_code} - {response.text}")
        return False
    
    updated = response.json()
    
    if len(updated["emails"]) != 15:
        print_result(False, f"Bulk update failed. Expected 15 emails, Got {len(updated['emails'])}")
        return False
    
    print_result(True, f"Bulk update successful: {len(updated['emails'])} total emails")
    
    # Cleanup
    requests.delete(f"{API_BASE}/groups/{group_id}", headers=get_headers(owner_token))
    
    return True

# =============================================================================
# TEST 4: Counter-proposal acceptance
# =============================================================================
def test_counter_proposal_acceptance():
    """
    Test counter-proposal flow.
    Steps:
    1. User A creates task for User B
    2. User B submits counter-proposal with new due date
    3. User A accepts the counter-proposal via PUT /api/tasks/{task_id}/accept-counter-proposal
    4. Verify task status becomes "Accepted" and due_date is updated
    """
    print_test_header("4. Counter-Proposal Acceptance")
    
    owner_token = login(TEST_USERS["owner"]["email"], TEST_USERS["owner"]["password"])
    alice_token = login(TEST_USERS["alice"]["email"], TEST_USERS["alice"]["password"])
    
    if not owner_token or not alice_token:
        print_result(False, "Failed to login users")
        return False
    
    # Owner creates task for Alice
    original_due_date = (datetime.now() + timedelta(days=3)).isoformat()
    task_data = {
        "title": f"Counter-Proposal Test Task {datetime.now().timestamp()}",
        "description": "Test task for counter-proposal flow",
        "assigned_to": "alice@acmecorp.com",
        "due_date": original_due_date,
        "priority": "Medium"
    }
    
    response = requests.post(
        f"{API_BASE}/tasks",
        json=task_data,
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Failed to create task: {response.status_code} - {response.text}")
        return False
    
    task = response.json()
    task_id = task["id"]
    print_result(True, f"Owner created task for Alice (ID: {task_id})")
    
    # Alice submits counter-proposal
    proposed_due_date = (datetime.now() + timedelta(days=7)).isoformat()
    counter_proposal = {
        "action": "counter_propose",
        "proposed_due_date": proposed_due_date,
        "message": "I need more time for this task"
    }
    
    response = requests.put(
        f"{API_BASE}/tasks/{task_id}/counter-propose",
        json=counter_proposal,
        headers=get_headers(alice_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Alice failed to submit counter-proposal: {response.status_code} - {response.text}")
        return False
    
    print_result(True, f"Alice submitted counter-proposal with new due date: {proposed_due_date}")
    
    # Verify task status is "Counter-Proposed"
    response = requests.get(
        f"{API_BASE}/tasks/{task_id}",
        headers=get_headers(owner_token)
    )
    
    if response.status_code == 200:
        task_updated = response.json()
        if task_updated and task_updated["status"] == "Counter-Proposed":
            print_result(True, f"Task status is 'Counter-Proposed'")
        else:
            print_result(False, f"Task status is not 'Counter-Proposed', got: {task_updated['status'] if task_updated else 'Not found'}")
            return False
    
    # Owner accepts counter-proposal
    response = requests.put(
        f"{API_BASE}/tasks/{task_id}/accept-counter-proposal",
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Owner failed to accept counter-proposal: {response.status_code} - {response.text}")
        return False
    
    print_result(True, "Owner accepted counter-proposal")
    
    # Verify task status is "Accepted" and due_date is updated
    response = requests.get(
        f"{API_BASE}/tasks/{task_id}",
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Failed to fetch task: {response.status_code}")
        return False
    
    final_task = response.json()
    
    # Check status
    if final_task["status"] != "Accepted":
        print_result(False, f"Task status not 'Accepted', got: {final_task['status']}")
        return False
    
    print_result(True, f"Task status is 'Accepted'")
    
    # Check due_date updated
    # Compare dates (strip microseconds for comparison)
    final_due = final_task["due_date"].split('.')[0]
    proposed_due = proposed_due_date.split('.')[0]
    
    if final_due != proposed_due:
        print_result(False, f"Due date not updated. Expected: {proposed_due}, Got: {final_due}")
        return False
    
    print_result(True, f"Due date updated to proposed date: {final_task['due_date']}")
    
    # Cleanup
    requests.delete(f"{API_BASE}/tasks/{task_id}", headers=get_headers(owner_token))
    
    return True

# =============================================================================
# TEST 5: Completed parent groups filtering
# =============================================================================
def test_completed_parent_groups_filtering():
    """
    Test filtering parent task groups by completion status.
    Steps:
    1. Create a parent task (group task) with 2 children
    2. Complete both children
    3. Verify GET /api/tasks/parents?status_filter=completed returns the group
    4. Verify GET /api/tasks/parents?status_filter=active does NOT return the group
    """
    print_test_header("5. Completed Parent Groups Filtering")
    
    owner_token = login(TEST_USERS["owner"]["email"], TEST_USERS["owner"]["password"])
    alice_token = login(TEST_USERS["alice"]["email"], TEST_USERS["alice"]["password"])
    bob_token = login(TEST_USERS["bob"]["email"], TEST_USERS["bob"]["password"])
    
    if not owner_token or not alice_token or not bob_token:
        print_result(False, "Failed to login users")
        return False
    
    # Create a multi-assignee task (creates parent + children)
    task_data = {
        "title": f"Parent Group Test {datetime.now().timestamp()}",
        "description": "Test task for parent group filtering",
        "assigned_to": ["alice@acmecorp.com", "bob@acmecorp.com"],  # List for bulk endpoint
        "due_date": (datetime.now() + timedelta(days=5)).isoformat(),
        "priority": "High"
    }
    
    response = requests.post(
        f"{API_BASE}/tasks/bulk",  # Use bulk endpoint for multi-assignee
        json=task_data,
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Failed to create multi-assignee task: {response.status_code} - {response.text}")
        return False
    
    result = response.json()
    
    # For multi-assignee tasks, the bulk endpoint returns a list of tasks
    if not isinstance(result, list) or len(result) == 0:
        print_result(False, f"Unexpected response format: {result}")
        return False
    
    print_result(True, f"Created {len(result)} child tasks via bulk endpoint")
    
    # Get parent_id by fetching the parents list
    response = requests.get(
        f"{API_BASE}/tasks/parents?status_filter=active",
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Failed to fetch parents: {response.status_code} - {response.text}")
        return False
    
    parents = response.json()
    
    # Find the parent we just created (should be the most recent one with matching title)
    task_title = task_data["title"]
    parent = next((p for p in parents if p["title"] == task_title), None)
    
    if not parent:
        print_result(False, f"Parent task not found in parents list. Found {len(parents)} parents")
        return False
    
    parent_id = parent["id"]
    
    print_result(True, f"Created multi-assignee task (Parent ID: {parent_id})")
    
    # Verify parent appears in active list
    response = requests.get(
        f"{API_BASE}/tasks/parents?status_filter=active",
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Failed to fetch active parents: {response.status_code} - {response.text}")
        return False
    
    active_parents = response.json()
    parent_in_active = any(p["id"] == parent_id for p in active_parents)
    
    if not parent_in_active:
        print_result(False, f"Parent not found in active list. Found {len(active_parents)} active parents")
        return False
    
    print_result(True, f"Parent found in active list ({len(active_parents)} total active)")
    
    # Get child task IDs
    parent_data = next((p for p in active_parents if p["id"] == parent_id), None)
    if not parent_data or "assignees" not in parent_data:
        print_result(False, "Parent data doesn't contain assignees")
        return False
    
    child_tasks = parent_data["assignees"]
    print_result(True, f"Found {len(child_tasks)} child tasks")
    
    # Complete all child tasks
    for i, child in enumerate(child_tasks):
        task_id = child["task_id"]
        assignee_email = child["email"]
        
        # Determine which token to use
        if assignee_email == "alice@acmecorp.com":
            token = alice_token
        elif assignee_email == "bob@acmecorp.com":
            token = bob_token
        else:
            print_result(False, f"Unknown assignee: {assignee_email}")
            return False
        
        # Complete the task (sets status to "Review Pending")
        response = requests.put(
            f"{API_BASE}/tasks/{task_id}/complete",
            headers=get_headers(token)
        )
        
        if response.status_code != 200:
            print_result(False, f"Failed to complete task {task_id}: {response.status_code} - {response.text}")
            return False
        
        print_result(True, f"Completed child task {i+1}/{len(child_tasks)} (assignee: {assignee_email})")
        
        # Owner reviews and approves the task (sets status to "Completed")
        review_data = {
            "action": "accept"
        }
        
        response = requests.put(
            f"{API_BASE}/tasks/{task_id}/review",
            json=review_data,
            headers=get_headers(owner_token)
        )
        
        if response.status_code != 200:
            print_result(False, f"Failed to approve task {task_id}: {response.status_code} - {response.text}")
            return False
        
        print_result(True, f"Owner approved child task {i+1}/{len(child_tasks)}")
    
    # Wait a moment for parent status to update
    import time
    time.sleep(1)
    
    # Debug: Check the actual status of child tasks
    response = requests.get(
        f"{API_BASE}/tasks/parents?status_filter=active",
        headers=get_headers(owner_token)
    )
    if response.status_code == 200:
        debug_parents = response.json()
        debug_parent = next((p for p in debug_parents if p["id"] == parent_id), None)
        if debug_parent:
            print(f"DEBUG: Parent still in active list. Completion: {debug_parent['completed']}/{debug_parent['total']} ({debug_parent['percent']}%)")
            for assignee in debug_parent['assignees']:
                print(f"  - {assignee['email']}: {assignee['status']}")
    
    # Verify parent appears in completed list
    response = requests.get(
        f"{API_BASE}/tasks/parents?status_filter=completed",
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Failed to fetch completed parents: {response.status_code} - {response.text}")
        return False
    
    completed_parents = response.json()
    parent_in_completed = any(p["id"] == parent_id for p in completed_parents)
    
    if not parent_in_completed:
        print_result(False, f"Parent not found in completed list. Found {len(completed_parents)} completed parents")
        return False
    
    print_result(True, f"Parent found in completed list ({len(completed_parents)} total completed)")
    
    # Verify parent does NOT appear in active list anymore
    response = requests.get(
        f"{API_BASE}/tasks/parents?status_filter=active",
        headers=get_headers(owner_token)
    )
    
    if response.status_code != 200:
        print_result(False, f"Failed to fetch active parents: {response.status_code}")
        return False
    
    active_parents_after = response.json()
    parent_still_active = any(p["id"] == parent_id for p in active_parents_after)
    
    if parent_still_active:
        print_result(False, "Parent still appears in active list after completion")
        return False
    
    print_result(True, "Parent correctly removed from active list")
    
    # Verify completion percentage is 100%
    completed_parent = next((p for p in completed_parents if p["id"] == parent_id), None)
    if completed_parent and completed_parent.get("percent") == 100:
        print_result(True, f"Parent completion percentage is 100%")
    else:
        print_result(False, f"Parent completion percentage is not 100%, got: {completed_parent.get('percent') if completed_parent else 'N/A'}")
        return False
    
    return True

# =============================================================================
# MAIN TEST RUNNER
# =============================================================================
def main():
    print("\n" + "="*80)
    print("BACKEND API TESTING - GROUP FEATURES (7 Core Fixes)")
    print("="*80)
    
    results = {}
    
    # Run all tests
    results["Organization-wide Groups"] = test_organization_wide_groups()
    results["Groups Editable"] = test_groups_editable()
    results["Bulk Group Creation"] = test_bulk_group_creation()
    results["Counter-Proposal Acceptance"] = test_counter_proposal_acceptance()
    results["Completed Parent Groups Filtering"] = test_completed_parent_groups_filtering()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    print(f"{'='*80}\n")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
