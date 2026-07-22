#!/usr/bin/env python3
"""
Detailed test for analytics endpoint to verify response_rate and avg_response_hours
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

OWNER_EMAIL = "owner@acmecorp.com"
OWNER_PASSWORD = "Password123"
ALICE_EMAIL = "alice@acmecorp.com"
ALICE_PASSWORD = "Password123"

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

def main():
    print("🔍 Detailed Analytics Test - Verifying response_rate and avg_response_hours")
    print("="*80)
    
    owner_token = login(OWNER_EMAIL, OWNER_PASSWORD)
    alice_token = login(ALICE_EMAIL, ALICE_PASSWORD)
    
    if not owner_token or not alice_token:
        print("❌ Login failed")
        return 1
    
    # Create 2 new tasks assigned to alice
    print("\n📝 Creating 2 tasks assigned to Alice...")
    task_ids = []
    
    for i in range(2):
        task_data = {
            "title": f"Analytics Test Task {i+1} - {datetime.now().isoformat()}",
            "description": f"Test task for analytics response metrics",
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
            task_ids.append(task_id)
            print(f"✅ Created task {i+1}: {task_id}")
        else:
            print(f"❌ Failed to create task {i+1}: {response.status_code} - {response.text}")
            return 1
    
    # Wait a moment
    time.sleep(1)
    
    # Have alice accept the first task
    print(f"\n📝 Alice accepting task 1...")
    response = requests.put(
        f"{API_URL}/tasks/{task_ids[0]}/accept",
        headers={"Authorization": f"Bearer {alice_token}"}
    )
    print(f"Accept response: {response.status_code}")
    if response.status_code == 200:
        print(f"✅ Alice accepted task 1")
        print(f"   Response: {response.json()}")
    else:
        print(f"❌ Failed to accept: {response.text}")
    
    # Wait a moment
    time.sleep(1)
    
    # Have alice complete the first task
    print(f"\n📝 Alice completing task 1...")
    response = requests.put(
        f"{API_URL}/tasks/{task_ids[0]}/complete",
        headers={"Authorization": f"Bearer {alice_token}"}
    )
    print(f"Complete response: {response.status_code}")
    if response.status_code == 200:
        print(f"✅ Alice completed task 1")
        print(f"   Response: {response.json()}")
    else:
        print(f"❌ Failed to complete: {response.text}")
    
    # Wait for data to settle
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
    
    if response.status_code != 200:
        print(f"❌ Analytics failed: {response.status_code} - {response.text}")
        return 1
    
    data = response.json()
    
    if "assignee_breakdown" not in data:
        print(f"❌ Missing assignee_breakdown")
        return 1
    
    assignee_breakdown = data["assignee_breakdown"]
    
    print(f"\n📊 Assignee Breakdown ({len(assignee_breakdown)} entries):")
    
    for assignee in assignee_breakdown:
        if assignee["email"] == ALICE_EMAIL:
            print(f"\n   👤 {assignee['name']} ({assignee['email']})")
            print(f"   📈 Tasks assigned: {assignee['tasks_assigned']}")
            print(f"   ✅ Tasks completed: {assignee['tasks_completed']}")
            print(f"   ⏳ Tasks pending: {assignee['tasks_pending']}")
            print(f"   📊 Completion rate: {assignee['completion_rate']}%")
            print(f"   ⏱️  Avg completion days: {assignee['avg_completion_days']}")
            print(f"\n   🆕 NEW FIELDS:")
            print(f"   📈 Response rate: {assignee['response_rate']}%")
            print(f"   ⏱️  Avg response hours: {assignee['avg_response_hours']}")
            
            # Verify the values make sense
            if assignee['tasks_completed'] > 0:
                if assignee['response_rate'] == 0:
                    print(f"\n   ⚠️  WARNING: Tasks completed but response_rate is 0")
                else:
                    print(f"\n   ✅ Response rate > 0 (expected since tasks were completed)")
                
                if assignee['avg_response_hours'] is None:
                    print(f"   ⚠️  WARNING: Tasks completed but avg_response_hours is None")
                else:
                    print(f"   ✅ Avg response hours is a number: {assignee['avg_response_hours']}")
            else:
                print(f"\n   ℹ️  No tasks completed yet, so response metrics may be 0/None")
    
    print("\n" + "="*80)
    print("✅ Test complete - check the values above")
    return 0

if __name__ == "__main__":
    sys.exit(main())
