require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
            user: "your-email@gmail.com",  // Your full email
            pass: "your-16-char-app-password-no-spaces"  // No spaces!
        }
    });

    try {
        await transporter.verify();
        console.log('✅ Email config is correct!');
        
        const result = await transporter.sendMail({
            from: "your-email@gmail.com",
            to: "your-email@gmail.com",
            subject: "Test Email - Warehouse System",
            html: "<h2>✅ Email working!</h2>"
        });
        
        console.log('✅ Test email sent!');
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testEmail();
