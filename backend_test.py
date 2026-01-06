import requests
import sys
import json
from datetime import datetime, timedelta

class TaskAccountabilityTester:
    def __init__(self, base_url="https://accountabuddy-9.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.admin_token = None
        self.manager_token = None
        self.admin_user = None
        self.manager_user = None
        self.test_task_id = None
        self.tests_run = 0
        self.tests_passed = 0

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Response: {response.text}")

            return success, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_admin_registration(self):
        """Test admin registration with admin code"""
        success, response = self.run_test(
            "Admin Registration",
            "POST",
            "auth/register",
            200,
            data={
                "name": "Admin User",
                "email": "admin@company.com",
                "password": "AdminPass123!",
                "admin_code": "ADMIN2025"
            }
        )
        if success and 'access_token' in response:
            self.admin_token = response['access_token']
            self.admin_user = response['user']
            return True
        return False

    def test_manager_registration(self):
        """Test manager registration with same domain"""
        success, response = self.run_test(
            "Manager Registration",
            "POST",
            "auth/register",
            200,
            data={
                "name": "Manager User",
                "email": "manager@company.com",
                "password": "ManagerPass123!"
            }
        )
        if success and 'access_token' in response:
            self.manager_token = response['access_token']
            self.manager_user = response['user']
            return True
        return False

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={
                "email": "admin@company.com",
                "password": "AdminPass123!"
            }
        )
        if success and 'access_token' in response:
            self.admin_token = response['access_token']
            return True
        return False

    def test_manager_login(self):
        """Test manager login"""
        success, response = self.run_test(
            "Manager Login",
            "POST",
            "auth/login",
            200,
            data={
                "email": "manager@company.com",
                "password": "ManagerPass123!"
            }
        )
        if success and 'access_token' in response:
            self.manager_token = response['access_token']
            return True
        return False

    def test_get_current_user(self):
        """Test getting current user info"""
        success, response = self.run_test(
            "Get Current User (Admin)",
            "GET",
            "auth/me",
            200,
            token=self.admin_token
        )
        return success

    def test_get_users(self):
        """Test getting list of users (admin only)"""
        success, response = self.run_test(
            "Get Users List",
            "GET",
            "users",
            200,
            token=self.admin_token
        )
        return success

    def test_create_task(self):
        """Test creating a task"""
        due_date = (datetime.now() + timedelta(days=2)).isoformat()
        success, response = self.run_test(
            "Create Task",
            "POST",
            "tasks",
            200,
            data={
                "title": "Test Task",
                "description": "This is a test task for the accountability manager",
                "assigned_to": self.manager_user['id'],
                "due_date": due_date,
                "priority": "High",
                "category": "Testing"
            },
            token=self.admin_token
        )
        if success and 'id' in response:
            self.test_task_id = response['id']
            return True
        return False

    def test_get_tasks_admin(self):
        """Test getting all tasks as admin"""
        success, response = self.run_test(
            "Get All Tasks (Admin)",
            "GET",
            "tasks",
            200,
            token=self.admin_token
        )
        return success

    def test_get_tasks_manager(self):
        """Test getting assigned tasks as manager"""
        success, response = self.run_test(
            "Get Assigned Tasks (Manager)",
            "GET",
            "tasks",
            200,
            token=self.manager_token
        )
        return success

    def test_get_task_detail(self):
        """Test getting task details"""
        if not self.test_task_id:
            print("❌ No test task ID available")
            return False
        
        success, response = self.run_test(
            "Get Task Detail",
            "GET",
            f"tasks/{self.test_task_id}",
            200,
            token=self.manager_token
        )
        return success

    def test_accept_task(self):
        """Test accepting a task"""
        if not self.test_task_id:
            print("❌ No test task ID available")
            return False
        
        success, response = self.run_test(
            "Accept Task",
            "PUT",
            f"tasks/{self.test_task_id}/accept",
            200,
            token=self.manager_token
        )
        return success

    def test_complete_task(self):
        """Test completing a task"""
        if not self.test_task_id:
            print("❌ No test task ID available")
            return False
        
        success, response = self.run_test(
            "Complete Task",
            "PUT",
            f"tasks/{self.test_task_id}/complete",
            200,
            token=self.manager_token
        )
        return success

    def test_decline_task(self):
        """Test declining a task (create new task first)"""
        # Create another task for decline test
        due_date = (datetime.now() + timedelta(days=1)).isoformat()
        success, response = self.run_test(
            "Create Task for Decline Test",
            "POST",
            "tasks",
            200,
            data={
                "title": "Task to Decline",
                "description": "This task will be declined",
                "assigned_to": self.manager_user['id'],
                "due_date": due_date,
                "priority": "Medium",
                "category": "Testing"
            },
            token=self.admin_token
        )
        
        if success and 'id' in response:
            decline_task_id = response['id']
            success, response = self.run_test(
                "Decline Task",
                "PUT",
                f"tasks/{decline_task_id}/decline",
                200,
                data={"reason": "Not enough time to complete this task"},
                token=self.manager_token
            )
            return success
        return False

    def test_counter_propose_task(self):
        """Test counter-proposing a task"""
        # Create another task for counter-propose test
        due_date = (datetime.now() + timedelta(days=1)).isoformat()
        success, response = self.run_test(
            "Create Task for Counter-Propose Test",
            "POST",
            "tasks",
            200,
            data={
                "title": "Task to Counter-Propose",
                "description": "This task will have a counter-proposal",
                "assigned_to": self.manager_user['id'],
                "due_date": due_date,
                "priority": "Low",
                "category": "Testing"
            },
            token=self.admin_token
        )
        
        if success and 'id' in response:
            counter_task_id = response['id']
            new_due_date = (datetime.now() + timedelta(days=3)).isoformat()
            success, response = self.run_test(
                "Counter-Propose Task",
                "PUT",
                f"tasks/{counter_task_id}/counter-propose",
                200,
                data={
                    "message": "Need more time due to other priorities",
                    "proposed_due_date": new_due_date
                },
                token=self.manager_token
            )
            return success
        return False

    def test_manager_dashboard(self):
        """Test manager dashboard"""
        success, response = self.run_test(
            "Manager Dashboard",
            "GET",
            "dashboard/manager",
            200,
            token=self.manager_token
        )
        return success

    def test_admin_dashboard(self):
        """Test admin dashboard"""
        success, response = self.run_test(
            "Admin Dashboard",
            "GET",
            "dashboard/admin",
            200,
            token=self.admin_token
        )
        return success

    def test_admin_performance(self):
        """Test admin performance page"""
        success, response = self.run_test(
            "Admin Performance",
            "GET",
            "dashboard/admin/performance",
            200,
            token=self.admin_token
        )
        return success

    def test_invalid_admin_code(self):
        """Test registration with invalid admin code"""
        success, response = self.run_test(
            "Invalid Admin Code",
            "POST",
            "auth/register",
            400,
            data={
                "name": "Invalid Admin",
                "email": "invalid@company.com",
                "password": "InvalidPass123!",
                "admin_code": "WRONG_CODE"
            }
        )
        return success

    def test_wrong_domain_registration(self):
        """Test manager registration with wrong domain"""
        success, response = self.run_test(
            "Wrong Domain Registration",
            "POST",
            "auth/register",
            400,
            data={
                "name": "Wrong Domain User",
                "email": "user@wrongdomain.com",
                "password": "WrongPass123!"
            }
        )
        return success

def main():
    print("🚀 Starting Task Accountability Manager API Tests")
    print("=" * 60)
    
    tester = TaskAccountabilityTester()
    
    # Test sequence
    test_sequence = [
        # Authentication Tests
        ("Admin Registration", tester.test_admin_registration),
        ("Manager Registration", tester.test_manager_registration),
        ("Admin Login", tester.test_admin_login),
        ("Manager Login", tester.test_manager_login),
        ("Get Current User", tester.test_get_current_user),
        
        # User Management Tests
        ("Get Users List", tester.test_get_users),
        
        # Task Management Tests
        ("Create Task", tester.test_create_task),
        ("Get All Tasks (Admin)", tester.test_get_tasks_admin),
        ("Get Assigned Tasks (Manager)", tester.test_get_tasks_manager),
        ("Get Task Detail", tester.test_get_task_detail),
        ("Accept Task", tester.test_accept_task),
        ("Complete Task", tester.test_complete_task),
        ("Decline Task", tester.test_decline_task),
        ("Counter-Propose Task", tester.test_counter_propose_task),
        
        # Dashboard Tests
        ("Manager Dashboard", tester.test_manager_dashboard),
        ("Admin Dashboard", tester.test_admin_dashboard),
        ("Admin Performance", tester.test_admin_performance),
        
        # Error Handling Tests
        ("Invalid Admin Code", tester.test_invalid_admin_code),
        ("Wrong Domain Registration", tester.test_wrong_domain_registration),
    ]
    
    # Run all tests
    for test_name, test_func in test_sequence:
        try:
            test_func()
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
    
    # Print results
    print("\n" + "=" * 60)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    print(f"✅ Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())