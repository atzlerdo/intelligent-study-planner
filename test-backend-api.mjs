// Quick test script to check backend API response
// Run with: node test-backend-api.mjs

const AUTH_TOKEN = 'YOUR_TOKEN_HERE'; // Replace with actual token from localStorage

async function testBackendAPI() {
  try {
    console.log('🔍 Testing backend GET /api/sessions endpoint...\n');
    
    const response = await fetch('http://localhost:3001/api/sessions', {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('❌ Request failed:', response.status, response.statusText);
      return;
    }
    
    const sessions = await response.json();
    console.log(`✅ Received ${sessions.length} sessions\n`);
    
    // Check first 3 sessions
    console.log('📊 Checking first 3 sessions for googleEventId field:\n');
    sessions.slice(0, 3).forEach((session, idx) => {
      console.log(`Session ${idx + 1}:`);
      console.log(`  ID: ${session.id?.substring(0, 30)}...`);
      console.log(`  Has google_event_id (snake_case): ${session.google_event_id ? '✅ YES' : '❌ NO'}`);
      console.log(`  Has googleEventId (camelCase): ${session.googleEventId ? '✅ YES' : '❌ NO'}`);
      if (session.google_event_id) {
        console.log(`  Value (snake_case): ${session.google_event_id.substring(0, 20)}...`);
      }
      if (session.googleEventId) {
        console.log(`  Value (camelCase): ${session.googleEventId.substring(0, 20)}...`);
      }
      console.log('');
    });
    
    // Count totals
    const withSnakeCase = sessions.filter(s => s.google_event_id).length;
    const withCamelCase = sessions.filter(s => s.googleEventId).length;
    
    console.log('📈 Summary:');
    console.log(`  Total sessions: ${sessions.length}`);
    console.log(`  With google_event_id (snake_case): ${withSnakeCase}`);
    console.log(`  With googleEventId (camelCase): ${withCamelCase}`);
    
    if (withCamelCase === 0 && withSnakeCase > 0) {
      console.log('\n⚠️ PROBLEM: Backend is returning snake_case but NOT camelCase!');
      console.log('   Backend changes did not apply - server needs restart.');
    } else if (withCamelCase > 0) {
      console.log('\n✅ Backend is correctly returning camelCase googleEventId!');
    } else {
      console.log('\n⚠️ No googleEventId in any format - check database.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testBackendAPI();
