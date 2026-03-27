"""
VibeSDK API Tests
Tests for the Cloudflare Workers backend APIs via FastAPI reverse proxy
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

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
    
    def test_capabilities_has_app_feature(self):
        """Test that capabilities includes the 'app' feature"""
        response = requests.get(f"{BASE_URL}/api/capabilities")
        assert response.status_code == 200
        
        data = response.json()
        features = data["data"]["features"]
        app_feature = next((f for f in features if f["id"] == "app"), None)
        
        assert app_feature is not None
        assert app_feature["name"] == "Application"
        assert app_feature["enabled"] is True


class TestStatusAPI:
    """Tests for /api/status endpoint"""
    
    def test_status_returns_success(self):
        """Test that status endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/status")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "data" in data


class TestAuthAPI:
    """Tests for /api/auth endpoints"""
    
    def test_auth_profile_returns_401_when_not_authenticated(self):
        """Test that auth/profile returns 401 when not authenticated"""
        response = requests.get(f"{BASE_URL}/api/auth/profile")
        assert response.status_code == 401
        
        data = response.json()
        assert data["success"] is False
        assert "error" in data
    
    def test_auth_providers_returns_success(self):
        """Test that auth/providers endpoint returns available providers"""
        response = requests.get(f"{BASE_URL}/api/auth/providers")
        # This should return 200 with available auth providers
        assert response.status_code == 200


class TestPublicAppsAPI:
    """Tests for /api/apps/public endpoint"""
    
    def test_public_apps_returns_success(self):
        """Test that public apps endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/apps/public")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
