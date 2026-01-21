import requests
import sys
import json
from datetime import datetime, timedelta
import pymongo
import os
import time
import subprocess

class TaskHubRecentChangesTester:
    def __init__(self, base_url="https://team-pulse-68.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.user1_token = None
        self.user2_token = None
        self.user1_data = None
        self.user2_data = None
        self.test_task_id = None
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

    def test_user1_registration(self):
        """Test user1@testcompany.com registration - VERIFY NO VERIFICATION CODE IN RESPONSE"""
        success, response = self.run_test(
            "User1 Registration (Email Verification Flow)",
            "POST",
            "auth/register",
            200,
            data={
                "name": "Alice Manager",
                "email": "alice.manager@tskboxtest.com",
                "password": "SecurePass123!"
            }
        )
        if success:
            # CRITICAL: Verify that verification_code is null in response
            verification_code_in_response = response.get("verification_code")
            if verification_code_in_response is not None:
                print(f"❌ SECURITY ISSUE: verification_code exposed in response: {verification_code_in_response}")
                return False
            else:
                print("✅ SECURITY: verification_code correctly hidden from response")
            
            # Get verification code from database for testing
            if self.db is not None:
                user_doc = self.db.users.find_one({"email": "alice.manager@tskboxtest.com"})
                if user_doc and "verification_code" in user_doc:
                    verification_code = user_doc["verification_code"]
                    print(f"✅ Retrieved verification code from database: {verification_code}")
                else:
                    print("❌ No verification code found in database")
                    return False
            else:
                print("❌ Cannot retrieve verification code - no database connection")
                return False
                
            self.user1_data = {
                "email": "alice.manager@tskboxtest.com",
                "verification_code": verification_code,
                "user_id": response.get("user_id")
            }
            return True
        return False

    def test_user2_registration(self):
        """Test user2@testcompany.com registration"""
        success, response = self.run_test(
            "User2 Registration",
            "POST",
            "auth/register",
            200,
            data={
                "name": "Bob Employee",
                "email": "bob.employee@tskboxtest.com",
                "password": "SecurePass123!"
            }
        )
        if success:
            # Get verification code from database
            if self.db is not None:
                user_doc = self.db.users.find_one({"email": "bob.employee@tskboxtest.com"})
                if user_doc and "verification_code" in user_doc:
                    verification_code = user_doc["verification_code"]
                else:
                    print("❌ No verification code found in database for user2")
                    return False
            else:
                print("❌ Cannot retrieve verification code - no database connection")
                return False
                
            self.user2_data = {
                "email": "bob.employee@tskboxtest.com",
                "verification_code": verification_code,
                "user_id": response.get("user_id")
            }
            return True
        return False

    def test_user1_verification(self):
        """Test user1 email verification"""
        if not self.user1_data or not self.user1_data.get("verification_code"):
            print("❌ No verification code for user1")
            return False
            
        success, response = self.run_test(
            "User1 Email Verification",
            "POST",
            "auth/verify-email",
            200,
            data={
                "email": self.user1_data["email"],
                "verification_code": self.user1_data["verification_code"]
            }
        )
        if success and 'access_token' in response:
            self.user1_token = response['access_token']
            self.user1_data.update(response['user'])
            return True
        return False

    def test_user2_verification(self):
        """Test user2 email verification"""
        if not self.user2_data or not self.user2_data.get("verification_code"):
            print("❌ No verification code for user2")
            return False
            
        success, response = self.run_test(
            "User2 Email Verification",
            "POST",
            "auth/verify-email",
            200,
            data={
                "email": self.user2_data["email"],
                "verification_code": self.user2_data["verification_code"]
            }
        )
        if success and 'access_token' in response:
            self.user2_token = response['access_token']
            self.user2_data.update(response['user'])
            return True
        return False

    def test_user1_login(self):
        """Test user1 login"""
        success, response = self.run_test(
            "User1 Login",
            "POST",
            "auth/login",
            200,
            data={
                "email": "alice.manager@tskboxtest.com",
                "password": "SecurePass123!"
            }
        )
        if success and 'access_token' in response:
            self.user1_token = response['access_token']
            self.user1_data = response['user']
            return True
        return False

    def test_user2_login(self):
        """Test user2 login"""
        success, response = self.run_test(
            "User2 Login",
            "POST",
            "auth/login",
            200,
            data={
                "email": "bob.employee@tskboxtest.com",
                "password": "SecurePass123!"
            }
        )
        if success and 'access_token' in response:
            self.user2_token = response['access_token']
            self.user2_data = response['user']
            return True
        return False

    def upgrade_user1_to_teams_owner(self):
        """Upgrade user1 to teams tier as team owner via database"""
        if self.db is None:
            print("❌ No database connection available")
            return False
            
        try:
            result = self.db.users.update_one(
                {"email": "alice.manager@tskboxtest.com"},
                {"$set": {
                    "subscription_tier": "teams",
                    "is_team_owner": True
                }}
            )
            if result.modified_count > 0:
                print("✅ User1 upgraded to teams tier (team owner)")
                return True
            else:
                print("❌ Failed to upgrade user1")
                return False
        except Exception as e:
            print(f"❌ Database upgrade failed: {e}")
            return False

    def upgrade_user2_to_teams_member(self):
        """Upgrade user2 to teams tier as team member via database"""
        if self.db is None:
            print("❌ No database connection available")
            return False
            
        try:
            result = self.db.users.update_one(
                {"email": "bob.employee@tskboxtest.com"},
                {"$set": {
                    "subscription_tier": "teams",
                    "team_owner_email": "alice.manager@tskboxtest.com"
                }}
            )
            if result.modified_count > 0:
                print("✅ User2 upgraded to teams tier (team member)")
                return True
            else:
                print("❌ Failed to upgrade user2")
                return False
        except Exception as e:
            print(f"❌ Database upgrade failed: {e}")
            return False

    def test_resend_verification_endpoint(self):
        """Test resend verification endpoint"""
        success, response = self.run_test(
            "Resend Verification Code",
            "POST",
            "auth/resend-verification?email=alice.manager@tskboxtest.com",
            200
        )
        return success

    def check_backend_logs_for_email(self, expected_email):
        """Check backend logs for email sent confirmation"""
        try:
            # Check supervisor logs for email confirmation
            result = subprocess.run(
                ["tail", "-n", "50", "/var/log/supervisor/backend.out.log"],
                capture_output=True, text=True, timeout=10
            )
            
            if result.returncode == 0:
                log_content = result.stdout
                if f"Email sent to {expected_email}" in log_content:
                    print(f"✅ Found email confirmation in logs for {expected_email}")
                    return True
                else:
                    print(f"❌ No email confirmation found in logs for {expected_email}")
                    print(f"Recent logs: {log_content[-500:]}")  # Show last 500 chars
                    return False
            else:
                print(f"❌ Failed to read logs: {result.stderr}")
                return False
        except Exception as e:
            print(f"❌ Error checking logs: {e}")
            return False

    def test_professional_email_notifications(self):
        """Test creating a task assigned to another user and verify email is sent"""
        due_date = (datetime.now() + timedelta(days=3)).isoformat()
        
        print("\n🔍 Testing Professional Email Notifications...")
        
        success, response = self.run_test(
            "Create Task for Email Notification Test",
            "POST",
            "tasks",
            200,
            data={
                "title": "Quarterly Report Review",
                "description": "Please review the Q4 financial reports and provide feedback by the due date.",
                "assigned_to": self.user2_data["id"],
                "due_date": due_date,
                "priority": "High",
                "category": "Finance"
            },
            token=self.user1_token
        )
        
        if success and 'id' in response:
            self.test_task_id = response['id']
            print(f"✅ Task created with ID: {self.test_task_id}")
            
            # Wait a moment for email to be processed
            time.sleep(2)
            
            # Check logs for email confirmation
            email_sent = self.check_backend_logs_for_email("bob.employee@tskboxtest.com")
            return email_sent
        return False

    def test_task_edit_email_notification(self):
        """Test editing a task and verify update notification is sent"""
        if not self.test_task_id:
            print("❌ No test task ID available for editing")
            return False
            
        print("\n🔍 Testing Task Edit Email Notifications...")
        
        success, response = self.run_test(
            "Edit Task for Email Notification Test",
            "PUT",
            f"tasks/{self.test_task_id}",
            200,
            data={
                "title": "Updated: Quarterly Report Review",
                "description": "UPDATED: Please review the Q4 financial reports and provide detailed feedback by the new due date.",
                "priority": "Urgent"
            },
            token=self.user1_token
        )
        
        if success:
            # Wait a moment for email to be processed
            time.sleep(2)
            
            # Check logs for email confirmation
            email_sent = self.check_backend_logs_for_email("bob.employee@tskboxtest.com")
            return email_sent
        return False

    def test_analytics_with_assignee_breakdown(self):
        """Test POST /api/analytics with date range and verify assignee_breakdown array"""
        start_date = (datetime.now() - timedelta(days=30)).isoformat()
        end_date = datetime.now().isoformat()
        
        print("\n🔍 Testing Analytics Endpoint with Per-Assignee Breakdown...")
        
        success, response = self.run_test(
            "Analytics with Assignee Breakdown",
            "POST",
            "analytics",
            200,
            data={
                "start_date": start_date,
                "end_date": end_date
            },
            token=self.user1_token
        )
        
        if success:
            # Verify assignee_breakdown array exists
            if "assignee_breakdown" not in response:
                print("❌ Missing 'assignee_breakdown' field in analytics response")
                return False
                
            assignee_breakdown = response["assignee_breakdown"]
            if not isinstance(assignee_breakdown, list):
                print("❌ 'assignee_breakdown' is not an array")
                return False
                
            print(f"✅ Found assignee_breakdown array with {len(assignee_breakdown)} entries")
            
            # Check if we have any assignee data
            if len(assignee_breakdown) > 0:
                first_assignee = assignee_breakdown[0]
                required_fields = ["name", "email", "tasks_assigned", "tasks_completed", "tasks_pending", "completion_rate", "avg_completion_days"]
                
                for field in required_fields:
                    if field not in first_assignee:
                        print(f"❌ Missing required field '{field}' in assignee breakdown")
                        return False
                        
                print("✅ All required fields present in assignee breakdown")
                print(f"Sample assignee data: {first_assignee}")
            else:
                print("✅ Assignee breakdown array is empty (expected if no tasks assigned to others)")
                
            return True
        return False

    def test_bulk_task_creation(self):
        """Test POST /api/tasks/bulk with multiple assignees"""
        due_date = (datetime.now() + timedelta(days=5)).isoformat()
        
        print("\n🔍 Testing Bulk Task Creation...")
        
        # Create bulk tasks for multiple assignees
        success, response = self.run_test(
            "Bulk Task Creation",
            "POST",
            "tasks/bulk",
            200,
            data={
                "title": "Team Meeting Preparation",
                "description": "Please prepare your department updates for the upcoming team meeting.",
                "assigned_to": [
                    self.user2_data["id"],
                    "charlie.dev@tskboxtest.com",  # Non-registered user
                    "self"  # Self-assignment
                ],
                "due_date": due_date,
                "priority": "Medium",
                "category": "Meetings"
            },
            token=self.user1_token
        )
        
        if success and isinstance(response, list):
            print(f"✅ Bulk task creation successful - {len(response)} tasks created")
            
            # Verify separate tasks were created for each assignee
            if len(response) != 3:
                print(f"❌ Expected 3 tasks, got {len(response)}")
                return False
                
            # Check that each task has different assigned_to values
            assigned_to_values = [task["assigned_to"] for task in response]
            unique_assignees = set(assigned_to_values)
            
            if len(unique_assignees) != 3:
                print(f"❌ Expected 3 unique assignees, got {len(unique_assignees)}: {unique_assignees}")
                return False
                
            print("✅ Separate tasks created for each assignee")
            
            # Wait for emails to be processed
            time.sleep(3)
            
            # Check logs for email confirmations (should be sent to registered and unregistered users)
            emails_sent = 0
            if self.check_backend_logs_for_email("bob.employee@tskboxtest.com"):
                emails_sent += 1
            if self.check_backend_logs_for_email("charlie.dev@tskboxtest.com"):
                emails_sent += 1
                
            print(f"✅ Email notifications sent for bulk task creation: {emails_sent} emails")
            return True
        return False
        """Test GET /api/team/my-manager for user1 (should be null initially)"""
        success, response = self.run_test(
            "Get My Manager (User1)",
            "GET",
            "team/my-manager",
            200,
            token=self.user1_token
        )
        if success and response.get("manager") is None:
            print("✅ User1 has no manager initially (correct)")
            return True
        elif success:
            print(f"❌ Expected null manager, got: {response}")
            return False
        return False

    def test_get_potential_reports_user1(self):
        """Test GET /api/team/potential-reports for user1 (should return user2)"""
        success, response = self.run_test(
            "Get Potential Reports (User1)",
            "GET",
            "team/potential-reports",
            200,
            token=self.user1_token
        )
        if success and isinstance(response, list) and len(response) > 0:
            # Check if user2 is in the potential reports
            user2_found = any(user.get("email") == "user2@testcompany.com" for user in response)
            if user2_found:
                print("✅ User2 found in potential reports")
                return True
            else:
                print(f"❌ User2 not found in potential reports: {response}")
                return False
        return False

    def test_add_direct_report_user1(self):
        """Test POST /api/team/add-direct-report with user2's ID"""
        if not self.user2_data or not self.user2_data.get("id"):
            print("❌ No user2 ID available")
            return False
            
        success, response = self.run_test(
            "Add Direct Report (User1 adds User2)",
            "POST",
            "team/add-direct-report",
            200,
            data={"user_id": self.user2_data["id"]},
            token=self.user1_token
        )
        return success

    def test_get_direct_reports_user1(self):
        """Test GET /api/team/direct-reports for user1 (should return user2 with metrics)"""
        success, response = self.run_test(
            "Get Direct Reports (User1)",
            "GET",
            "team/direct-reports",
            200,
            token=self.user1_token
        )
        if success and isinstance(response, list) and len(response) > 0:
            # Check if user2 is in the direct reports
            user2_report = next((user for user in response if user.get("email") == "user2@testcompany.com"), None)
            if user2_report:
                print(f"✅ User2 found in direct reports with metrics: {user2_report}")
                return True
            else:
                print(f"❌ User2 not found in direct reports: {response}")
                return False
        return False

    def test_create_task_assigned_to_user2(self):
        """Test creating a task assigned to user2"""
        due_date = (datetime.now() + timedelta(days=2)).isoformat()
        success, response = self.run_test(
            "Create Task Assigned to User2",
            "POST",
            "tasks",
            200,
            data={
                "title": "Test Hierarchical Task",
                "description": "This task is assigned to user2 by user1 for testing hierarchy",
                "assigned_to": self.user2_data["id"],
                "due_date": due_date,
                "priority": "High",
                "category": "Testing"
            },
            token=self.user1_token
        )
        if success and 'id' in response:
            self.test_task_id = response['id']
            print(f"✅ Task created with ID: {self.test_task_id}")
            return True
        return False

    def test_get_direct_reports_with_task_metrics(self):
        """Test GET /api/team/direct-reports after creating task (should show 1 pending task)"""
        success, response = self.run_test(
            "Get Direct Reports with Task Metrics",
            "GET",
            "team/direct-reports",
            200,
            token=self.user1_token
        )
        if success and isinstance(response, list) and len(response) > 0:
            user2_report = next((user for user in response if user.get("email") == "user2@testcompany.com"), None)
            if user2_report and user2_report.get("tasks_from_you_pending", 0) >= 1:
                print(f"✅ User2 has pending tasks: {user2_report['tasks_from_you_pending']}")
                return True
            else:
                print(f"❌ Expected pending tasks for user2, got: {user2_report}")
                return False
        return False

    def test_set_manager_user2(self):
        """Test POST /api/team/set-manager with user1's ID (user2 reports to user1)"""
        if not self.user1_data or not self.user1_data.get("id"):
            print("❌ No user1 ID available")
            return False
            
        success, response = self.run_test(
            "Set Manager (User2 reports to User1)",
            "POST",
            "team/set-manager",
            200,
            data={"manager_id": self.user1_data["id"]},
            token=self.user2_token
        )
        return success

    def test_circular_reporting_prevention(self):
        """Test that user1 cannot report to user2 if user2 reports to user1"""
        if not self.user2_data or not self.user2_data.get("id"):
            print("❌ No user2 ID available")
            return False
            
        success, response = self.run_test(
            "Circular Reporting Prevention (User1 tries to report to User2)",
            "POST",
            "team/set-manager",
            400,  # Should fail with 400
            data={"manager_id": self.user2_data["id"]},
            token=self.user1_token
        )
        return success

    def test_remove_direct_report(self):
        """Test DELETE /api/team/direct-report/{user_id}"""
        if not self.user2_data or not self.user2_data.get("id"):
            print("❌ No user2 ID available")
            return False
            
        success, response = self.run_test(
            "Remove Direct Report (User1 removes User2)",
            "DELETE",
            f"team/direct-report/{self.user2_data['id']}",
            200,
            token=self.user1_token
        )
        return success

    def test_get_dashboard(self):
        """Test dashboard functionality"""
        success, response = self.run_test(
            "Get Dashboard (User1)",
            "GET",
            "dashboard",
            200,
            token=self.user1_token
        )
        return success

    def cleanup_test_data(self):
        """Clean up test data from database"""
        if self.db is None:
            return
            
        try:
            # Remove test users
            self.db.users.delete_many({"email": {"$in": [
                "alice.manager@tskboxtest.com", 
                "bob.employee@tskboxtest.com",
                "charlie.dev@tskboxtest.com"
            ]}})
            # Remove test tasks
            if self.test_task_id:
                self.db.tasks.delete_one({"id": self.test_task_id})
            # Remove any bulk tasks created
            self.db.tasks.delete_many({"title": {"$in": [
                "Quarterly Report Review",
                "Updated: Quarterly Report Review", 
                "Team Meeting Preparation"
            ]}})
            print("✅ Test data cleaned up")
        except Exception as e:
            print(f"⚠️ Cleanup failed: {e}")

def main():
    print("🚀 Starting Task Hub Recent Changes API Tests")
    print("Testing: Email Verification Flow, Professional Email Notifications, Analytics, Bulk Tasks")
    print("=" * 80)
    
    tester = TaskHubRecentChangesTester()
    
    # Clean up any existing test data first
    tester.cleanup_test_data()
    
    # Test sequence focusing on the 4 key areas from review request
    test_sequence = [
        # 1. EMAIL VERIFICATION FLOW
        ("User1 Registration (Email Verification Flow)", tester.test_user1_registration),
        ("User2 Registration", tester.test_user2_registration),
        ("User1 Email Verification", tester.test_user1_verification),
        ("User2 Email Verification", tester.test_user2_verification),
        ("Resend Verification Endpoint", tester.test_resend_verification_endpoint),
        ("User1 Login", tester.test_user1_login),
        ("User2 Login", tester.test_user2_login),
        
        # 2. Upgrade users for testing
        ("Upgrade User1 to Teams Owner", tester.upgrade_user1_to_teams_owner),
        ("Upgrade User2 to Teams Member", tester.upgrade_user2_to_teams_member),
        
        # 3. PROFESSIONAL EMAIL NOTIFICATIONS
        ("Professional Email Notifications (Task Creation)", tester.test_professional_email_notifications),
        ("Professional Email Notifications (Task Edit)", tester.test_task_edit_email_notification),
        
        # 4. ANALYTICS ENDPOINT WITH PER-ASSIGNEE BREAKDOWN
        ("Analytics with Assignee Breakdown", tester.test_analytics_with_assignee_breakdown),
        
        # 5. BULK TASK CREATION
        ("Bulk Task Creation", tester.test_bulk_task_creation),
    ]
    
    # Run all tests
    for test_name, test_func in test_sequence:
        try:
            test_func()
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
    
    # Clean up test data
    tester.cleanup_test_data()
    
    # Print results
    print("\n" + "=" * 80)
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