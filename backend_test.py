import requests
import sys
import json
from datetime import datetime, timedelta
import pymongo
import os

class TaskHubHierarchicalTester:
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
        """Test user1@testcompany.com registration"""
        success, response = self.run_test(
            "User1 Registration",
            "POST",
            "auth/register",
            200,
            data={
                "name": "User One",
                "email": "user1@testcompany.com",
                "password": "TestPass123!"
            }
        )
        if success:
            self.user1_data = {
                "email": "user1@testcompany.com",
                "verification_code": response.get("verification_code"),
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
                "name": "User Two",
                "email": "user2@testcompany.com",
                "password": "TestPass123!"
            }
        )
        if success:
            self.user2_data = {
                "email": "user2@testcompany.com",
                "verification_code": response.get("verification_code"),
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
                "email": "user1@testcompany.com",
                "password": "TestPass123!"
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
                "email": "user2@testcompany.com",
                "password": "TestPass123!"
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
                {"email": "user1@testcompany.com"},
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
        if not self.db:
            print("❌ No database connection available")
            return False
            
        try:
            result = self.db.users.update_one(
                {"email": "user2@testcompany.com"},
                {"$set": {
                    "subscription_tier": "teams",
                    "team_owner_email": "user1@testcompany.com"
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

    def test_get_my_manager_user1(self):
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
            self.db.users.delete_many({"email": {"$in": ["user1@testcompany.com", "user2@testcompany.com"]}})
            # Remove test tasks
            if self.test_task_id:
                self.db.tasks.delete_one({"id": self.test_task_id})
            print("✅ Test data cleaned up")
        except Exception as e:
            print(f"⚠️ Cleanup failed: {e}")

def main():
    print("🚀 Starting Task Hub Hierarchical Team Structure API Tests")
    print("=" * 70)
    
    tester = TaskHubHierarchicalTester()
    
    # Clean up any existing test data first
    tester.cleanup_test_data()
    
    # Test sequence following the exact scenario from the review request
    test_sequence = [
        # 1. Register two users with same domain
        ("User1 Registration", tester.test_user1_registration),
        ("User2 Registration", tester.test_user2_registration),
        
        # 2. Verify both emails and login
        ("User1 Email Verification", tester.test_user1_verification),
        ("User2 Email Verification", tester.test_user2_verification),
        ("User1 Login", tester.test_user1_login),
        ("User2 Login", tester.test_user2_login),
        
        # 3. Upgrade users to teams tier
        ("Upgrade User1 to Teams Owner", tester.upgrade_user1_to_teams_owner),
        ("Upgrade User2 to Teams Member", tester.upgrade_user2_to_teams_member),
        
        # 4. Test hierarchical team APIs
        ("Get My Manager (User1 - should be null)", tester.test_get_my_manager_user1),
        ("Get Potential Reports (User1 - should return User2)", tester.test_get_potential_reports_user1),
        ("Add Direct Report (User1 adds User2)", tester.test_add_direct_report_user1),
        ("Get Direct Reports (User1)", tester.test_get_direct_reports_user1),
        
        # 5. Create task and test metrics
        ("Create Task Assigned to User2", tester.test_create_task_assigned_to_user2),
        ("Get Direct Reports with Task Metrics", tester.test_get_direct_reports_with_task_metrics),
        
        # 6. Test bidirectional reporting
        ("Set Manager (User2 reports to User1)", tester.test_set_manager_user2),
        
        # 7. Test circular reporting prevention
        ("Circular Reporting Prevention", tester.test_circular_reporting_prevention),
        
        # 8. Test removal of direct report
        ("Remove Direct Report", tester.test_remove_direct_report),
        
        # 9. Test dashboard
        ("Get Dashboard", tester.test_get_dashboard),
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