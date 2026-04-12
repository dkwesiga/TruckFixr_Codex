import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const connection = await mysql.createConnection({
  host: process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'localhost',
  user: process.env.DATABASE_URL?.split('://')[1]?.split(':')[0] || 'root',
  password: process.env.DATABASE_URL?.split(':')[2]?.split('@')[0] || '',
  database: process.env.DATABASE_URL?.split('/')[3] || 'truckfixr',
  ssl: 'Amazon RDS',
});

try {
  const [rows] = await connection.execute('SELECT id, email, name, role, loginMethod FROM users LIMIT 10');
  console.log('Users in database:');
  console.table(rows);
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await connection.end();
}
