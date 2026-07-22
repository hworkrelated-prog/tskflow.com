#!/usr/bin/env python3
"""
Regression test for email pipeline changes in server.py
Tests individual email retry & non-blocking behavior, and group reminder concurrent dispatch
"""
import requests
import time
import json
from datetime import datetime, timedelta

# Load backend URL from frontend .env
with open('/app/frontend/.env', 'r') as f:
    for line in f:
        if line.startswith('REACT_APP_BACKEND_URL='):
            BACKEND_URL = line.split('=')[1].strip() + '/api'
            break

print(f"Testing backend at: {BACKEND_URL}")
print("=" * 80)

# Test credentials from /app/memory/test_credentials.md
OWNER_EMAIL = "owner@acmecorp.com"
OWNER_PASSWORD = "Password123"

def login(email, password):
    """Login and return access token"""
    response = requests.post(
        f"{BACKEND_URL}/auth/login",
        json={"email": email, "password": password}
    )
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code} - {response.text}")
        return None
    data = response.json()
    return data.get("access_token")

def test_individual_email_nonblocking():
    """
    Test 1: Individual email retry & non-blocking behaviour
    - Login as owner@acmecorp.com
    - POST /api/tasks assigning to alice@acmecorp.com
    - Measure latency (should be < 2s)
    - Verify task JSON is valid
    """
    print("\n" + "=" * 80)
    print("TEST 1: Individual Email Retry & Non-Blocking Behaviour")
    print("=" * 80)
    
    # Login
    token = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not token:
        return False
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create task assigned to alice@acmecorp.com
    task_data = {
        "title": f"Test Task - Email Pipeline {datetime.now().isoformat()}",
        "description": "Testing individual email retry and non-blocking behavior",
        "assigned_to": "alice@acmecorp.com",
        "due_date": (datetime.now() + timedelta(days=1)).isoformat(),
        "priority": "Medium",
        "category": "Work"
    }
    
    print(f"\n📤 Creating task assigned to alice@acmecorp.com...")
    start_time = time.time()
    
    response = requests.post(
        f"{BACKEND_URL}/tasks",
        json=task_data,
        headers=headers
    )
    
    latency = time.time() - start_time
    
    print(f"⏱️  Response time: {latency:.3f}s")
    
    # Check response
    if response.status_code != 200:
        print(f"❌ FAIL: Task creation failed with status {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    # Verify latency is under 2s (non-blocking)
    if latency >= 2.0:
        print(f"❌ FAIL: Response time {latency:.3f}s >= 2s (blocking detected)")
        return False
    else:
        print(f"✅ PASS: Response time {latency:.3f}s < 2s (non-blocking confirmed)")
    
    # Verify task JSON
    task_json = response.json()
    required_fields = ["id", "title", "description", "assigned_to", "created_by", "due_date", "status", "priority"]
    missing_fields = [f for f in required_fields if f not in task_json]
    
    if missing_fields:
        print(f"❌ FAIL: Missing fields in task JSON: {missing_fields}")
        return False
    
    print(f"✅ PASS: Task JSON is valid")
    print(f"   Task ID: {task_json['id']}")
    print(f"   Status: {task_json['status']}")
    print(f"   Assigned to: {task_json['assigned_to']}")
    
    return True, latency

def test_group_reminder_concurrent():
    """
    Test 2: Group reminder — concurrent dispatch
    - Login as owner
    - POST /api/tasks/bulk with 3 assignees (alice, bob, extern@partner.com)
    - GET /api/tasks/parents to get parent_id
    - POST /api/tasks/parents/{parent_id}/remind
    - Measure latency (should be < 2s)
    - Verify JSON contains reminded count > 0
    """
    print("\n" + "=" * 80)
    print("TEST 2: Group Reminder — Concurrent Dispatch")
    print("=" * 80)
    
    # Login
    token = login(OWNER_EMAIL, OWNER_PASSWORD)
    if not token:
        return False
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create bulk task with 3 assignees
    bulk_task_data = {
        "title": f"Bulk Test Task - Reminder {datetime.now().isoformat()}",
        "description": "Testing group reminder concurrent dispatch",
        "assigned_to": ["alice@acmecorp.com", "bob@acmecorp.com", "extern@partner.com"],
        "due_date": (datetime.now() + timedelta(days=2)).isoformat(),
        "priority": "High",
        "category": "Work"
    }
    
    print(f"\n📤 Creating bulk task with 3 assignees...")
    response = requests.post(
        f"{BACKEND_URL}/tasks/bulk",
        json=bulk_task_data,
        headers=headers
    )
    
    if response.status_code != 200:
        print(f"❌ FAIL: Bulk task creation failed with status {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    tasks = response.json()
    print(f"✅ Created {len(tasks)} tasks")
    
    # Get parent task groups
    print(f"\n📥 Fetching parent task groups...")
    response = requests.get(
        f"{BACKEND_URL}/tasks/parents",
        headers=headers
    )
    
    if response.status_code != 200:
        print(f"❌ FAIL: Failed to fetch parent tasks with status {response.status_code}")
        return False
    
    parents = response.json()
    if not parents:
        print(f"❌ FAIL: No parent tasks found")
        return False
    
    # Get the most recent parent (first in list, sorted by created_at desc)
    parent_id = parents[0]["id"]
    print(f"✅ Found parent task: {parent_id}")
    print(f"   Title: {parents[0]['title']}")
    print(f"   Child count: {parents[0].get('child_count', 'N/A')}")
    
    # Send reminder
    print(f"\n📧 Sending reminder to outstanding assignees...")
    start_time = time.time()
    
    response = requests.post(
        f"{BACKEND_URL}/tasks/parents/{parent_id}/remind",
        headers=headers
    )
    
    latency = time.time() - start_time
    
    print(f"⏱️  Response time: {latency:.3f}s")
    
    # Check response
    if response.status_code != 200:
        print(f"❌ FAIL: Reminder failed with status {response.status_code}")
        print(f"Response: {response.text}")
        return False
    
    # Verify latency is under 2s (concurrent dispatch)
    if latency >= 2.0:
        print(f"❌ FAIL: Response time {latency:.3f}s >= 2s (sequential dispatch detected)")
        return False
    else:
        print(f"✅ PASS: Response time {latency:.3f}s < 2s (concurrent dispatch confirmed)")
    
    # Verify reminded count
    result = response.json()
    reminded_count = result.get("reminded", 0)
    
    if reminded_count <= 0:
        print(f"❌ FAIL: Reminded count is {reminded_count}, expected > 0")
        return False
    
    print(f"✅ PASS: Reminded count = {reminded_count} (> 0)")
    print(f"   Message: {result.get('message', 'N/A')}")
    
    return True, latency

def test_startup_and_logs():
    """
    Test 3: Startup + logs sanity
    - Backend should be running
    - Check logs for tracebacks
    """
    print("\n" + "=" * 80)
    print("TEST 3: Startup + Logs Sanity")
    print("=" * 80)
    
    # Check if backend is responding
    print(f"\n🔍 Checking backend health...")
    try:
        response = requests.get(f"{BACKEND_URL.replace('/api', '')}/health", timeout=5)
        if response.status_code == 200:
            print(f"✅ Backend is running and responding")
        else:
            print(f"⚠️  Backend responded with status {response.status_code}")
    except Exception as e:
        print(f"❌ FAIL: Backend is not responding: {e}")
        return False
    
    # Check logs for tracebacks
    print(f"\n📋 Checking backend logs for tracebacks...")
    import subprocess
    result = subprocess.run(
        ["bash", "-c", "tail -n 500 /var/log/supervisor/backend.*.log | grep -i 'traceback' | wc -l"],
        capture_output=True,
        text=True
    )
    
    traceback_count = int(result.stdout.strip())
    if traceback_count > 0:
        print(f"⚠️  Found {traceback_count} traceback(s) in logs")
        # Show last few tracebacks
        result = subprocess.run(
            ["bash", "-c", "tail -n 500 /var/log/supervisor/backend.*.log | grep -A 10 -i 'traceback' | tail -30"],
            capture_output=True,
            text=True
        )
        print(f"Last traceback snippet:\n{result.stdout}")
        return False
    else:
        print(f"✅ PASS: No tracebacks found in recent logs")
    
    # Check for RESEND_API_KEY warning (expected)
    print(f"\n🔍 Checking for expected RESEND_API_KEY warning...")
    result = subprocess.run(
        ["bash", "-c", "tail -n 500 /var/log/supervisor/backend.*.log | grep -i 'resend api key not configured' | wc -l"],
        capture_output=True,
        text=True
    )
    
    warning_count = int(result.stdout.strip())
    if warning_count > 0:
        print(f"✅ PASS: Found {warning_count} expected warning(s) about missing RESEND_API_KEY")
        print(f"   (This is expected - RESEND_API_KEY is empty on purpose)")
    else:
        print(f"ℹ️  No RESEND_API_KEY warnings found (may not have triggered yet)")
    
    return True

def main():
    print("\n" + "=" * 80)
    print("REGRESSION TEST: Email Pipeline Changes")
    print("=" * 80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test User: {OWNER_EMAIL}")
    print(f"RESEND_API_KEY: EMPTY (expected - testing graceful handling)")
    print("=" * 80)
    
    results = []
    latencies = {}
    
    # Test 1: Individual email non-blocking
    try:
        result = test_individual_email_nonblocking()
        if isinstance(result, tuple):
            success, latency = result
            results.append(("Individual Email Non-Blocking", success))
            latencies["task_create"] = latency
        else:
            results.append(("Individual Email Non-Blocking", result))
    except Exception as e:
        print(f"❌ Test 1 failed with exception: {e}")
        results.append(("Individual Email Non-Blocking", False))
    
    # Test 2: Group reminder concurrent
    try:
        result = test_group_reminder_concurrent()
        if isinstance(result, tuple):
            success, latency = result
            results.append(("Group Reminder Concurrent", success))
            latencies["remind"] = latency
        else:
            results.append(("Group Reminder Concurrent", result))
    except Exception as e:
        print(f"❌ Test 2 failed with exception: {e}")
        results.append(("Group Reminder Concurrent", False))
    
    # Test 3: Startup and logs
    try:
        result = test_startup_and_logs()
        results.append(("Startup + Logs Sanity", result))
    except Exception as e:
        print(f"❌ Test 3 failed with exception: {e}")
        results.append(("Startup + Logs Sanity", False))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("\n" + "=" * 80)
    print("MEASURED LATENCIES")
    print("=" * 80)
    
    if "task_create" in latencies:
        print(f"Task Creation (POST /api/tasks): {latencies['task_create']:.3f}s")
    
    if "remind" in latencies:
        print(f"Group Reminder (POST /api/tasks/parents/{{id}}/remind): {latencies['remind']:.3f}s")
    
    print("\n" + "=" * 80)
    
    passed_count = sum(1 for _, passed in results if passed)
    total_count = len(results)
    
    print(f"\nFinal Result: {passed_count}/{total_count} tests passed")
    
    if passed_count == total_count:
        print("✅ ALL TESTS PASSED")
        return 0
    else:
        print("❌ SOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    exit(main())
