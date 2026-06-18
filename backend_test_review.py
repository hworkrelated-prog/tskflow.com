import requests
import sys
import json
from datetime import datetime, timedelta
import pymongo
import os
import time

class TaskHubReviewTester:
    def __init__(self, base_url="https://admin-grants-preview.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.boss_token = None
        self.new_user_token = None
        self.new_user_data = None
        self.test_task_id = None
        self.bulk_task_ids = []
        self.tests_run = 0
        self.tests_passed = 0
        
        # MongoDB connection for direct database operations
        try:
            self.mongo_client = pymongo.MongoClient("mongodb://localhost:27017")
            self.db = self.mongo_client["test_database"]
        except Exception as e:
            print(f"⚠️ MongoDB connection failed: {e}")
            self.mongo_client = None
            self.db = None

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
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

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

    def test_boss_login(self):
        """Test login with existing boss@emailtest.com user"""
        success, response = self.run_test(
            "Boss Login",
            "POST",
            "auth/login",
            200,
            data={
                "email": "boss@emailtest.com",
                "password": "TestPass123"
            }
        )
        if success and 'access_token' in response:
            self.boss_token = response['access_token']
            print(f"✅ Boss logged in successfully")
            return True
        return False

    def test_new_user_registration(self):
        """Test new user registration"""
        # Use timestamp to ensure unique email
        timestamp = int(time.time())
        email = f"testuser{timestamp}@emailtest.com"
        
        success, response = self.run_test(
            "New User Registration",
            "POST",
            "auth/register",
            200,
            data={
                "name": "Test User",
                "email": email,
                "password": "TestPass123!"
            }
        )
        if success:
            self.new_user_data = {
                "email": email,
                "verification_code": response.get("verification_code"),
                "user_id": response.get("user_id")
            }
            print(f"✅ New user registered: {email}")
            return True
        return False

    def test_new_user_verification(self):
        """Test new user email verification"""
        if not self.new_user_data or not self.new_user_data.get("verification_code"):
            print("❌ No verification code for new user")
            return False
            
        success, response = self.run_test(
            "New User Email Verification",
            "POST",
            "auth/verify-email",
            200,
            data={
                "email": self.new_user_data["email"],
                "verification_code": self.new_user_data["verification_code"]
            }
        )
        if success and 'access_token' in response:
            self.new_user_token = response['access_token']
            self.new_user_data.update(response['user'])
            print(f"✅ New user verified and logged in")
            return True
        return False

    def test_token_authentication(self):
        """Test token authentication works"""
        success, response = self.run_test(
            "Token Authentication Test",
            "GET",
            "auth/me",
            200,
            token=self.boss_token
        )
        if success and response.get('email') == 'boss@emailtest.com':
            print(f"✅ Token authentication working for boss")
            return True
        return False

    def test_create_task_assigned_to_new_user(self):
        """Test creating a task assigned to the new user (should trigger email)"""
        if not self.new_user_data:
            print("❌ No new user data available")
            return False
            
        due_date = (datetime.now() + timedelta(days=3)).isoformat()
        success, response = self.run_test(
            "Create Task Assigned to New User",
            "POST",
            "tasks",
            200,
            data={
                "title": "Email Notification Test Task",
                "description": "This task should trigger an email notification to the assignee",
                "assigned_to": self.new_user_data["id"],
                "due_date": due_date,
                "priority": "High",
                "category": "Testing"
            },
            token=self.boss_token
        )
        if success and 'id' in response:
            self.test_task_id = response['id']
            print(f"✅ Task created with ID: {self.test_task_id}")
            print(f"📧 Email should be sent to: {self.new_user_data['email']}")
            return True
        return False

    def test_edit_task(self):
        """Test editing the task (should trigger update notification email)"""
        if not self.test_task_id:
            print("❌ No test task ID available")
            return False
            
        new_due_date = (datetime.now() + timedelta(days=5)).isoformat()
        success, response = self.run_test(
            "Edit Task",
            "PUT",
            f"tasks/{self.test_task_id}",
            200,
            data={
                "title": "Updated Email Notification Test Task",
                "description": "This task has been updated and should trigger an update email",
                "due_date": new_due_date,
                "priority": "Medium"
            },
            token=self.boss_token
        )
        if success:
            print(f"✅ Task updated successfully")
            print(f"📧 Update email should be sent to: {self.new_user_data['email']}")
            return True
        return False

    def test_bulk_task_creation(self):
        """Test bulk task creation with multiple assignees"""
        if not self.new_user_data:
            print("❌ No new user data available")
            return False
            
        due_date = (datetime.now() + timedelta(days=4)).isoformat()
        
        # Create bulk tasks for multiple assignees including the new user and boss (self)
        assignees = [
            self.new_user_data["id"],  # New user
            "self"  # Boss assigns to self
        ]
        
        success, response = self.run_test(
            "Bulk Task Creation",
            "POST",
            "tasks/bulk",
            200,
            data={
                "title": "Bulk Task Test",
                "description": "This is a bulk task assigned to multiple people",
                "assigned_to": assignees,
                "due_date": due_date,
                "priority": "Low",
                "category": "Bulk Testing"
            },
            token=self.boss_token
        )
        if success and isinstance(response, list) and len(response) == len(assignees):
            self.bulk_task_ids = [task['id'] for task in response]
            print(f"✅ Bulk tasks created: {len(response)} tasks")
            print(f"📧 Email should be sent to: {self.new_user_data['email']}")
            for task in response:
                print(f"   Task ID: {task['id']}, Assigned to: {task['assigned_to_name']}")
            return True
        return False

    def test_bulk_task_email_assignment(self):
        """Test bulk task creation with email addresses"""
        # Use timestamp for unique email
        timestamp = int(time.time())
        test_emails = [
            f"bulktest1_{timestamp}@emailtest.com",
            f"bulktest2_{timestamp}@emailtest.com"
        ]
        
        due_date = (datetime.now() + timedelta(days=4)).isoformat()
        
        success, response = self.run_test(
            "Bulk Task Creation with Emails",
            "POST",
            "tasks/bulk",
            200,
            data={
                "title": "Bulk Email Task Test",
                "description": "This bulk task is assigned via email addresses",
                "assigned_to": test_emails,
                "due_date": due_date,
                "priority": "Medium",
                "category": "Email Testing"
            },
            token=self.boss_token
        )
        if success and isinstance(response, list) and len(response) == len(test_emails):
            print(f"✅ Bulk email tasks created: {len(response)} tasks")
            print(f"📧 Emails should be sent to: {', '.join(test_emails)}")
            for task in response:
                print(f"   Task ID: {task['id']}, Assigned to: {task['assigned_to_name']}")
            return True
        return False

    def check_backend_logs_for_emails(self):
        """Check backend logs for email sending confirmation"""
        print("\n📋 Checking backend logs for email notifications...")
        try:
            # Check supervisor backend logs
            import subprocess
            result = subprocess.run(
                ["tail", "-n", "50", "/var/log/supervisor/backend.err.log"],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                log_content = result.stdout
                email_logs = [line for line in log_content.split('\n') if 'Email sent to' in line]
                
                if email_logs:
                    print("✅ Found email sending logs:")
                    for log in email_logs[-10:]:  # Show last 10 email logs
                        print(f"   {log}")
                    return True
                else:
                    print("❌ No email sending logs found in recent entries")
                    print("Recent log entries:")
                    for line in log_content.split('\n')[-10:]:
                        if line.strip():
                            print(f"   {line}")
                    return False
            else:
                print(f"❌ Failed to read logs: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"❌ Error checking logs: {e}")
            return False

    def test_dashboard_functionality(self):
        """Test dashboard to verify tasks are properly categorized"""
        success, response = self.run_test(
            "Dashboard Test (Boss)",
            "GET",
            "dashboard",
            200,
            token=self.boss_token
        )
        if success:
            print(f"✅ Dashboard loaded successfully")
            print(f"   Assigned to me: {len(response.get('assigned_to_me', []))}")
            print(f"   Self assigned: {len(response.get('self_assigned', []))}")
            print(f"   Assigned by me: {len(response.get('assigned_by_me', []))}")
            return True
        return False

    def cleanup_test_data(self):
        """Clean up test data from database"""
        if self.db is None:
            return
            
        try:
            # Remove test users (keep boss user)
            if self.new_user_data:
                self.db.users.delete_one({"email": self.new_user_data["email"]})
                
            # Remove test tasks
            task_ids_to_remove = []
            if self.test_task_id:
                task_ids_to_remove.append(self.test_task_id)
            task_ids_to_remove.extend(self.bulk_task_ids)
            
            if task_ids_to_remove:
                self.db.tasks.delete_many({"id": {"$in": task_ids_to_remove}})
                
            print("✅ Test data cleaned up")
        except Exception as e:
            print(f"⚠️ Cleanup failed: {e}")

def main():
    print("🚀 Starting Task Hub Review Tests")
    print("Testing: Email Notifications, Task Edit, Bulk Tasks, User Auth")
    print("=" * 70)
    
    tester = TaskHubReviewTester()
    
    # Clean up any existing test data first
    tester.cleanup_test_data()
    
    # Test sequence based on review request
    test_sequence = [
        # 1. User Registration & Auth
        ("Boss Login (existing user)", tester.test_boss_login),
        ("New User Registration", tester.test_new_user_registration),
        ("New User Email Verification", tester.test_new_user_verification),
        ("Token Authentication Test", tester.test_token_authentication),
        
        # 2. Email Notifications via Resend
        ("Create Task Assigned to New User (Email Test)", tester.test_create_task_assigned_to_new_user),
        
        # 3. Task Edit Functionality  
        ("Edit Task (Update Notification Test)", tester.test_edit_task),
        
        # 4. Bulk Task Creation
        ("Bulk Task Creation", tester.test_bulk_task_creation),
        ("Bulk Task Creation with Emails", tester.test_bulk_task_email_assignment),
        
        # 5. Dashboard verification
        ("Dashboard Functionality", tester.test_dashboard_functionality),
    ]
    
    # Run all tests
    for test_name, test_func in test_sequence:
        try:
            test_func()
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
    
    # Check email logs
    tester.check_backend_logs_for_emails()
    
    # Clean up test data
    tester.cleanup_test_data()
    
    # Print results
    print("\n" + "=" * 70)
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