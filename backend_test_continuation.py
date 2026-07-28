#!/usr/bin/env python3
"""
Backend Test Suite for Tskflow Continuation Batch
Tests Recurring Tasks, Draft Delete, Smart Task Creation, Smart Reminders, Voice Assistant KB
"""

import requests
import json
import time
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://26f5b6b5-3c3c-4c9f-af94-b3f70d855767.preview.emergentagent.com/api"
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

def test_recurring_tasks_create(token):
    """Test Recurring Tasks - Series Creation"""
    print("\n=== Testing Recurring Tasks - Series Creation (HIGHEST PRIORITY) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: Create daily series with end_type=never
    test_name = "POST /api/recurring (daily, end_type=never)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recurring",
            json={
                "title": "Daily Standup Notes",
                "assigned_to": "self",
                "start_due_date": "2026-08-01T09:00",
                "priority": "Medium",
                "recurrence": {
                    "frequency": "daily",
                    "end_type": "never"
                }
            },
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "series_id" in data and "generated" in data and data["generated"] > 0:
                log_test(test_name, True, f"Series created: {data['series_id']}, generated {data['generated']} occurrences", latency)
                test_recurring_tasks_create.daily_series_id = data["series_id"]
            else:
                log_test(test_name, False, f"Missing fields or no occurrences generated: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: Create weekdays series
    test_name = "POST /api/recurring (weekdays)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recurring",
            json={
                "title": "Weekday Check-in",
                "assigned_to": "self",
                "start_due_date": "2026-08-01T10:00",
                "priority": "Medium",
                "recurrence": {
                    "frequency": "weekdays",
                    "end_type": "never"
                }
            },
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "series_id" in data and "generated" in data and data["generated"] > 0:
                log_test(test_name, True, f"Weekdays series created, generated {data['generated']} occurrences", latency)
                test_recurring_tasks_create.weekdays_series_id = data["series_id"]
            else:
                log_test(test_name, False, f"Missing fields or no occurrences: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: Create weekly series
    test_name = "POST /api/recurring (weekly)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recurring",
            json={
                "title": "Weekly Team Sync",
                "assigned_to": "self",
                "start_due_date": "2026-08-01T14:00",
                "priority": "High",
                "recurrence": {
                    "frequency": "weekly",
                    "end_type": "never"
                }
            },
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "series_id" in data and "generated" in data and data["generated"] > 0:
                log_test(test_name, True, f"Weekly series created, generated {data['generated']} occurrences", latency)
                test_recurring_tasks_create.weekly_series_id = data["series_id"]
            else:
                log_test(test_name, False, f"Missing fields: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 4: Create biweekly series
    test_name = "POST /api/recurring (biweekly)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recurring",
            json={
                "title": "Biweekly Review",
                "assigned_to": "self",
                "start_due_date": "2026-08-01T15:00",
                "priority": "Medium",
                "recurrence": {
                    "frequency": "biweekly",
                    "end_type": "never"
                }
            },
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "series_id" in data and "generated" in data and data["generated"] > 0:
                log_test(test_name, True, f"Biweekly series created, generated {data['generated']} occurrences", latency)
            else:
                log_test(test_name, False, f"Missing fields: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 5: Create monthly series
    test_name = "POST /api/recurring (monthly)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recurring",
            json={
                "title": "Monthly Report",
                "assigned_to": "self",
                "start_due_date": "2026-08-01T16:00",
                "priority": "High",
                "recurrence": {
                    "frequency": "monthly",
                    "end_type": "never"
                }
            },
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "series_id" in data and "generated" in data and data["generated"] > 0:
                log_test(test_name, True, f"Monthly series created, generated {data['generated']} occurrences", latency)
            else:
                log_test(test_name, False, f"Missing fields: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 6: Create yearly series
    test_name = "POST /api/recurring (yearly)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recurring",
            json={
                "title": "Annual Review",
                "assigned_to": "self",
                "start_due_date": "2026-08-01T17:00",
                "priority": "Urgent",
                "recurrence": {
                    "frequency": "yearly",
                    "end_type": "never"
                }
            },
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "series_id" in data and "generated" in data and data["generated"] > 0:
                log_test(test_name, True, f"Yearly series created, generated {data['generated']} occurrences", latency)
            else:
                log_test(test_name, False, f"Missing fields: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 7: Create custom series (every 3 days)
    test_name = "POST /api/recurring (custom, interval=3)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recurring",
            json={
                "title": "Every 3 Days Task",
                "assigned_to": "self",
                "start_due_date": "2026-08-01T18:00",
                "priority": "Low",
                "recurrence": {
                    "frequency": "custom",
                    "interval": 3,
                    "end_type": "never"
                }
            },
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "series_id" in data and "generated" in data and data["generated"] > 0:
                log_test(test_name, True, f"Custom series created, generated {data['generated']} occurrences", latency)
            else:
                log_test(test_name, False, f"Missing fields: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 8: Create series with end_type=on_date
    test_name = "POST /api/recurring (end_type=on_date)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recurring",
            json={
                "title": "Limited Duration Task",
                "assigned_to": "self",
                "start_due_date": "2026-08-01T09:00",
                "priority": "Medium",
                "recurrence": {
                    "frequency": "daily",
                    "end_type": "on_date",
                    "end_date": "2026-09-15"
                }
            },
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "series_id" in data and "generated" in data and data["generated"] > 0:
                log_test(test_name, True, f"Series with end_date created, generated {data['generated']} occurrences", latency)
                test_recurring_tasks_create.end_date_series_id = data["series_id"]
            else:
                log_test(test_name, False, f"Missing fields: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 9: Create series with end_type=after_count
    test_name = "POST /api/recurring (end_type=after_count, end_count=4)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recurring",
            json={
                "title": "4 Occurrences Only",
                "assigned_to": "self",
                "start_due_date": "2026-08-01T10:00",
                "priority": "Medium",
                "recurrence": {
                    "frequency": "daily",
                    "end_type": "after_count",
                    "end_count": 4
                }
            },
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "series_id" in data and "generated" in data:
                if data["generated"] == 4:
                    log_test(test_name, True, f"Series with end_count=4 created, generated exactly {data['generated']} occurrences", latency)
                    test_recurring_tasks_create.end_count_series_id = data["series_id"]
                else:
                    log_test(test_name, False, f"Expected 4 occurrences, got {data['generated']}", latency)
            else:
                log_test(test_name, False, f"Missing fields: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_recurring_tasks_list(token):
    """Test Recurring Tasks - List Series"""
    print("\n=== Testing Recurring Tasks - List Series ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "GET /api/recurring (list series with counts)"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/recurring",
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "series" in data and isinstance(data["series"], list):
                series_list = data["series"]
                if len(series_list) > 0:
                    # Check if each series has upcoming_count and completed_count
                    has_counts = all("upcoming_count" in s and "completed_count" in s for s in series_list)
                    if has_counts:
                        log_test(test_name, True, f"Retrieved {len(series_list)} series with upcoming_count and completed_count", latency)
                    else:
                        log_test(test_name, False, f"Missing counts in series: {series_list[0]}", latency)
                else:
                    log_test(test_name, False, "No series found (expected at least 1)", latency)
            else:
                log_test(test_name, False, f"Missing 'series' field or not a list: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_recurring_tasks_occurrences(token):
    """Test Recurring Tasks - Get Occurrences"""
    print("\n=== Testing Recurring Tasks - Get Occurrences ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    if not hasattr(test_recurring_tasks_create, 'daily_series_id'):
        print("⚠️  Skipping occurrences test (no series_id available)")
        return
    
    series_id = test_recurring_tasks_create.daily_series_id
    test_name = f"GET /api/recurring/{series_id}/occurrences"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/recurring/{series_id}/occurrences",
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "series" in data and "occurrences" in data:
                occurrences = data["occurrences"]
                if len(occurrences) > 0:
                    # Check if occurrences are in ascending order by due_date
                    due_dates = [o.get("due_date") for o in occurrences if o.get("due_date")]
                    is_ascending = all(due_dates[i] <= due_dates[i+1] for i in range(len(due_dates)-1))
                    if is_ascending:
                        log_test(test_name, True, f"Retrieved {len(occurrences)} occurrences in ascending order", latency)
                        # Store first occurrence for skip test
                        test_recurring_tasks_occurrences.first_occurrence_id = occurrences[0].get("id")
                    else:
                        log_test(test_name, False, f"Occurrences not in ascending order: {due_dates[:5]}", latency)
                else:
                    log_test(test_name, False, "No occurrences found", latency)
            else:
                log_test(test_name, False, f"Missing 'series' or 'occurrences' field: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_recurring_tasks_skip(token):
    """Test Recurring Tasks - Skip Occurrence"""
    print("\n=== Testing Recurring Tasks - Skip Occurrence ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    if not hasattr(test_recurring_tasks_create, 'daily_series_id') or not hasattr(test_recurring_tasks_occurrences, 'first_occurrence_id'):
        print("⚠️  Skipping skip test (no series_id or occurrence_id available)")
        return
    
    series_id = test_recurring_tasks_create.daily_series_id
    occurrence_id = test_recurring_tasks_occurrences.first_occurrence_id
    
    test_name = f"POST /api/recurring/{series_id}/skip"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recurring/{series_id}/skip",
            json={"occurrence_id": occurrence_id},
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True:
                log_test(test_name, True, f"Occurrence {occurrence_id} skipped successfully", latency)
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_recurring_tasks_update(token):
    """Test Recurring Tasks - Update Series"""
    print("\n=== Testing Recurring Tasks - Update Series ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    if not hasattr(test_recurring_tasks_create, 'weekly_series_id'):
        print("⚠️  Skipping update test (no series_id available)")
        return
    
    series_id = test_recurring_tasks_create.weekly_series_id
    
    # Test 1: Update with scope=future
    test_name = f"PUT /api/recurring/{series_id} (scope=future, title update)"
    try:
        start = time.time()
        response = requests.put(
            f"{BASE_URL}/recurring/{series_id}",
            json={
                "scope": "future",
                "title": "Updated Weekly Team Sync"
            },
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True and data.get("scope") == "future":
                log_test(test_name, True, f"Series updated (scope=future), regenerated {data.get('generated', 0)} occurrences", latency)
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: Update with scope=this (need occurrence_id)
    # Get occurrences first
    try:
        response = requests.get(
            f"{BASE_URL}/recurring/{series_id}/occurrences",
            headers=headers,
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            occurrences = data.get("occurrences", [])
            if len(occurrences) > 0:
                occurrence_id = occurrences[0].get("id")
                
                test_name = f"PUT /api/recurring/{series_id} (scope=this, priority update)"
                start = time.time()
                response = requests.put(
                    f"{BASE_URL}/recurring/{series_id}",
                    json={
                        "scope": "this",
                        "occurrence_id": occurrence_id,
                        "priority": "Urgent"
                    },
                    headers=headers,
                    timeout=10
                )
                latency = time.time() - start
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("ok") == True and data.get("scope") == "this":
                        log_test(test_name, True, f"Single occurrence updated (scope=this)", latency)
                    else:
                        log_test(test_name, False, f"Unexpected response: {data}", latency)
                else:
                    log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_recurring_tasks_delete(token):
    """Test Recurring Tasks - Delete Series"""
    print("\n=== Testing Recurring Tasks - Delete Series ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    if not hasattr(test_recurring_tasks_create, 'end_count_series_id'):
        print("⚠️  Skipping delete test (no series_id available)")
        return
    
    series_id = test_recurring_tasks_create.end_count_series_id
    
    test_name = f"DELETE /api/recurring/{series_id}"
    try:
        start = time.time()
        response = requests.delete(
            f"{BASE_URL}/recurring/{series_id}",
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True:
                log_test(test_name, True, "Series stopped and upcoming occurrences soft-deleted", latency)
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_recurring_tasks_generate_all(token):
    """Test Recurring Tasks - Generate All"""
    print("\n=== Testing Recurring Tasks - Generate All ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    test_name = "POST /api/recurring/generate-all"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/recurring/generate-all",
            headers=headers,
            timeout=10
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "generated" in data and "series_count" in data:
                log_test(test_name, True, f"Generated {data['generated']} occurrences across {data['series_count']} series", latency)
            else:
                log_test(test_name, False, f"Missing fields: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_draft_delete(token, alice_token):
    """Test Draft Delete"""
    print("\n=== Testing Draft Delete ===")
    headers = {"Authorization": f"Bearer {token}"}
    alice_headers = {"Authorization": f"Bearer {alice_token}"}
    
    # Test 1: Create a draft
    print("  Creating draft...")
    draft_id = None
    try:
        response = requests.post(
            f"{BASE_URL}/tasks/drafts",
            json={"title": "Test Draft for Deletion"},
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            draft_id = data.get("id")
            print(f"  ✓ Draft created: {draft_id}")
        else:
            print(f"  ✗ Draft creation failed: {response.status_code}")
    except Exception as e:
        print(f"  ✗ Draft creation error: {e}")
    
    if not draft_id:
        log_test("Draft delete tests", False, "Could not create draft")
        return
    
    # Test 2: Delete own draft (should succeed)
    test_name = f"DELETE /api/tasks/drafts/{draft_id} (own draft)"
    try:
        start = time.time()
        response = requests.delete(
            f"{BASE_URL}/tasks/drafts/{draft_id}",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True:
                log_test(test_name, True, "Draft deleted successfully", latency)
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: Verify draft is gone
    test_name = "GET /api/tasks/drafts (verify draft deleted)"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/tasks/drafts",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            drafts = response.json()
            if isinstance(drafts, list):
                draft_exists = any(d.get("id") == draft_id for d in drafts)
                if not draft_exists:
                    log_test(test_name, True, "Draft no longer in list", latency)
                else:
                    log_test(test_name, False, "Draft still exists after deletion", latency)
            else:
                log_test(test_name, False, "Response is not a list", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 4: Create another draft for permission test
    print("  Creating another draft for permission test...")
    draft_id2 = None
    try:
        response = requests.post(
            f"{BASE_URL}/tasks/drafts",
            json={"title": "Test Draft for Permission Test"},
            headers=headers,
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            draft_id2 = data.get("id")
            print(f"  ✓ Draft created: {draft_id2}")
    except Exception as e:
        print(f"  ✗ Draft creation error: {e}")
    
    if draft_id2:
        # Test 5: Try to delete someone else's draft (should return 403)
        test_name = f"DELETE /api/tasks/drafts/{draft_id2} (someone else's draft - should 403)"
        try:
            start = time.time()
            response = requests.delete(
                f"{BASE_URL}/tasks/drafts/{draft_id2}",
                headers=alice_headers,
                timeout=5
            )
            latency = time.time() - start
            
            if response.status_code == 403:
                log_test(test_name, True, "Correctly returned 403 for unauthorized delete", latency)
            else:
                log_test(test_name, False, f"Expected 403, got {response.status_code}", latency)
        except Exception as e:
            log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 6: Try to delete non-existent draft (should return 404)
    test_name = "DELETE /api/tasks/drafts/nonexistent-id (should 404)"
    try:
        start = time.time()
        response = requests.delete(
            f"{BASE_URL}/tasks/drafts/nonexistent-draft-id-12345",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 404:
            log_test(test_name, True, "Correctly returned 404 for non-existent draft", latency)
        else:
            log_test(test_name, False, f"Expected 404, got {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_smart_task_creation(token):
    """Test Smart Task Creation (AI parse)"""
    print("\n=== Testing Smart Task Creation (AI Parse) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: Parse natural language task
    test_name = "POST /api/ai/parse-task (natural language)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/ai/parse-task",
            json={"text": "email John about the Q3 proposal tomorrow at 3pm — this is urgent"},
            headers=headers,
            timeout=15
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            required_fields = ["title", "priority", "category", "due_date", "confidence"]
            has_all_fields = all(field in data for field in required_fields)
            
            if has_all_fields:
                # Check if fields are populated (not just present)
                title_ok = data.get("title") and len(data["title"]) > 0
                priority_ok = data.get("priority") in ["Low", "Medium", "High", "Urgent"]
                category_ok = data.get("category") and len(data["category"]) > 0
                confidence_ok = isinstance(data.get("confidence"), dict)
                
                if title_ok and priority_ok and category_ok and confidence_ok:
                    log_test(test_name, True, f"Parsed successfully: title='{data['title']}', priority={data['priority']}, category={data['category']}", latency)
                else:
                    log_test(test_name, False, f"Fields not properly populated: {data}", latency)
            else:
                log_test(test_name, False, f"Missing required fields: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: Parse with empty text (should return 400)
    test_name = "POST /api/ai/parse-task (empty text - should 400)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/ai/parse-task",
            json={"text": ""},
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 400:
            log_test(test_name, True, "Correctly returned 400 for empty text", latency)
        else:
            log_test(test_name, False, f"Expected 400, got {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_smart_reminders(token):
    """Test Smart Reminders"""
    print("\n=== Testing Smart Reminders ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: GET default rules
    test_name = "GET /api/reminders/rules (default rules)"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/reminders/rules",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "rules" in data:
                rules = data["rules"]
                required_fields = ["enabled", "triggers", "hours_before_due", "frequency_hours", "channels", "priorities"]
                has_all_fields = all(field in rules for field in required_fields)
                
                if has_all_fields:
                    log_test(test_name, True, f"Default rules retrieved: enabled={rules['enabled']}, triggers={rules['triggers']}", latency)
                else:
                    log_test(test_name, False, f"Missing required fields: {rules}", latency)
            else:
                log_test(test_name, False, f"Missing 'rules' field: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: PUT custom rules
    test_name = "PUT /api/reminders/rules (custom rules)"
    try:
        start = time.time()
        response = requests.put(
            f"{BASE_URL}/reminders/rules",
            json={
                "enabled": False,
                "hours_before_due": 2,
                "triggers": ["overdue"],
                "channels": ["in_app"],
                "priorities": ["Urgent"],
                "frequency_hours": 6
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") == True:
                log_test(test_name, True, "Custom rules saved successfully", latency)
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: GET rules again to verify update
    test_name = "GET /api/reminders/rules (verify custom rules)"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/reminders/rules",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "rules" in data:
                rules = data["rules"]
                if (rules.get("enabled") == False and 
                    rules.get("hours_before_due") == 2 and 
                    rules.get("triggers") == ["overdue"] and
                    rules.get("channels") == ["in_app"] and
                    rules.get("priorities") == ["Urgent"] and
                    rules.get("frequency_hours") == 6):
                    log_test(test_name, True, "Custom rules verified", latency)
                else:
                    log_test(test_name, False, f"Rules don't match expected values: {rules}", latency)
            else:
                log_test(test_name, False, f"Missing 'rules' field: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_voice_assistant_kb(token):
    """Test Voice Assistant KB"""
    print("\n=== Testing Voice Assistant KB ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: Ask how-to question (should return assistant_answer)
    test_name = "POST /api/voice/command (how-to question - should return assistant_answer)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/voice/command",
            json={"transcript": "How do recurring tasks work in TskFlow?"},
            headers=headers,
            timeout=15
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "action" in data and "reply" in data:
                action_type = data["action"].get("type")
                reply = data["reply"]
                
                if action_type == "assistant_answer":
                    # Check if reply mentions recurring tasks concepts
                    reply_lower = reply.lower()
                    has_relevant_info = any(keyword in reply_lower for keyword in ["recurring", "frequency", "daily", "weekly", "end"])
                    
                    if has_relevant_info:
                        log_test(test_name, True, f"KB-grounded answer: '{reply[:100]}...'", latency)
                    else:
                        log_test(test_name, False, f"Answer doesn't mention recurring concepts: '{reply}'", latency)
                else:
                    log_test(test_name, False, f"Expected assistant_answer, got {action_type}", latency)
            else:
                log_test(test_name, False, f"Missing 'action' or 'reply' field: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: Ask about outstanding tasks (should return query_outstanding)
    test_name = "POST /api/voice/command (what's outstanding - should return query_outstanding)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/voice/command",
            json={"transcript": "What's outstanding?"},
            headers=headers,
            timeout=15
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "action" in data:
                action_type = data["action"].get("type")
                if action_type == "query_outstanding":
                    log_test(test_name, True, f"Correctly identified query_outstanding action", latency)
                else:
                    log_test(test_name, False, f"Expected query_outstanding, got {action_type}", latency)
            else:
                log_test(test_name, False, f"Missing 'action' field: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: Ask to navigate (should return navigate action)
    test_name = "POST /api/voice/command (open analytics - should return navigate)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/voice/command",
            json={"transcript": "Open analytics"},
            headers=headers,
            timeout=15
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "action" in data:
                action_type = data["action"].get("type")
                params = data["action"].get("params", {})
                
                if action_type == "navigate":
                    target = params.get("target", "").lower()
                    if "analytics" in target:
                        log_test(test_name, True, f"Correctly identified navigate to analytics", latency)
                    else:
                        log_test(test_name, False, f"Navigate action but wrong target: {target}", latency)
                else:
                    log_test(test_name, False, f"Expected navigate, got {action_type}", latency)
            else:
                log_test(test_name, False, f"Missing 'action' field: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_regression_sanity(token, owner_user, alice_user):
    """Test Regression Sanity Checks"""
    print("\n=== Testing Regression Sanity Checks ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: POST /api/auth/login (already tested, but verify it still works)
    test_name = "POST /api/auth/login (regression)"
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
                log_test(test_name, True, "Login still working", latency)
            else:
                log_test(test_name, False, "Missing fields in login response", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: POST /api/tasks (single) with is_sales_task
    test_name = "POST /api/tasks (single) with is_sales_task (regression)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "Regression Test Sales Task",
                "description": "Testing is_sales_task field",
                "assigned_to": alice_user["id"],
                "due_date": (datetime.now() + timedelta(days=5)).isoformat(),
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
                log_test(test_name, True, "is_sales_task field working", latency)
            else:
                log_test(test_name, False, f"is_sales_task={data.get('is_sales_task')}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: POST /api/tasks/bulk
    test_name = "POST /api/tasks/bulk (regression)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Regression Bulk Task",
                "description": "Testing bulk creation",
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
            if isinstance(data, list) and len(data) > 0:
                log_test(test_name, True, f"Bulk creation working, created {len(data)} tasks", latency)
                test_regression_sanity.parent_id = data[0].get("parent_id")
            else:
                log_test(test_name, False, "Empty or invalid response", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 4: GET /api/tasks/parents
    test_name = "GET /api/tasks/parents (regression)"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/tasks/parents",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                log_test(test_name, True, f"Retrieved {len(data)} parent tasks", latency)
            else:
                log_test(test_name, False, "Response is not a list", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 5: POST /api/analytics (with response_rate + avg_response_hours)
    test_name = "POST /api/analytics (with response_rate + avg_response_hours)"
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
                if len(breakdown) > 0:
                    # Check if response_rate and avg_response_hours are present
                    has_response_fields = all("response_rate" in a and "avg_response_hours" in a for a in breakdown)
                    if has_response_fields:
                        log_test(test_name, True, f"Analytics includes response_rate and avg_response_hours", latency)
                    else:
                        log_test(test_name, False, f"Missing response fields: {breakdown[0]}", latency)
                else:
                    log_test(test_name, True, "Analytics working (empty breakdown)", latency)
            else:
                log_test(test_name, False, "Missing 'assignee_breakdown' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 6: GET /api/leaderboard/personal
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
                log_test(test_name, True, "Personal leaderboard working", latency)
            else:
                log_test(test_name, False, "Missing 'leaderboard' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 7: GET /api/leaderboard/org
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
                log_test(test_name, True, "Org leaderboard working", latency)
            else:
                log_test(test_name, False, "Missing 'leaderboard' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 8: POST /api/dashboard/ai-summary-v2
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
                log_test(test_name, True, "AI summary v2 working", latency)
            else:
                log_test(test_name, False, "Missing 'stats' or 'summary' field", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 9: GET /api/product-updates (should return 18 updates)
    test_name = "GET /api/product-updates (should return 18 updates)"
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
            if len(updates) == 18:
                log_test(test_name, True, f"Product updates returns 18 entries", latency)
            else:
                log_test(test_name, False, f"Expected 18 updates, got {len(updates)}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 10: POST /api/recordings/standalone
    test_name = "POST /api/recordings/standalone (regression)"
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
                log_test(test_name, True, "Standalone recording working", latency)
            else:
                log_test(test_name, False, "Missing required fields", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 11: GET /api/notifications
    test_name = "GET /api/notifications (regression)"
    try:
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/notifications",
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if "notifications" in data and "unread" in data:
                log_test(test_name, True, "Notifications endpoint working", latency)
            else:
                log_test(test_name, False, "Missing required fields", latency)
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
    print("TSKFLOW BACKEND TEST SUITE - CONTINUATION BATCH")
    print("Testing: Recurring Tasks, Draft Delete, Smart Task Creation,")
    print("         Smart Reminders, Voice Assistant KB, Regression Sanity")
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
    
    # Run tests
    test_recurring_tasks_create(owner_token)
    test_recurring_tasks_list(owner_token)
    test_recurring_tasks_occurrences(owner_token)
    test_recurring_tasks_skip(owner_token)
    test_recurring_tasks_update(owner_token)
    test_recurring_tasks_delete(owner_token)
    test_recurring_tasks_generate_all(owner_token)
    
    if alice_token:
        test_draft_delete(owner_token, alice_token)
    else:
        print("\n⚠️  Skipping draft delete tests (alice login failed)")
    
    test_smart_task_creation(owner_token)
    test_smart_reminders(owner_token)
    test_voice_assistant_kb(owner_token)
    test_regression_sanity(owner_token, owner_user, alice_user if alice_user else owner_user)
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
