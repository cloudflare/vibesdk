// Test ACI.dev connection with different auth methods
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testACIConnection() {
  // Load environment variables from .dev.vars
  const envFile = path.join(__dirname, '.dev.vars');
  let aciApiKey = process.env.ACI_API_KEY;
  let aciApiUrl = process.env.ACI_API_URL;

  // If not in environment, try loading from .dev.vars file
  if (!aciApiKey || !aciApiUrl) {
    try {
      const envContent = fs.readFileSync(envFile, 'utf8');
      const lines = envContent.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('ACI_API_KEY=')) {
          aciApiKey = trimmed.split('=')[1].replace(/"/g, '');
        }
        if (trimmed.startsWith('ACI_API_URL=')) {
          aciApiUrl = trimmed.split('=')[1].replace(/"/g, '');
        }
      }
    } catch (error) {
      console.error('❌ Could not load .dev.vars file:', error.message);
      return;
    }
  }

  if (!aciApiKey) {
    console.error('❌ ACI_API_KEY not found');
    return;
  }

  if (!aciApiUrl) {
    aciApiUrl = 'https://api.aci.dev';
  }

  console.log('🔗 Testing ACI.dev connection...');
  console.log(`📍 API URL: ${aciApiUrl}`);
  console.log(`🔑 API Key: ${aciApiKey.substring(0, 10)}...`);

  // Try different authentication methods
  const authMethods = [
    {
      name: 'Bearer Token',
      headers: { 'Authorization': `Bearer ${aciApiKey}` }
    },
    {
      name: 'API Key Header',
      headers: { 'X-API-Key': aciApiKey }
    },
    {
      name: 'Authorization Header',
      headers: { 'Authorization': aciApiKey }
    }
  ];

  const urlsToTry = [
    aciApiUrl,
    aciApiUrl.replace(/\/$/, ''), // Remove trailing slash
    `${aciApiUrl}/v1`,
    'https://api.aci.dev',
    'https://aci-api.assista.dev'
  ];

  for (const url of urlsToTry) {
    console.log(`\n🌐 Testing URL: ${url}`);

    for (const auth of authMethods) {
      console.log(`   🔐 Testing auth method: ${auth.name}`);

      try {
        const response = await fetch(`${url}/apps/search?intent=search&limit=1`, {
          headers: {
            'Content-Type': 'application/json',
            ...auth.headers,
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log(`   ✅ SUCCESS with ${auth.name}! Found ${Array.isArray(data) ? data.length : 'unknown'} results`);
          return { success: true, url, auth: auth.name };
        } else {
          console.log(`   ❌ ${response.status} ${response.statusText} with ${auth.name}`);
          if (response.status === 403) {
            try {
              const errorData = await response.json();
              console.log(`   💬 Error: ${JSON.stringify(errorData)}`);
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
      } catch (error) {
        console.log(`   ❌ Error with ${auth.name}: ${error.message}`);
      }
    }
  }

  console.log('\n❌ All authentication methods failed');
  return { success: false };
}

// Run the test
testACIConnection().then(result => {
  if (result.success) {
    console.log(`\n🎉 Found working combination:`);
    console.log(`   URL: ${result.url}`);
    console.log(`   Auth: ${result.auth}`);
  } else {
    console.log('\n💡 Try these solutions:');
    console.log('   1. Verify API key is correct in ACI.dev dashboard');
    console.log('   2. Check if API key has expired');
    console.log('   3. Ensure API key has proper permissions');
    console.log('   4. Try generating a new API key');
  }
}).catch(console.error);
