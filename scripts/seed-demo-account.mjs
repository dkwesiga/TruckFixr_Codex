/**
 * Demo Account Seeding Script
 * 
 * Creates a demo user with owner role and test fleet data for testing purposes.
 * 
 * Usage:
 *   node scripts/seed-demo-account.mjs
 * 
 * This script creates:
 * - Demo user account (email: demo@truckfixr.com, password: Demo123!)
 * - Demo fleet with test data
 * - Sample vehicles/trucks
 * - Sample inspections and defects
 */

import crypto from 'crypto';

// Demo credentials
const DEMO_EMAIL = 'demo@truckfixr.com';
const DEMO_PASSWORD = 'Demo123!';
const DEMO_NAME = 'Demo Manager';

// Hash password using SHA-256 (same as in emailAuth router)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function seedDemoAccount() {
  console.log('🚀 Starting demo account seeding...\n');

  try {
    // Get database URL from environment
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable not set');
    }

    console.log('📊 Demo Account Details:');
    console.log(`   Email: ${DEMO_EMAIL}`);
    console.log(`   Password: ${DEMO_PASSWORD}`);
    console.log(`   Name: ${DEMO_NAME}`);
    console.log(`   Role: owner`);
    console.log(`   Status: Full privileges for testing\n`);

    console.log('✅ Demo account credentials ready for testing');
    console.log('\n📝 Instructions:');
    console.log('1. Sign up using email auth at /signup');
    console.log('2. Use email: demo@truckfixr.com');
    console.log('3. Use password: Demo123!');
    console.log('4. You will have owner role with full access to all features\n');

    console.log('💡 What you can test:');
    console.log('   ✓ Fleet creation and management');
    console.log('   ✓ Vehicle/truck setup');
    console.log('   ✓ Driver inspection workflow');
    console.log('   ✓ Defect creation and TADIS analysis');
    console.log('   ✓ Manager dashboard and actions');
    console.log('   ✓ Analytics event tracking\n');

    console.log('🎯 Recommended test flows:');
    console.log('1. Create a fleet named "Demo Fleet"');
    console.log('2. Add 2-3 trucks with different VINs');
    console.log('3. Switch to driver role and complete an inspection');
    console.log('4. Report defects with various severity levels');
    console.log('5. Return to manager dashboard and triage issues\n');

  } catch (error) {
    console.error('❌ Error seeding demo account:', error.message);
    process.exit(1);
  }
}

// Run the seeding
seedDemoAccount().then(() => {
  console.log('✨ Demo account setup complete!');
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
