/**
 * Demo Account Seeding Script
 * 
 * Creates a demo user with owner role and test fleet data for testing purposes.
 * 
 * Usage:
 *   node scripts/seed-demo.mjs
 * 
 * This script creates:
 * - Demo user account (email: demo@truckfixr.com, password: Demo123!)
 * - Demo fleet with test data
 * - Sample vehicles/trucks
 */

import crypto from 'crypto';
import mysql from 'mysql2/promise';

// Demo credentials
const DEMO_EMAIL = 'demo@truckfixr.com';
const DEMO_PASSWORD = 'Demo123!';
const DEMO_NAME = 'Demo Manager';

// Hash password using SHA-256 (same as in emailAuth router)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Generate unique ID
function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

async function seedDemoAccount() {
  console.log('🚀 Starting demo account seeding...\n');

  let connection;
  try {
    // Get database URL from environment
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable not set');
    }

    // Parse MySQL connection string
    // Format: mysql://user:password@host:port/database
    const url = new URL(dbUrl);
    const config = {
      host: url.hostname,
      port: url.port || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      waitForConnections: true,
      connectionLimit: 1,
      queueLimit: 0,
      ssl: {
        rejectUnauthorized: false,
      },
    };

    console.log('📊 Connecting to database...');
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database\n');

      // Check if demo user already exists
      const [existingUser] = await connection.execute(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        [DEMO_EMAIL]
      );

    if (existingUser.length > 0) {
      console.log('⚠️  Demo user already exists. Skipping creation.\n');
      console.log('📊 Demo Account Details:');
      console.log(`   Email: ${DEMO_EMAIL}`);
      console.log(`   Password: ${DEMO_PASSWORD}`);
      console.log(`   Role: owner`);
      console.log(`   Status: Ready for testing\n`);
    } else {
      // Hash the password
      const passwordHash = hashPassword(DEMO_PASSWORD);

      // Create demo user
      console.log('👤 Creating demo user...');
      const demoOpenId = 'demo-' + crypto.randomBytes(16).toString('hex');
      const [result] = await connection.execute(
        `INSERT INTO users (email, name, role, passwordHash, loginMethod, openId, lastSignedIn, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [DEMO_EMAIL, DEMO_NAME, 'owner', passwordHash, 'email', demoOpenId, new Date()]
      );

      const userId = result.insertId;
      console.log(`✅ Demo user created (ID: ${userId})\n`);

      // Create demo fleet
      console.log('🚛 Creating demo fleet...');
      const [fleetResult] = await connection.execute(
        `INSERT INTO fleets (name, ownerId, planId, premiumTadis, trialEndsAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 14 DAY), NOW(), NOW())`,
        ['Demo Fleet', userId, 1, false]
      );

      const fleetId = fleetResult.insertId;
      console.log(`✅ Demo fleet created (ID: ${fleetId})\n`);

      // Create demo vehicles
      console.log('🚙 Creating demo vehicles...');
      const vehicles = [
        {
          vin: '1HGBH41JXMN109186',
          licensePlate: 'DEMO-001',
          make: 'Volvo',
          model: 'VNL',
          year: 2022,
        },
        {
          vin: '2HGBH41JXMN109187',
          licensePlate: 'DEMO-002',
          make: 'Freightliner',
          model: 'Cascadia',
          year: 2021,
        },
        {
          vin: '3HGBH41JXMN109188',
          licensePlate: 'DEMO-003',
          make: 'Peterbilt',
          model: '579',
          year: 2020,
        },
      ];

      for (const vehicle of vehicles) {
        await connection.execute(
          `INSERT INTO vehicles (fleetId, vin, licensePlate, make, model, year, mileage, engineHours, status, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [fleetId, vehicle.vin, vehicle.licensePlate, vehicle.make, vehicle.model, vehicle.year, 0, 0, 'active']
        );
      }

      console.log(`✅ Created ${vehicles.length} demo vehicles\n`);

      console.log('📊 Demo Account Details:');
      console.log(`   Email: ${DEMO_EMAIL}`);
      console.log(`   Password: ${DEMO_PASSWORD}`);
      console.log(`   Name: ${DEMO_NAME}`);
      console.log(`   Role: owner`);
      console.log(`   Fleet: Demo Fleet (ID: ${fleetId})`);
      console.log(`   Vehicles: ${vehicles.length} trucks\n`);
    }

    console.log('✅ Demo account setup complete!\n');
    console.log('📝 Next steps:');
    console.log('1. Go to /signup');
    console.log(`2. Enter email: ${DEMO_EMAIL}`);
    console.log(`3. Enter password: ${DEMO_PASSWORD}`);
    console.log('4. Click "Sign In" to access the demo account\n');

  } catch (error) {
    console.error('❌ Error seeding demo account:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the seeding
seedDemoAccount().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
