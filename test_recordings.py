#!/usr/bin/env python3
"""
Backend API Testing for Standalone Recording Feature
Tests:
1. Login as owner@acmecorp.com
2. POST /api/recordings/standalone with sample data
3. Verify shareable link is returned
4. GET /api/recordings/{token}
5. Confirm no network errors or 404s
"""

import requests
import json

# Backend API URL
API_BASE = "http://127.0.0.1:8001/api"

# Test credentials
TEST_USER = {
    "email": "owner@acmecorp.com",
    "password": "Password123"
}

def print_test_header(test_name):
    """Print formatted test header"""
    print(f"\n{'='*80}")
    print(f"TEST: {test_name}")
    print(f"{'='*80}")

def print_result(passed, message):
    """Print test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {message}")

def login(email, password):
    """Login and return access token"""
    print(f"Logging in as {email}...")
    response = requests.post(f"{API_BASE}/auth/login", json={
        "email": email,
        "password": password
    })
    if response.status_code == 200:
        token = response.json()["access_token"]
        print_result(True, f"Login successful for {email}")
        return token
    else:
        print_result(False, f"Login failed for {email}: {response.status_code} - {response.text}")
        return None

def get_headers(token):
    """Get authorization headers"""
    return {"Authorization": f"Bearer {token}"}

def test_standalone_recording():
    """
    Test standalone recording feature:
    1. Create standalone recording via POST /api/recordings/standalone
    2. Verify shareable link is returned
    3. Retrieve recording via GET /api/recordings/{token}
    4. Verify no 404s or network errors
    """
    print_test_header("Standalone Recording Feature")
    
    # Step 1: Login
    token = login(TEST_USER["email"], TEST_USER["password"])
    if not token:
        print_result(False, "Cannot proceed without authentication")
        return False
    
    # Step 2: Create standalone recording
    print("\n--- Step 2: Creating standalone recording ---")
    recording_url = "https://example.com/sample-recording.webm"
    
    response = requests.post(
        f"{API_BASE}/recordings/standalone",
        params={"recording_url": recording_url},
        headers=get_headers(token)
    )
    
    print(f"POST /api/recordings/standalone")
    print(f"Status Code: {response.status_code}")
    
    if response.status_code != 200:
        print_result(False, f"Failed to create recording: {response.status_code} - {response.text}")
        return False
    
    recording_response = response.json()
    print(f"Response: {json.dumps(recording_response, indent=2)}")
    
    # Step 3: Verify shareable link is returned
    print("\n--- Step 3: Verifying response structure ---")
    
    required_fields = ["recording_id", "shareable_link", "shareable_token"]
    for field in required_fields:
        if field not in recording_response:
            print_result(False, f"Missing required field: {field}")
            return False
        print_result(True, f"Field '{field}' present: {recording_response[field]}")
    
    recording_id = recording_response["recording_id"]
    shareable_link = recording_response["shareable_link"]
    shareable_token = recording_response["shareable_token"]
    
    # Verify shareable_link format
    if not shareable_link.startswith("http"):
        print_result(False, f"Invalid shareable_link format: {shareable_link}")
        return False
    
    if shareable_token not in shareable_link:
        print_result(False, f"Shareable token not in link: {shareable_token} not in {shareable_link}")
        return False
    
    print_result(True, f"Shareable link format is valid: {shareable_link}")
    
    # Step 4: Retrieve recording via GET /api/recordings/{token}
    print("\n--- Step 4: Retrieving recording by token ---")
    
    response = requests.get(f"{API_BASE}/recordings/{shareable_token}")
    
    print(f"GET /api/recordings/{shareable_token}")
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 404:
        print_result(False, "Recording not found (404 error)")
        return False
    
    if response.status_code != 200:
        print_result(False, f"Failed to retrieve recording: {response.status_code} - {response.text}")
        return False
    
    retrieved_recording = response.json()
    print(f"Response: {json.dumps(retrieved_recording, indent=2)}")
    
    # Step 5: Verify retrieved data matches created data
    print("\n--- Step 5: Verifying retrieved data ---")
    
    if retrieved_recording.get("id") != recording_id:
        print_result(False, f"Recording ID mismatch: expected {recording_id}, got {retrieved_recording.get('id')}")
        return False
    
    print_result(True, f"Recording ID matches: {recording_id}")
    
    if retrieved_recording.get("recording_url") != recording_url:
        print_result(False, f"Recording URL mismatch: expected {recording_url}, got {retrieved_recording.get('recording_url')}")
        return False
    
    print_result(True, f"Recording URL matches: {recording_url}")
    
    if retrieved_recording.get("shareable_token") != shareable_token:
        print_result(False, f"Shareable token mismatch: expected {shareable_token}, got {retrieved_recording.get('shareable_token')}")
        return False
    
    print_result(True, f"Shareable token matches: {shareable_token}")
    
    # Verify no expiration (should be None for new recordings)
    if "expired" in retrieved_recording and retrieved_recording["expired"]:
        print_result(False, "Recording is marked as expired (should not be for new recording)")
        return False
    
    print_result(True, "Recording is not expired")
    
    # Step 6: Test with null recording_url (optional parameter)
    print("\n--- Step 6: Testing with null recording_url ---")
    
    response = requests.post(
        f"{API_BASE}/recordings/standalone",
        json={},
        headers=get_headers(token)
    )
    
    print(f"POST /api/recordings/standalone (no recording_url)")
    print(f"Status Code: {response.status_code}")
    
    if response.status_code != 200:
        print_result(False, f"Failed to create recording with null URL: {response.status_code} - {response.text}")
        return False
    
    null_url_response = response.json()
    print_result(True, f"Created recording with null URL: {null_url_response['recording_id']}")
    
    # Verify we can retrieve it
    response = requests.get(f"{API_BASE}/recordings/{null_url_response['shareable_token']}")
    if response.status_code != 200:
        print_result(False, f"Failed to retrieve recording with null URL: {response.status_code}")
        return False
    
    print_result(True, "Successfully retrieved recording with null URL")
    
    # Step 7: Test invalid token (should return 404)
    print("\n--- Step 7: Testing invalid token (should return 404) ---")
    
    invalid_token = "invalid-token-12345"
    response = requests.get(f"{API_BASE}/recordings/{invalid_token}")
    
    print(f"GET /api/recordings/{invalid_token}")
    print(f"Status Code: {response.status_code}")
    
    if response.status_code != 404:
        print_result(False, f"Expected 404 for invalid token, got {response.status_code}")
        return False
    
    print_result(True, "Invalid token correctly returns 404")
    
    return True

def main():
    print("\n" + "="*80)
    print("BACKEND API TESTING - STANDALONE RECORDING FEATURE")
    print("="*80)
    
    success = test_standalone_recording()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    if success:
        print("✅ ALL TESTS PASSED")
        print("\nStandalone Recording Feature is working correctly:")
        print("  - POST /api/recordings/standalone creates recording ✓")
        print("  - Shareable link is returned ✓")
        print("  - GET /api/recordings/{token} retrieves recording ✓")
        print("  - No network errors or unexpected 404s ✓")
        print("  - Invalid tokens correctly return 404 ✓")
    else:
        print("❌ TESTS FAILED")
        print("\nSome tests did not pass. See details above.")
    
    print(f"{'='*80}\n")
    
    return success

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
