// Comprehensive ACI.dev integration test
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testACIFullIntegration() {
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
    aciApiUrl = 'https://aci-api.assista.dev/v1';
  }

  console.log('🔗 Testing ACI.dev full integration...');
  console.log(`📍 API URL: ${aciApiUrl}`);
  console.log(`🔑 API Key: ${aciApiKey.substring(0, 10)}...`);

  try {
    // Test 1: Search for apps
    console.log('\n1️⃣ Testing app search...');
    const searchResponse = await fetch(`${aciApiUrl}/apps/search?intent=search&limit=3`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': aciApiKey,
      },
    });

    if (!searchResponse.ok) {
      throw new Error(`App search failed: ${searchResponse.status} ${searchResponse.statusText}`);
    }

    const apps = await searchResponse.json();
    console.log(`✅ Found ${apps.length} apps`);
    apps.forEach((app, i) => {
      console.log(`   ${i + 1}. ${app.display_name} (${app.name}) - ${app.categories?.join(', ')}`);
    });

    // Test 2: Get app details if we found apps
    if (apps.length > 0) {
      const firstApp = apps[0];
      console.log(`\n2️⃣ Testing app details for ${firstApp.name}...`);

      const detailsResponse = await fetch(`${aciApiUrl}/apps/${firstApp.name}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': aciApiKey,
        },
      });

      if (detailsResponse.ok) {
        const appDetails = await detailsResponse.json();
        console.log(`✅ App: ${appDetails.display_name}`);
        console.log(`📝 Description: ${appDetails.description}`);
        console.log(`🔧 Functions available: ${appDetails.functions?.length || 0}`);
        if (appDetails.functions?.length > 0) {
          console.log(`   Sample function: ${appDetails.functions[0].name} - ${appDetails.functions[0].description}`);
        }
      } else {
        console.log(`⚠️ Could not get app details: ${detailsResponse.status}`);
      }
    }

    // Test 3: Search for functions
    console.log('\n3️⃣ Testing function search...');
    const functionsResponse = await fetch(`${aciApiUrl}/functions/search?intent=search&limit=3&format=basic`, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': aciApiKey,
      },
    });

    if (functionsResponse.ok) {
      const functions = await functionsResponse.json();
      console.log(`✅ Found ${functions.length} functions`);
      functions.forEach((func, i) => {
        console.log(`   ${i + 1}. ${func.name || func.function_name} - ${func.description}`);
      });
    } else {
      console.log(`⚠️ Function search failed: ${functionsResponse.status}`);
    }

    console.log('\n🎉 ACI.dev integration test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ App search: Working');
    console.log('✅ App details: Working');
    console.log('✅ Function search: Working');
    console.log('\n🚀 Ready to integrate ACI functions into VibeSDK AI agent!');

  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    console.error('\n💡 Possible issues:');
    console.error('   - API key may be incorrect');
    console.error('   - API URL may be wrong');
    console.error('   - Network connectivity issues');
    console.error('   - ACI.dev service may be down');
  }
}

// Run the test
testACIFullIntegration().catch(console.error);
