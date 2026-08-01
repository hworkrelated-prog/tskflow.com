#!/usr/bin/env python3
"""
Backend Test Suite for AI-First Task Creation & Nudge Features (Aug 2025 Batch #4)
Tests:
1. POST /api/ai/parse-task (enhanced with resolve=true)
2. POST /api/ai/quick-create-preview (new endpoint)
3. POST /api/tasks/{task_id}/nudge (new endpoint)
4. Regression sanity checks
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
PROUSER_EMAIL = "prouser@acmecorp.com"
PROUSER_PASSWORD = "Password123"
FREEUSER_EMAIL = "freeuser@example.org"
FREEUSER_PASSWORD = "Password123"

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
            print(f"Login failed for {email}: {response.status_code} - {response.text}")
            return None, None
    except Exception as e:
        print(f"Login error for {email}: {e}")
        return None, None

def test_ai_parse_task_enhanced(token):
    """Test POST /api/ai/parse-task with enhanced features"""
    print("\n=== Testing POST /api/ai/parse-task (Enhanced) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: Parse with resolve=true - complex text with team, urgency, and time
    test_name = "POST /api/ai/parse-task (resolve=true, complex text)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/ai/parse-task",
            json={
                "text": "I just told my team to work their MEAs by 12 PST urgently",
                "resolve": True
            },
            headers=headers,
            timeout=15
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            checks = []
            
            # Check title starts with verb
            title = data.get("title", "")
            checks.append(("title exists", bool(title)))
            checks.append(("title starts with verb", title and title[0].isupper()))
            
            # Check priority is Urgent
            priority = data.get("priority")
            checks.append(("priority=Urgent", priority == "Urgent"))
            
            # Check due_date is not null
            due_date = data.get("due_date")
            checks.append(("due_date not null", due_date is not None))
            
            # Check due_date_expression is non-empty
            due_date_expr = data.get("due_date_expression", "")
            checks.append(("due_date_expression non-empty", bool(due_date_expr)))
            
            # Check assignee_hints contains "my team" or similar
            assignee_hints = data.get("assignee_hints", [])
            has_team_hint = any("team" in str(h).lower() for h in assignee_hints)
            checks.append(("assignee_hints contains team", has_team_hint))
            
            # Check clarifying_questions is a list
            clarifying_questions = data.get("clarifying_questions", [])
            checks.append(("clarifying_questions is list", isinstance(clarifying_questions, list)))
            
            # Check confidence dict exists
            confidence = data.get("confidence", {})
            checks.append(("confidence dict exists", isinstance(confidence, dict)))
            
            # Check assignee_resolution exists (resolve=true)
            assignee_resolution = data.get("assignee_resolution", {})
            checks.append(("assignee_resolution exists", bool(assignee_resolution)))
            
            # Check assignee_resolution.resolved has entries
            resolved = assignee_resolution.get("resolved", [])
            checks.append(("assignee_resolution.resolved exists", isinstance(resolved, list)))
            
            # Check if resolved contains team/group or multiple users
            has_team_or_group = False
            if resolved:
                for r in resolved:
                    kind = r.get("kind", "")
                    if kind in ["team", "group"]:
                        has_team_or_group = True
                        member_count = r.get("member_count", 0)
                        checks.append(("member_count > 0", member_count > 0))
                        break
                    elif kind == "user":
                        has_team_or_group = len(resolved) >= 2
            
            checks.append(("resolved has team/group or 2+ users", has_team_or_group))
            
            all_passed = all(check[1] for check in checks)
            failed_checks = [check[0] for check in checks if not check[1]]
            
            if all_passed:
                log_test(test_name, True, f"All checks passed. Title: '{title}', Priority: {priority}, Due: {due_date}", latency)
            else:
                log_test(test_name, False, f"Failed checks: {failed_checks}. Response: {json.dumps(data, indent=2)[:500]}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: Parse with resolve=true - short text, no date, no assignee
    test_name = "POST /api/ai/parse-task (resolve=true, short text)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/ai/parse-task",
            json={
                "text": "Send the report",
                "resolve": True
            },
            headers=headers,
            timeout=15
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            checks = []
            
            # Check due_date is null (no date in text)
            due_date = data.get("due_date")
            checks.append(("due_date is null", due_date is None))
            
            # Check clarifying_questions has at least one entry
            clarifying_questions = data.get("clarifying_questions", [])
            checks.append(("clarifying_questions non-empty", len(clarifying_questions) > 0))
            
            # Check if questions ask about time/deadline OR who
            has_time_question = any(
                any(word in q.lower() for word in ["when", "due", "deadline", "time"])
                for q in clarifying_questions
            )
            has_who_question = any(
                any(word in q.lower() for word in ["who", "assign"])
                for q in clarifying_questions
            )
            checks.append(("has time or who question", has_time_question or has_who_question))
            
            all_passed = all(check[1] for check in checks)
            failed_checks = [check[0] for check in checks if not check[1]]
            
            if all_passed:
                log_test(test_name, True, f"All checks passed. Questions: {clarifying_questions}", latency)
            else:
                log_test(test_name, False, f"Failed checks: {failed_checks}. Response: {json.dumps(data, indent=2)[:500]}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_ai_quick_create_preview(token, alice_id, bob_id):
    """Test POST /api/ai/quick-create-preview"""
    print("\n=== Testing POST /api/ai/quick-create-preview ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: "have Alice review the deck tomorrow morning"
    test_name = "POST /api/ai/quick-create-preview (Alice tomorrow morning)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/ai/quick-create-preview",
            json={"text": "have Alice review the deck tomorrow morning"},
            headers=headers,
            timeout=15
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            checks = []
            
            # Check title mentions review or deck
            title = data.get("title", "").lower()
            checks.append(("title mentions review/deck", "review" in title or "deck" in title))
            
            # Check due_date is tomorrow around 09:00
            due_date = data.get("due_date")
            if due_date:
                try:
                    due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                    tomorrow = datetime.now() + timedelta(days=1)
                    is_tomorrow = due_dt.date() == tomorrow.date()
                    is_morning = 7 <= due_dt.hour <= 11
                    checks.append(("due_date is tomorrow", is_tomorrow))
                    checks.append(("due_date is morning (7-11am)", is_morning))
                except Exception:
                    checks.append(("due_date parseable", False))
            else:
                checks.append(("due_date exists", False))
            
            # Check assignee_resolution.resolved contains Alice
            assignee_resolution = data.get("assignee_resolution", {})
            resolved = assignee_resolution.get("resolved", [])
            has_alice = False
            for r in resolved:
                if r.get("kind") == "user":
                    name = r.get("name", "").lower()
                    email = r.get("email", "").lower()
                    if "alice" in name or "alice" in email:
                        has_alice = True
                        break
            checks.append(("assignee_resolution contains Alice", has_alice))
            
            # Check ready_to_confirm
            ready_to_confirm = data.get("ready_to_confirm")
            checks.append(("ready_to_confirm is bool", isinstance(ready_to_confirm, bool)))
            
            # Check latency < 15s
            checks.append(("latency < 15s", latency < 15))
            
            all_passed = all(check[1] for check in checks)
            failed_checks = [check[0] for check in checks if not check[1]]
            
            if all_passed:
                log_test(test_name, True, f"All checks passed. Title: '{data.get('title')}', Due: {due_date}, Ready: {ready_to_confirm}", latency)
            else:
                log_test(test_name, False, f"Failed checks: {failed_checks}. Response: {json.dumps(data, indent=2)[:500]}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: "Bob and Alice need to submit their MEA before standup Friday"
    test_name = "POST /api/ai/quick-create-preview (Bob and Alice Friday)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/ai/quick-create-preview",
            json={"text": "Bob and Alice need to submit their MEA before standup Friday"},
            headers=headers,
            timeout=15
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            checks = []
            
            # Check due_date is on Friday around 09:00
            due_date = data.get("due_date")
            if due_date:
                try:
                    due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                    is_friday = due_dt.weekday() == 4  # Friday is 4
                    is_morning = 7 <= due_dt.hour <= 11
                    checks.append(("due_date is Friday", is_friday))
                    checks.append(("due_date is morning", is_morning))
                except Exception:
                    checks.append(("due_date parseable", False))
            else:
                checks.append(("due_date exists", False))
            
            # Check assignee_resolution.resolved contains Bob AND Alice
            assignee_resolution = data.get("assignee_resolution", {})
            resolved = assignee_resolution.get("resolved", [])
            has_bob = False
            has_alice = False
            for r in resolved:
                if r.get("kind") == "user":
                    name = r.get("name", "").lower()
                    email = r.get("email", "").lower()
                    if "bob" in name or "bob" in email:
                        has_bob = True
                    if "alice" in name or "alice" in email:
                        has_alice = True
            checks.append(("assignee_resolution contains Bob", has_bob))
            checks.append(("assignee_resolution contains Alice", has_alice))
            
            # Check ready_to_confirm (can be true or false)
            ready_to_confirm = data.get("ready_to_confirm")
            checks.append(("ready_to_confirm is bool", isinstance(ready_to_confirm, bool)))
            
            all_passed = all(check[1] for check in checks)
            failed_checks = [check[0] for check in checks if not check[1]]
            
            if all_passed:
                log_test(test_name, True, f"All checks passed. Due: {due_date}, Ready: {ready_to_confirm}, Resolved: {len(resolved)} assignees", latency)
            else:
                log_test(test_name, False, f"Failed checks: {failed_checks}. Response: {json.dumps(data, indent=2)[:500]}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: "Send the report" - should have clarifying questions
    test_name = "POST /api/ai/quick-create-preview (Send the report)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/ai/quick-create-preview",
            json={"text": "Send the report"},
            headers=headers,
            timeout=15
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            checks = []
            
            # Check ready_to_confirm is false
            ready_to_confirm = data.get("ready_to_confirm")
            checks.append(("ready_to_confirm is false", ready_to_confirm == False))
            
            # Check clarifying_questions is non-empty
            clarifying_questions = data.get("clarifying_questions", [])
            checks.append(("clarifying_questions non-empty", len(clarifying_questions) > 0))
            
            # Check questions include due date and who
            has_due_question = any(
                any(word in q.lower() for word in ["when", "due", "deadline"])
                for q in clarifying_questions
            )
            has_who_question = any(
                any(word in q.lower() for word in ["who", "assign"])
                for q in clarifying_questions
            )
            checks.append(("has due date question", has_due_question))
            checks.append(("has who question", has_who_question))
            
            # Check assignee_resolution.resolved may be empty
            assignee_resolution = data.get("assignee_resolution", {})
            resolved = assignee_resolution.get("resolved", [])
            checks.append(("assignee_resolution exists", isinstance(assignee_resolution, dict)))
            
            all_passed = all(check[1] for check in checks)
            failed_checks = [check[0] for check in checks if not check[1]]
            
            if all_passed:
                log_test(test_name, True, f"All checks passed. Questions: {clarifying_questions}", latency)
            else:
                log_test(test_name, False, f"Failed checks: {failed_checks}. Response: {json.dumps(data, indent=2)[:500]}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 4: "Ship the release ASAP" - should be Urgent with due_date soon
    test_name = "POST /api/ai/quick-create-preview (Ship ASAP)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/ai/quick-create-preview",
            json={"text": "Ship the release ASAP"},
            headers=headers,
            timeout=15
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            checks = []
            
            # Check priority is Urgent
            priority = data.get("priority")
            checks.append(("priority is Urgent", priority == "Urgent"))
            
            # Check due_date is within ~2 hours from now
            due_date = data.get("due_date")
            if due_date:
                try:
                    due_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
                    now = datetime.now(due_dt.tzinfo)
                    hours_diff = (due_dt - now).total_seconds() / 3600
                    is_soon = 0 <= hours_diff <= 3  # Within 3 hours
                    checks.append(("due_date within ~2 hours", is_soon))
                except Exception:
                    checks.append(("due_date parseable", False))
            else:
                checks.append(("due_date exists", False))
            
            # Check due_date_expression contains "ASAP" or similar
            due_date_expr = data.get("due_date_expression", "").lower()
            checks.append(("due_date_expression contains ASAP", "asap" in due_date_expr or "urgent" in due_date_expr or "immediate" in due_date_expr))
            
            all_passed = all(check[1] for check in checks)
            failed_checks = [check[0] for check in checks if not check[1]]
            
            if all_passed:
                log_test(test_name, True, f"All checks passed. Priority: {priority}, Due: {due_date}, Expression: {data.get('due_date_expression')}", latency)
            else:
                log_test(test_name, False, f"Failed checks: {failed_checks}. Response: {json.dumps(data, indent=2)[:500]}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_task_nudge(owner_token, alice_token, bob_token, prouser_token, freeuser_token, alice_id, bob_id, owner_id):
    """Test POST /api/tasks/{task_id}/nudge"""
    print("\n=== Testing POST /api/tasks/{task_id}/nudge ===")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    
    # Setup: Create a bulk task with 3 assignees
    test_name = "Setup: Create bulk task with 3 assignees"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Test Nudge Task",
                "description": "This is a test task for nudge functionality",
                "priority": "High",
                "due_date": (datetime.now() + timedelta(days=2)).isoformat(),
                "assigned_to": [alice_id, bob_id, owner_id]
            },
            headers=owner_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            tasks = response.json()  # Direct list, not wrapped in dict
            parent_id = None
            
            # Find parent_id from tasks
            if isinstance(tasks, list):
                for task in tasks:
                    if task.get("parent_id"):
                        parent_id = task["parent_id"]
                        break
            
            # If no parent_id in tasks, check if there's a parent task
            if not parent_id and tasks:
                # Try to get parent from /api/tasks/parents
                parents_response = requests.get(
                    f"{BASE_URL}/tasks/parents",
                    headers=owner_headers,
                    timeout=5
                )
                if parents_response.status_code == 200:
                    parents_data = parents_response.json()
                    if isinstance(parents_data, dict):
                        parents = parents_data.get("parents", [])
                    else:
                        parents = parents_data
                    if parents:
                        parent_id = parents[0]["id"]
            
            if parent_id:
                log_test(test_name, True, f"Created bulk task with parent_id: {parent_id}", latency)
            else:
                # Use first task's ID if no parent
                parent_id = tasks[0]["id"] if tasks and isinstance(tasks, list) else None
                log_test(test_name, True, f"Created task with id: {parent_id} (no parent)", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
            return
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
        return
    
    if not parent_id:
        print("❌ Cannot proceed with nudge tests - no task_id available")
        return
    
    # Test 3a: gentle_nudge preset
    test_name = "POST /api/tasks/{id}/nudge (gentle_nudge preset)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/{parent_id}/nudge",
            json={
                "assignee_ids": [alice_id, bob_id],
                "preset": "gentle_nudge"
            },
            headers=owner_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            checks = []
            checks.append(("ok is true", data.get("ok") == True))
            checks.append(("sent is 2", data.get("sent") == 2))
            checks.append(("preset is gentle_nudge", data.get("preset") == "gentle_nudge"))
            
            all_passed = all(check[1] for check in checks)
            failed_checks = [check[0] for check in checks if not check[1]]
            
            if all_passed:
                log_test(test_name, True, f"Nudge sent successfully. Response: {data}", latency)
            else:
                log_test(test_name, False, f"Failed checks: {failed_checks}. Response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Verify notification for Alice
    test_name = "GET /api/notifications (verify nudge notification for Alice)"
    try:
        alice_headers = {"Authorization": f"Bearer {alice_token}"}
        start = time.time()
        response = requests.get(
            f"{BASE_URL}/notifications",
            headers=alice_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            notifications = data.get("notifications", [])
            has_nudge = any(n.get("type") == "nudge" for n in notifications)
            
            if has_nudge:
                log_test(test_name, True, f"Nudge notification found for Alice", latency)
            else:
                log_test(test_name, False, f"No nudge notification found. Notifications: {notifications}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3b: urgent_reminder preset
    test_name = "POST /api/tasks/{id}/nudge (urgent_reminder preset)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/{parent_id}/nudge",
            json={
                "assignee_ids": [alice_id],
                "preset": "urgent_reminder"
            },
            headers=owner_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and data.get("sent") == 1:
                log_test(test_name, True, f"Urgent reminder sent. Response: {data}", latency)
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3c: final_notice preset
    test_name = "POST /api/tasks/{id}/nudge (final_notice preset)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/{parent_id}/nudge",
            json={
                "assignee_ids": [bob_id],
                "preset": "final_notice"
            },
            headers=owner_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("ok") and data.get("sent") == 1:
                log_test(test_name, True, f"Final notice sent. Response: {data}", latency)
            else:
                log_test(test_name, False, f"Unexpected response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3d: custom preset with custom_subject and custom_message
    test_name = "POST /api/tasks/{id}/nudge (custom preset)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/{parent_id}/nudge",
            json={
                "assignee_ids": [alice_id],
                "preset": "custom",
                "custom_subject": "Test subject",
                "custom_message": "Please finish this today. Thanks!"
            },
            headers=owner_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            checks = []
            checks.append(("ok is true", data.get("ok") == True))
            checks.append(("sent is 1", data.get("sent") == 1))
            checks.append(("preset is custom", data.get("preset") == "custom"))
            
            all_passed = all(check[1] for check in checks)
            failed_checks = [check[0] for check in checks if not check[1]]
            
            if all_passed:
                log_test(test_name, True, f"Custom nudge sent. Response: {data}", latency)
            else:
                log_test(test_name, False, f"Failed checks: {failed_checks}. Response: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3e: Permission checks
    # Bob (same domain) should be ALLOWED
    test_name = "POST /api/tasks/{id}/nudge (permission: bob same-domain ALLOWED)"
    try:
        bob_headers = {"Authorization": f"Bearer {bob_token}"}
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/{parent_id}/nudge",
            json={
                "assignee_ids": [alice_id],
                "preset": "gentle_nudge"
            },
            headers=bob_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            log_test(test_name, True, f"Bob (same-domain) allowed to nudge", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Prouser (same domain) should be ALLOWED
    test_name = "POST /api/tasks/{id}/nudge (permission: prouser same-domain ALLOWED)"
    try:
        prouser_headers = {"Authorization": f"Bearer {prouser_token}"}
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/{parent_id}/nudge",
            json={
                "assignee_ids": [alice_id],
                "preset": "gentle_nudge"
            },
            headers=prouser_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            log_test(test_name, True, f"Prouser (same-domain) allowed to nudge", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Freeuser (different domain) should be FORBIDDEN
    test_name = "POST /api/tasks/{id}/nudge (permission: freeuser different-domain FORBIDDEN)"
    try:
        freeuser_headers = {"Authorization": f"Bearer {freeuser_token}"}
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/{parent_id}/nudge",
            json={
                "assignee_ids": [alice_id],
                "preset": "gentle_nudge"
            },
            headers=freeuser_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 403:
            log_test(test_name, True, f"Freeuser (different-domain) correctly forbidden", latency)
        else:
            log_test(test_name, False, f"Expected 403, got {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3f: Bad task_id should return 404
    test_name = "POST /api/tasks/{id}/nudge (bad task_id returns 404)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/does-not-exist/nudge",
            json={
                "assignee_ids": [alice_id],
                "preset": "gentle_nudge"
            },
            headers=owner_headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 404:
            log_test(test_name, True, f"Bad task_id correctly returns 404", latency)
        else:
            log_test(test_name, False, f"Expected 404, got {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")

def test_regression_sanity(token):
    """Test regression sanity checks"""
    print("\n=== Testing Regression Sanity ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Test 1: POST /api/tasks with is_sales_task=true
    test_name = "POST /api/tasks (is_sales_task=true)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks",
            json={
                "title": "Test Sales Task",
                "description": "This is a sales task",
                "priority": "Medium",
                "due_date": (datetime.now() + timedelta(days=1)).isoformat(),
                "assigned_to": "self",
                "is_sales_task": True
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            if data.get("is_sales_task") == True:
                log_test(test_name, True, f"is_sales_task=true returned correctly", latency)
            else:
                log_test(test_name, False, f"is_sales_task not true in response: {data.get('is_sales_task')}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 2: POST /api/tasks/bulk still creates parent and children
    test_name = "POST /api/tasks/bulk (creates parent and children)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Test Bulk Task",
                "description": "This is a bulk task",
                "priority": "High",
                "due_date": (datetime.now() + timedelta(days=2)).isoformat(),
                "assigned_to": [ALICE_EMAIL, BOB_EMAIL]
            },
            headers=headers,
            timeout=5
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            tasks = response.json()  # Direct list
            if len(tasks) >= 2:
                log_test(test_name, True, f"Bulk task created {len(tasks)} tasks", latency)
            else:
                log_test(test_name, False, f"Expected 2+ tasks, got {len(tasks)}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 3: POST /api/ai/parse-task WITHOUT resolve flag
    test_name = "POST /api/ai/parse-task (without resolve flag)"
    try:
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/ai/parse-task",
            json={"text": "Call John tomorrow at 3pm"},
            headers=headers,
            timeout=15
        )
        latency = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            # Should work without assignee_resolution field
            has_title = bool(data.get("title"))
            has_priority = bool(data.get("priority"))
            
            if has_title and has_priority:
                log_test(test_name, True, f"Parse without resolve works. Title: '{data.get('title')}'", latency)
            else:
                log_test(test_name, False, f"Missing required fields: {data}", latency)
        else:
            log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
    except Exception as e:
        log_test(test_name, False, f"Exception: {str(e)}")
    
    # Test 4: GET /api/tasks/{parent_id}/leaderboard
    test_name = "GET /api/tasks/{parent_id}/leaderboard (still works)"
    try:
        # First create a parent task
        bulk_response = requests.post(
            f"{BASE_URL}/tasks/bulk",
            json={
                "title": "Leaderboard Test Task",
                "description": "Test",
                "priority": "High",
                "due_date": (datetime.now() + timedelta(days=1)).isoformat(),
                "assigned_to": [ALICE_EMAIL, BOB_EMAIL]
            },
            headers=headers,
            timeout=5
        )
        
        if bulk_response.status_code == 200:
            tasks = bulk_response.json()  # Direct list
            parent_id = None
            if isinstance(tasks, list):
                for task in tasks:
                    if task.get("parent_id"):
                        parent_id = task["parent_id"]
                        break
            
            if not parent_id and tasks:
                # Try to get parent from /api/tasks/parents
                parents_response = requests.get(
                    f"{BASE_URL}/tasks/parents",
                    headers=headers,
                    timeout=5
                )
                if parents_response.status_code == 200:
                    parents_data = parents_response.json()
                    if isinstance(parents_data, dict):
                        parents = parents_data.get("parents", [])
                    else:
                        parents = parents_data
                    if parents:
                        parent_id = parents[0]["id"]
            
            if parent_id:
                start = time.time()
                response = requests.get(
                    f"{BASE_URL}/tasks/{parent_id}/leaderboard",
                    headers=headers,
                    timeout=5
                )
                latency = time.time() - start
                
                if response.status_code == 200:
                    data = response.json()
                    leaderboard = data.get("leaderboard", [])
                    if isinstance(leaderboard, list):
                        log_test(test_name, True, f"Leaderboard endpoint works. {len(leaderboard)} entries", latency)
                    else:
                        log_test(test_name, False, f"Leaderboard not a list: {data}", latency)
                else:
                    log_test(test_name, False, f"Status {response.status_code}: {response.text[:200]}", latency)
            else:
                log_test(test_name, False, "Could not find parent_id for leaderboard test")
        else:
            log_test(test_name, False, f"Failed to create bulk task: {bulk_response.status_code}")
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
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    print(f"Success Rate: {(passed/total*100):.1f}%")
    
    if failed > 0:
        print("\n" + "="*80)
        print("FAILED TESTS")
        print("="*80)
        for r in test_results:
            if not r["passed"]:
                print(f"\n❌ {r['test']}")
                if r["message"]:
                    print(f"   {r['message']}")

def main():
    print("="*80)
    print("AI-FIRST TASK CREATION & NUDGE FEATURES TEST SUITE")
    print("Aug 2025 Batch #4")
    print("="*80)
    
    # Login as owner
    print("\n=== Logging in as owner@acmecorp.com ===")
    owner_token, owner_user = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not owner_token:
        print("❌ Failed to login as owner. Aborting tests.")
        return
    print(f"✅ Logged in as {owner_user.get('name')} ({owner_user.get('email')})")
    owner_id = owner_user.get("id")
    
    # Login as alice
    print("\n=== Logging in as alice@acmecorp.com ===")
    alice_token, alice_user = login(ALICE_EMAIL, ALICE_PASSWORD)
    if not alice_token:
        print("❌ Failed to login as alice. Some tests will be skipped.")
        alice_id = None
    else:
        print(f"✅ Logged in as {alice_user.get('name')} ({alice_user.get('email')})")
        alice_id = alice_user.get("id")
    
    # Login as bob
    print("\n=== Logging in as bob@acmecorp.com ===")
    bob_token, bob_user = login(BOB_EMAIL, BOB_PASSWORD)
    if not bob_token:
        print("❌ Failed to login as bob. Some tests will be skipped.")
        bob_id = None
    else:
        print(f"✅ Logged in as {bob_user.get('name')} ({bob_user.get('email')})")
        bob_id = bob_user.get("id")
    
    # Login as prouser
    print("\n=== Logging in as prouser@acmecorp.com ===")
    prouser_token, prouser_user = login(PROUSER_EMAIL, PROUSER_PASSWORD)
    if not prouser_token:
        print("❌ Failed to login as prouser. Some tests will be skipped.")
    else:
        print(f"✅ Logged in as {prouser_user.get('name')} ({prouser_user.get('email')})")
    
    # Login as freeuser
    print("\n=== Logging in as freeuser@example.org ===")
    freeuser_token, freeuser_user = login(FREEUSER_EMAIL, FREEUSER_PASSWORD)
    if not freeuser_token:
        print("❌ Failed to login as freeuser. Some tests will be skipped.")
    else:
        print(f"✅ Logged in as {freeuser_user.get('name')} ({freeuser_user.get('email')})")
    
    # Run tests
    test_ai_parse_task_enhanced(owner_token)
    
    if alice_id and bob_id:
        test_ai_quick_create_preview(owner_token, alice_id, bob_id)
    else:
        print("\n⚠️ Skipping quick-create-preview tests (missing alice or bob)")
    
    if alice_id and bob_id and alice_token and bob_token and prouser_token and freeuser_token:
        test_task_nudge(owner_token, alice_token, bob_token, prouser_token, freeuser_token, alice_id, bob_id, owner_id)
    else:
        print("\n⚠️ Skipping nudge tests (missing required users)")
    
    test_regression_sanity(owner_token)
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
