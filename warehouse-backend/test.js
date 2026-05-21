// test.js - Run with: npm test
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let authToken = null;

async function runTests() {
    console.log('\n🧪 Starting Warehouse API Tests\n');
    console.log('================================\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Health Check
    try {
        const res = await axios.get('http://localhost:3000/health');
        if (res.data.status === 'healthy') {
            console.log('✅ Test 1: Health check passed');
            passed++;
        } else {
            console.log('❌ Test 1: Health check failed');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 1: Health check error -', error.message);
        failed++;
    }

    // Test 2: Login as Warehouse Manager
    try {
        const res = await axios.post(`${BASE_URL}/auth/login`, {
            username: 'warehouse_mgr',
            password: 'password123'
        });
        if (res.data.success && res.data.token) {
            authToken = res.data.token;
            console.log('✅ Test 2: Manager login successful');
            passed++;
        } else {
            console.log('❌ Test 2: Manager login failed');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 2: Manager login error -', error.message);
        failed++;
    }

    // Test 3: Get Products (with auth)
    try {
        const res = await axios.get(`${BASE_URL}/products`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.data.success && res.data.data.length > 0) {
            console.log('✅ Test 3: Products fetched successfully');
            passed++;
        } else {
            console.log('❌ Test 3: Products fetch failed');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 3: Products error -', error.message);
        failed++;
    }

    // Test 4: Get Team Allocations
    try {
        const res = await axios.get(`${BASE_URL}/sales/team/1/allocations`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.data.success) {
            console.log('✅ Test 4: Team allocations fetched');
            passed++;
        } else {
            console.log('❌ Test 4: Team allocations failed');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 4: Team allocations error -', error.message);
        failed++;
    }

    // Test 5: Create Cash Sale
    try {
        const res = await axios.post(`${BASE_URL}/sales`, {
            team_id: 1,
            customer_name: 'Test Customer',
            customer_phone: '08012345678',
            items: [{ product_id: 1, quantity: 2, unit_price: 4200 }],
            payment_method: 'cash',
            sales_date: new Date().toISOString().split('T')[0]
        }, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.data.success) {
            console.log('✅ Test 5: Cash sale created');
            passed++;
        } else {
            console.log('❌ Test 5: Cash sale failed');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 5: Cash sale error -', error.message);
        failed++;
    }

    // Test 6: Create Credit Sale
    try {
        const res = await axios.post(`${BASE_URL}/sales`, {
            team_id: 1,
            customer_name: 'Credit Customer',
            items: [{ product_id: 1, quantity: 5, unit_price: 4200 }],
            payment_method: 'credit',
            sales_date: new Date().toISOString().split('T')[0],
            credit_due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
        }, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.data.success && res.data.approval_status === 'pending') {
            console.log('✅ Test 6: Credit sale created (pending)');
            passed++;
        } else {
            console.log('❌ Test 6: Credit sale failed');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 6: Credit sale error -', error.message);
        failed++;
    }

    // Test 7: Get Pending Approvals
    try {
        const res = await axios.get(`${BASE_URL}/approvals/pending`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.data.success) {
            console.log('✅ Test 7: Pending approvals fetched');
            passed++;
        } else {
            console.log('❌ Test 7: Pending approvals failed');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 7: Pending approvals error -', error.message);
        failed++;
    }

    // Test 8: Daily Report
    try {
        const res = await axios.get(`${BASE_URL}/reports/daily`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        if (res.data.success) {
            console.log('✅ Test 8: Daily report generated');
            passed++;
        } else {
            console.log('❌ Test 8: Daily report failed');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 8: Daily report error -', error.message);
        failed++;
    }

    // Summary
    console.log('\n================================');
    console.log('📊 TEST SUMMARY');
    console.log('================================');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
    console.log('================================\n');

    if (failed === 0) {
        console.log('🎉 All tests passed! Your backend is ready for deployment.\n');
    } else {
        console.log('⚠️ Some tests failed. Please check your database connection and credentials.\n');
    }
}

runTests();
