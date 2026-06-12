// emailService.js - Email notification system
const nodemailer = require('nodemailer');

// Email transporter configuration
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Send low stock alert
async function sendLowStockAlert(productName, currentQty, minLevel) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.ALERT_EMAIL,
        subject: `⚠️ LOW STOCK ALERT: ${productName}`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <h2 style="color: #F40009;">⚠️ Low Stock Alert</h2>
                <p><strong>Product:</strong> ${productName}</p>
                <p><strong>Current Quantity:</strong> ${currentQty} units</p>
                <p><strong>Minimum Level:</strong> ${minLevel} units</p>
                <p style="color: #F40009;">Please restock this product immediately.</p>
                <hr>
                <p><small>Coca-Cola Warehouse Management System</small></p>
            </div>
        `
    };
    
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Low stock alert sent for ${productName}`);
    } catch (error) {
        console.error('Email error:', error);
    }
}

// Send daily sales report to manager
async function sendDailySalesReport(date, teamsData, totalSales) {
    let teamsHtml = '';
    for (let team of teamsData) {
        teamsHtml += `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${team.team_name}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">₦${team.cash_sales?.toLocaleString() || 0}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">₦${team.transfer_sales?.toLocaleString() || 0}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #dc3545;">-₦${team.credit_sales?.toLocaleString() || 0}</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">₦${team.total_sales?.toLocaleString() || 0}</td>
            </tr>
        `;
    }
    
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.ALERT_EMAIL,
        subject: `📊 Daily Sales Report - ${date}`,
        html: `
            <div style="font-family: Arial, sans-serif;">
                <h2 style="color: #F40009;">Coca-Cola Warehouse - Daily Sales Report</h2>
                <p><strong>Date:</strong> ${date}</p>
                <p><strong>Total Sales:</strong> <span style="color: #F40009; font-size: 20px;">₦${totalSales.toLocaleString()}</span></p>
                
                <h3>Sales by Team:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr><th style="padding: 8px; background: #F40009; color: white;">Team</th>
                            <th style="padding: 8px; background: #F40009; color: white;">Cash</th>
                            <th style="padding: 8px; background: #F40009; color: white;">Transfer</th>
                            <th style="padding: 8px; background: #F40009; color: white;">Credit</th>
                            <th style="padding: 8px; background: #F40009; color: white;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${teamsHtml}
                    </tbody>
                </table>
                <hr>
                <p><small>Automated message from Coca-Cola Warehouse System</small></p>
            </div>
        `
    };
    
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Daily sales report sent for ${date}`);
    } catch (error) {
        console.error('Email error:', error);
    }
}

// Send credit request notification
async function sendCreditRequestNotification(orderNumber, customerName, amount, requestedBy) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.ALERT_EMAIL,
        subject: `📝 New Credit Request - ${orderNumber}`,
        html: `
            <div style="font-family: Arial, sans-serif;">
                <h2 style="color: #F40009;">New Credit Request Pending Approval</h2>
                <p><strong>Order Number:</strong> ${orderNumber}</p>
                <p><strong>Customer:</strong> ${customerName}</p>
                <p><strong>Amount:</strong> <span style="color: #dc3545;">₦${amount.toLocaleString()}</span></p>
                <p><strong>Requested By:</strong> ${requestedBy}</p>
                <p>Please log in to the manager dashboard to approve or reject this request.</p>
                <hr>
                <p><small>Coca-Cola Warehouse Management System</small></p>
            </div>
        `
    };
    
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Credit request notification sent for ${orderNumber}`);
    } catch (error) {
        console.error('Email error:', error);
    }
}

// Send return submission notification
async function sendReturnNotification(teamName, totalUnits, totalValue) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.ALERT_EMAIL,
        subject: `🔄 Return Submission - ${teamName}`,
        html: `
            <div style="font-family: Arial, sans-serif;">
                <h2 style="color: #F40009;">Return Goods Pending Approval</h2>
                <p><strong>Team:</strong> ${teamName}</p>
                <p><strong>Total Units:</strong> ${totalUnits}</p>
                <p><strong>Total Value:</strong> ₦${totalValue.toLocaleString()}</p>
                <p>Please log in to the manager dashboard to accept or return these goods.</p>
                <hr>
                <p><small>Coca-Cola Warehouse Management System</small></p>
            </div>
        `
    };
    
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Return notification sent for ${teamName}`);
    } catch (error) {
        console.error('Email error:', error);
    }
}

// Send backup status notification
async function sendBackupNotification(status, message, backupSize = null) {
    const isSuccess = status === 'success';
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.ALERT_EMAIL,
        subject: `${isSuccess ? '✅' : '❌'} Database Backup ${isSuccess ? 'Successful' : 'Failed'}`,
        html: `
            <div style="font-family: Arial, sans-serif;">
                <h2 style="color: ${isSuccess ? '#28a745' : '#F40009'};">Database Backup ${isSuccess ? 'Completed' : 'Failed'}</h2>
                <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                ${backupSize ? `<p><strong>Backup Size:</strong> ${(backupSize / 1024 / 1024).toFixed(2)} MB</p>` : ''}
                <p><strong>Message:</strong> ${message}</p>
                ${!isSuccess ? '<p>Please check the server logs and verify database connectivity.</p>' : ''}
                <hr>
                <p><small>Coca-Cola Warehouse Management System - Automated Backup</small></p>
            </div>
        `
    };
    
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Backup notification sent: ${status}`);
    } catch (error) {
        console.error('Email error:', error);
    }
}

module.exports = {
    sendLowStockAlert,
    sendDailySalesReport,
    sendCreditRequestNotification,
    sendReturnNotification,
    sendBackupNotification
};
