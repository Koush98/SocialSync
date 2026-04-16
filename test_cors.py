"""
Test CORS configuration on Railway backend
Run this script to verify if your Railway backend is configured correctly
"""
import requests

BACKEND_URL = "https://zippy-mindfulness-production.up.railway.app"
FRONTEND_URL = "https://social-sync-alpha.vercel.app"

print("="*70)
print("Testing CORS Configuration on Railway Backend")
print("="*70)

# Test 1: Simple CORS preflight request
print("\n1. Testing CORS preflight (OPTIONS request)...")
try:
    response = requests.options(
        f"{BACKEND_URL}/api/v1/health",
        headers={
            "Origin": FRONTEND_URL,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
        timeout=10
    )
    
    print(f"   Status Code: {response.status_code}")
    print(f"   Headers returned:")
    
    cors_headers = {
        'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin', 'NOT SET'),
        'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods', 'NOT SET'),
        'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers', 'NOT SET'),
        'Access-Control-Allow-Credentials': response.headers.get('Access-Control-Allow-Credentials', 'NOT SET'),
    }
    
    for header, value in cors_headers.items():
        print(f"   - {header}: {value}")
    
    if response.headers.get('Access-Control-Allow-Origin') == FRONTEND_URL:
        print("\n   ✅ CORS is configured correctly!")
    else:
        print(f"\n   ❌ CORS is NOT configured for {FRONTEND_URL}")
        print("   You need to update Railway environment variables!")
        
except requests.exceptions.RequestException as e:
    print(f"   ❌ Request failed: {e}")

# Test 2: Health endpoint
print("\n2. Testing health endpoint (GET request)...")
try:
    response = requests.get(
        f"{BACKEND_URL}/api/v1/health",
        headers={"Origin": FRONTEND_URL},
        timeout=10
    )
    
    print(f"   Status Code: {response.status_code}")
    print(f"   Access-Control-Allow-Origin: {response.headers.get('Access-Control-Allow-Origin', 'NOT SET')}")
    
    if response.status_code == 200:
        print(f"   Response: {response.json()}")
        print("\n   ✅ Backend is running!")
    else:
        print(f"   Response: {response.text[:200]}")
        
except requests.exceptions.RequestException as e:
    print(f"   ❌ Request failed: {e}")

# Test 3: API endpoint with auth
print("\n3. Testing accounts endpoint (requires authentication)...")
try:
    response = requests.get(
        f"{BACKEND_URL}/api/v1/accounts/",
        headers={
            "Origin": FRONTEND_URL,
            "Authorization": "Bearer test-token",
        },
        timeout=10
    )
    
    print(f"   Status Code: {response.status_code}")
    print(f"   Response Body: {response.text[:200]}")
    print(f"   All Response Headers:")
    for key, value in response.headers.items():
        print(f"     - {key}: {value}")
    
    cors_origin = response.headers.get('Access-Control-Allow-Origin', 'NOT SET')
    print(f"\n   Access-Control-Allow-Origin: {cors_origin}")
    
    if response.status_code == 401:
        print("   ⚠️  401 Unauthorized (expected - token is invalid)")
        if cors_origin == FRONTEND_URL:
            print("   ✅ But CORS is working!")
        else:
            print("   ❌ CORS is still not configured!")
            print("\n   ⏳ Railway may still be deploying...")
            print("   Check: https://railway.app/project/your-project")
    elif response.status_code == 200:
        print("   ✅ Request successful!")
        
except requests.exceptions.RequestException as e:
    print(f"   ❌ Request failed: {e}")

print("\n" + "="*70)
print("DIAGNOSIS:")
print("="*70)
print("""
If you see 'NOT SET' or your Vercel URL is not in Access-Control-Allow-Origin:

1. Go to Railway Dashboard: https://railway.app
2. Click your project → Service → Variables tab
3. Make sure these variables are set:
   
   FRONTEND_URL=https://social-sync-alpha.vercel.app
   ADDITIONAL_CORS_ORIGINS=https://social-sync-alpha.vercel.app

4. After adding, click 'Deployments' → 'Redeploy' latest deployment
5. Wait 1-2 minutes for redeployment
6. Run this script again to verify
""")
print("="*70)
