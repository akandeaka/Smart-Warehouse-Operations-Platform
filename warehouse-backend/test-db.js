// test-db.js - Test Aiven MySQL connection
require('dotenv').config();
const mysql = require('mysql2');

console.log('Testing Aiven MySQL connection...');
console.log('Host:', process.env.DB_HOST);
console.log('Port:', process.env.DB_PORT);
console.log('User:', process.env.DB_USER);
console.log('Database:', process.env.DB_NAME);

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
});

connection.connect((err) => {
    if (err) {
        console.error('❌ Connection FAILED:', err.message);
        process.exit(1);
    }
    
    console.log('✅ Connection SUCCESSFUL!');
    
    // Test query
    connection.query('SELECT COUNT(*) as count FROM products', (err, results) => {
        if (err) {
            console.error('❌ Query failed:', err.message);
        } else {
            console.log('✅ Query successful!');
            console.log('📊 Products in database:', results[0].count);
        }
        connection.end();
    });
});
