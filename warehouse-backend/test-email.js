require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
    console.log('📧 Testing email...');
    
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    try {
        await transporter.verify();
        console.log('✅ Email config is correct!');
        
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.ALERT_EMAIL,
            subject: 'Test Email - Warehouse System',
            html: '<h2 style="color:#F40009;">✅ Email working!</h2>'
        });
        
        console.log('✅ Test email sent! Check your inbox.');
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testEmail();
