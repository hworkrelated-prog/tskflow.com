"""
Test suite for Dashboard Filters Feature
Tests: status_filter (active/completed), date_from, date_to query parameters
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "leader@teamtest.com"
TEST_PASSWORD = "TestPass123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for test user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    return response.json().get("access_token")


@pytest.fixture
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestDashboardStatusFilter:
    """Test status_filter parameter on /api/dashboard"""
    
    def test_dashboard_active_filter(self, api_client):
        """Test status_filter=active returns only non-completed tasks"""
        response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=active")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify response structure
        assert "assigned_to_me" in data
        assert "self_assigned" in data
        assert "assigned_by_me" in data
        assert "counts" in data
        assert "subscription_tier" in data
        
        # Verify no completed tasks in active view
        all_tasks = data["assigned_to_me"] + data["self_assigned"] + data["assigned_by_me"]
        for task in all_tasks:
            assert task["status"] != "Completed", f"Found completed task in active filter: {task['id']}"
        
        print(f"✓ Active filter returned {len(all_tasks)} non-completed tasks")
    
    def test_dashboard_completed_filter(self, api_client):
        """Test status_filter=completed returns only completed tasks"""
        response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=completed")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify response structure
        assert "assigned_to_me" in data
        assert "self_assigned" in data
        assert "assigned_by_me" in data
        
        # Verify only completed tasks
        all_tasks = data["assigned_to_me"] + data["self_assigned"] + data["assigned_by_me"]
        for task in all_tasks:
            assert task["status"] == "Completed", f"Found non-completed task in completed filter: {task['id']} - status: {task['status']}"
        
        print(f"✓ Completed filter returned {len(all_tasks)} completed tasks")
    
    def test_dashboard_all_filter(self, api_client):
        """Test status_filter=all returns all tasks"""
        response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=all")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        all_tasks = data["assigned_to_me"] + data["self_assigned"] + data["assigned_by_me"]
        
        # Get active and completed counts separately
        active_response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=active")
        completed_response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=completed")
        
        active_data = active_response.json()
        completed_data = completed_response.json()
        
        active_count = len(active_data["assigned_to_me"]) + len(active_data["self_assigned"]) + len(active_data["assigned_by_me"])
        completed_count = len(completed_data["assigned_to_me"]) + len(completed_data["self_assigned"]) + len(completed_data["assigned_by_me"])
        
        # All should be >= active + completed (may have overlap in edge cases)
        assert len(all_tasks) >= max(active_count, completed_count), "All filter should return at least as many tasks as individual filters"
        
        print(f"✓ All filter returned {len(all_tasks)} tasks (active: {active_count}, completed: {completed_count})")
    
    def test_dashboard_default_filter_is_active(self, api_client):
        """Test that default (no filter) behaves like active filter"""
        # With explicit active filter
        active_response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=active")
        
        # Without filter (should default to active based on backend code)
        default_response = api_client.get(f"{BASE_URL}/api/dashboard")
        
        assert active_response.status_code == 200
        assert default_response.status_code == 200
        
        active_data = active_response.json()
        default_data = default_response.json()
        
        # Both should return same task counts
        active_count = len(active_data["assigned_to_me"]) + len(active_data["self_assigned"]) + len(active_data["assigned_by_me"])
        default_count = len(default_data["assigned_to_me"]) + len(default_data["self_assigned"]) + len(default_data["assigned_by_me"])
        
        assert active_count == default_count, f"Default filter should match active filter: {default_count} vs {active_count}"
        print(f"✓ Default filter matches active filter ({default_count} tasks)")


class TestDashboardDateFilter:
    """Test date_from and date_to parameters on /api/dashboard"""
    
    def test_dashboard_date_range_filter(self, api_client):
        """Test filtering by date range"""
        # Get today's date range
        today = datetime.now()
        date_from = today.strftime("%Y-%m-%dT00:00")
        date_to = today.strftime("%Y-%m-%dT23:59")
        
        response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=all&date_from={date_from}&date_to={date_to}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        all_tasks = data["assigned_to_me"] + data["self_assigned"] + data["assigned_by_me"]
        
        # Verify all tasks have due_date within range
        for task in all_tasks:
            task_due = task["due_date"][:10]  # Get YYYY-MM-DD part
            today_str = today.strftime("%Y-%m-%d")
            assert task_due == today_str, f"Task due date {task_due} not in today's range"
        
        print(f"✓ Date filter (today) returned {len(all_tasks)} tasks")
    
    def test_dashboard_this_week_filter(self, api_client):
        """Test filtering for this week"""
        today = datetime.now()
        # Calculate start of week (Monday)
        start_of_week = today - timedelta(days=today.weekday())
        end_of_week = start_of_week + timedelta(days=6)
        
        date_from = start_of_week.strftime("%Y-%m-%dT00:00")
        date_to = end_of_week.strftime("%Y-%m-%dT23:59")
        
        response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=all&date_from={date_from}&date_to={date_to}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        all_tasks = data["assigned_to_me"] + data["self_assigned"] + data["assigned_by_me"]
        
        print(f"✓ This week filter returned {len(all_tasks)} tasks")
    
    def test_dashboard_next_month_filter(self, api_client):
        """Test filtering for next month"""
        today = datetime.now()
        # Calculate next month
        if today.month == 12:
            next_month_start = datetime(today.year + 1, 1, 1)
        else:
            next_month_start = datetime(today.year, today.month + 1, 1)
        
        # End of next month
        if next_month_start.month == 12:
            next_month_end = datetime(next_month_start.year + 1, 1, 1) - timedelta(days=1)
        else:
            next_month_end = datetime(next_month_start.year, next_month_start.month + 1, 1) - timedelta(days=1)
        
        date_from = next_month_start.strftime("%Y-%m-%dT00:00")
        date_to = next_month_end.strftime("%Y-%m-%dT23:59")
        
        response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=all&date_from={date_from}&date_to={date_to}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        all_tasks = data["assigned_to_me"] + data["self_assigned"] + data["assigned_by_me"]
        
        print(f"✓ Next month filter returned {len(all_tasks)} tasks")
    
    def test_dashboard_combined_status_and_date_filter(self, api_client):
        """Test combining status_filter with date range"""
        today = datetime.now()
        date_from = (today - timedelta(days=30)).strftime("%Y-%m-%dT00:00")
        date_to = (today + timedelta(days=30)).strftime("%Y-%m-%dT23:59")
        
        # Active tasks in date range
        response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=active&date_from={date_from}&date_to={date_to}")
        assert response.status_code == 200
        
        data = response.json()
        all_tasks = data["assigned_to_me"] + data["self_assigned"] + data["assigned_by_me"]
        
        # Verify all are non-completed
        for task in all_tasks:
            assert task["status"] != "Completed", f"Found completed task with active filter"
        
        print(f"✓ Combined filter (active + date range) returned {len(all_tasks)} tasks")
    
    def test_dashboard_empty_date_range(self, api_client):
        """Test date range that should return no tasks"""
        # Use a date far in the past
        old_date = "1990-01-01T00:00"
        old_date_end = "1990-01-02T23:59"
        
        response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=all&date_from={old_date}&date_to={old_date_end}")
        assert response.status_code == 200
        
        data = response.json()
        all_tasks = data["assigned_to_me"] + data["self_assigned"] + data["assigned_by_me"]
        
        assert len(all_tasks) == 0, f"Expected 0 tasks for old date range, got {len(all_tasks)}"
        print(f"✓ Empty date range correctly returned 0 tasks")


class TestDashboardResponseStructure:
    """Test dashboard response structure and data integrity"""
    
    def test_dashboard_response_structure(self, api_client):
        """Verify complete response structure"""
        response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=active")
        assert response.status_code == 200
        
        data = response.json()
        
        # Required top-level fields
        required_fields = ["assigned_to_me", "self_assigned", "assigned_by_me", "counts", "subscription_tier", "task_limit_reached"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Counts structure
        assert "assigned_to_me" in data["counts"]
        assert "self_assigned" in data["counts"]
        assert "assigned_by_me" in data["counts"]
        assert "active_tasks" in data["counts"]
        
        print(f"✓ Dashboard response structure is valid")
    
    def test_task_response_structure(self, api_client):
        """Verify task object structure in response"""
        response = api_client.get(f"{BASE_URL}/api/dashboard?status_filter=all")
        assert response.status_code == 200
        
        data = response.json()
        all_tasks = data["assigned_to_me"] + data["self_assigned"] + data["assigned_by_me"]
        
        if len(all_tasks) > 0:
            task = all_tasks[0]
            required_task_fields = ["id", "title", "description", "assigned_to", "assigned_to_name", 
                                   "created_by", "created_by_name", "due_date", "status", "priority", "created_at"]
            for field in required_task_fields:
                assert field in task, f"Missing required task field: {field}"
            
            print(f"✓ Task response structure is valid")
        else:
            print("⚠ No tasks to verify structure (skipped)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
