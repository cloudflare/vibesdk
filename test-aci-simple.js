// Test ACI.dev connection
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
        if (line.startsWith('ACI_API_KEY=')) {
          aciApiKey = line.split('=')[1].replace(/"/g, '');
        }
        if (line.startsWith('ACI_API_URL=')) {
          aciApiUrl = line.split('=')[1].replace(/"/g, '');
        }
      }
    } catch (error) {
      console.error('❌ Could not load .dev.vars file:', error.message);
      process.exit(1);
    }
  }

  if (!aciApiKey) {
    console.error('❌ ACI_API_KEY not found in environment variables or .dev.vars file');
    process.exit(1);
  }

  if (!aciApiUrl) {
    aciApiUrl = 'https://api.aci.dev';
  }

  console.log('🔗 Testing ACI.dev connection...');
  console.log(`📍 API URL: ${aciApiUrl}`);
  console.log(`🔑 API Key: ${aciApiKey.substring(0, 10)}...`);

  try {
    // Test basic API connectivity
    console.log('\n1️⃣ Testing basic connectivity...');

    const response = await fetch(`${aciApiUrl}apps/search?intent=search&limit=1`, {
      headers: {
        'Authorization': `Bearer ${aciApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ API connection successful!');
      console.log(`📊 Response: Found ${Array.isArray(data) ? data.length : 'unknown'} results`);
    } else {
      console.error(`❌ API connection failed: ${response.status} ${response.statusText}`);

      // Try to get error details
      try {
        const errorData = await response.json();
        console.error('Error details:', errorData);
      } catch {
        console.error('Could not parse error response');
      }
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testACIConnection().catch(console.error);
