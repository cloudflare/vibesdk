import { ACIService } from './src/services/aci.service';

// Test ACI.dev connection
async function testACIConnection() {
  const aciApiKey = process.env.ACI_API_KEY;
  const aciApiUrl = process.env.ACI_API_URL || 'https://api.aci.dev';

  if (!aciApiKey) {
    console.error('❌ ACI_API_KEY not found in environment variables');
    process.exit(1);
  }

  console.log('🔗 Testing ACI.dev connection...');
  console.log(`📍 API URL: ${aciApiUrl}`);
  console.log(`🔑 API Key: ${aciApiKey.substring(0, 10)}...`);

  const aci = new ACIService({
    apiKey: aciApiKey,
    baseUrl: aciApiUrl,
  });

  try {
    // Test 1: Search for apps
    console.log('\n1️⃣ Testing app search...');
    const apps = await aci.searchApps({
      intent: 'search the web',
      limit: 5,
      includeFunctions: false,
    });

    console.log(`✅ Found ${apps.length} apps:`);
    apps.forEach((app, i) => {
      console.log(`   ${i + 1}. ${app.display_name} (${app.name}) - ${app.categories.join(', ')}`);
    });

    // Test 2: Get app details
    if (apps.length > 0) {
      console.log(`\n2️⃣ Testing app details for ${apps[0].name}...`);
      const appDetails = await aci.getAppDetails(apps[0].name);
      console.log(`✅ App: ${appDetails.display_name}`);
      console.log(`📝 Description: ${appDetails.description}`);
      console.log(`🔧 Functions: ${appDetails.functions.length}`);
      appDetails.functions.slice(0, 3).forEach((func, i) => {
        console.log(`   ${i + 1}. ${func.name} - ${func.description}`);
      });
    }

    // Test 3: Search for functions
    console.log('\n3️⃣ Testing function search...');
    const functions = await aci.searchFunctions({
      intent: 'search information',
      limit: 5,
      format: 'basic',
    });

    console.log(`✅ Found ${functions.length} functions`);
    functions.slice(0, 3).forEach((func, i) => {
      console.log(`   ${i + 1}. ${func.name || func.function_name} - ${func.description}`);
    });

    console.log('\n🎉 ACI.dev connection test completed successfully!');

  } catch (error) {
    console.error('❌ ACI.dev connection test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', await error.response.text());
    }
    process.exit(1);
  }
}

// Run the test
testACIConnection().catch(console.error);
