"""
VibeSDK Auth API Tests - Iteration 2
Tests for authentication endpoints including CSRF token, register, and login
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCSRFToken:
    """Tests for /api/auth/csrf-token endpoint"""
    
    def test_csrf_token_returns_success(self):
        """Test that CSRF token endpoint returns 200 with token"""
        response = requests.get(f"{BASE_URL}/api/auth/csrf-token")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        assert "token" in data["data"]
        assert isinstance(data["data"]["token"], str)
        assert len(data["data"]["token"]) > 0
        print(f"CSRF token received: {data['data']['token'][:20]}...")


class TestAuthProviders:
    """Tests for /api/auth/providers endpoint"""
    
    def test_auth_providers_returns_success(self):
        """Test that auth providers endpoint returns available providers"""
        response = requests.get(f"{BASE_URL}/api/auth/providers")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        # Check for provider configuration
        print(f"Auth providers response: {data}")


class TestRegistration:
    """Tests for /api/auth/register endpoint"""
    
    def get_csrf_token(self, session):
        """Helper to get CSRF token"""
        response = session.get(f"{BASE_URL}/api/auth/csrf-token")
        if response.status_code == 200:
            data = response.json()
            return data.get("data", {}).get("token")
        return None
    
    def test_register_requires_csrf_token(self):
        """Test that registration requires CSRF token"""
        session = requests.Session()
        
        # Try to register without CSRF token
        response = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": f"test_{uuid.uuid4().hex[:8]}@vibesdk.com",
            "password": "TestPass123!",
            "name": "Test User"
        })
        
        # Should fail without CSRF token (403 or similar)
        # Note: Some implementations may return 400 or 401
        assert response.status_code in [400, 401, 403], f"Expected 400/401/403, got {response.status_code}"
        print(f"Registration without CSRF token returned: {response.status_code}")
    
    def test_register_with_csrf_token(self):
        """Test registration with CSRF token"""
        session = requests.Session()
        
        # Get CSRF token first
        csrf_token = self.get_csrf_token(session)
        assert csrf_token is not None, "Failed to get CSRF token"
        
        # Generate unique email for this test
        unique_email = f"TEST_newuser_{uuid.uuid4().hex[:8]}@vibesdk.com"
        
        # Try to register with CSRF token
        response = session.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "email": unique_email,
                "password": "NewPass123!",
                "name": "New Test User"
            },
            headers={"X-CSRF-Token": csrf_token}
        )
        
        print(f"Registration response status: {response.status_code}")
        print(f"Registration response: {response.json()}")
        
        # Registration should succeed (201) or return appropriate error
        # Note: If email already exists, it may return 400/409
        assert response.status_code in [200, 201, 400, 409], f"Unexpected status: {response.status_code}"


class TestLogin:
    """Tests for /api/auth/login endpoint"""
    
    def get_csrf_token(self, session):
        """Helper to get CSRF token"""
        response = session.get(f"{BASE_URL}/api/auth/csrf-token")
        if response.status_code == 200:
            data = response.json()
            return data.get("data", {}).get("token")
        return None
    
    def test_login_requires_csrf_token(self):
        """Test that login requires CSRF token"""
        session = requests.Session()
        
        # Try to login without CSRF token
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "testuser@vibesdk.com",
            "password": "TestPass123!"
        })
        
        # Should fail without CSRF token
        assert response.status_code in [400, 401, 403], f"Expected 400/401/403, got {response.status_code}"
        print(f"Login without CSRF token returned: {response.status_code}")
    
    def test_login_with_invalid_credentials(self):
        """Test login with invalid credentials"""
        session = requests.Session()
        
        # Get CSRF token first
        csrf_token = self.get_csrf_token(session)
        assert csrf_token is not None, "Failed to get CSRF token"
        
        # Try to login with invalid credentials
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "nonexistent@vibesdk.com",
                "password": "WrongPassword123!"
            },
            headers={"X-CSRF-Token": csrf_token}
        )
        
        print(f"Login with invalid credentials returned: {response.status_code}")
        
        # Should return 401 for invalid credentials
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_login_with_test_credentials(self):
        """Test login with test credentials (may fail if user doesn't exist)"""
        session = requests.Session()
        
        # Get CSRF token first
        csrf_token = self.get_csrf_token(session)
        assert csrf_token is not None, "Failed to get CSRF token"
        
        # Try to login with test credentials
        response = session.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "testuser@vibesdk.com",
                "password": "TestPass123!"
            },
            headers={"X-CSRF-Token": csrf_token}
        )
        
        print(f"Login with test credentials returned: {response.status_code}")
        print(f"Login response: {response.json()}")
        
        # May succeed (200) or fail (401) depending on whether user exists
        assert response.status_code in [200, 401], f"Unexpected status: {response.status_code}"


class TestCapabilitiesAPI:
    """Tests for /api/capabilities endpoint"""
    
    def test_capabilities_returns_success(self):
        """Test that capabilities endpoint returns 200 with features list"""
        response = requests.get(f"{BASE_URL}/api/capabilities")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        assert "features" in data["data"]
        assert "version" in data["data"]
        assert isinstance(data["data"]["features"], list)
        assert len(data["data"]["features"]) > 0


class TestStatusAPI:
    """Tests for /api/status endpoint"""
    
    def test_status_returns_success(self):
        """Test that status endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/status")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "data" in data


class TestPublicAppsAPI:
    """Tests for /api/apps/public endpoint"""
    
    def test_public_apps_returns_success(self):
        """Test that public apps endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/apps/public")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True


class TestForkAPI:
    """Tests for /api/apps/:id/fork endpoint"""
    
    def get_csrf_token(self, session):
        """Helper to get CSRF token"""
        response = session.get(f"{BASE_URL}/api/auth/csrf-token")
        if response.status_code == 200:
            data = response.json()
            return data.get("data", {}).get("token")
        return None
    
    def test_fork_requires_authentication(self):
        """Test that fork endpoint requires authentication"""
        session = requests.Session()
        
        # Get CSRF token
        csrf_token = self.get_csrf_token(session)
        
        # Try to fork without authentication
        response = session.post(
            f"{BASE_URL}/api/apps/invalid-app-id/fork",
            headers={"X-CSRF-Token": csrf_token} if csrf_token else {}
        )
        
        print(f"Fork without auth returned: {response.status_code}")
        
        # Should return 401 (unauthorized) or 403 (forbidden)
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
