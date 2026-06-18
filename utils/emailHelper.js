const nodemailer = require('nodemailer');

// Create reusable transporter object using SMTP transport
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD // This should be an app-specific password
    }
});

const formatOrderMessage = (order, products, customer) => {
    let message = `<h2>🆕 New Order Received</h2>`;
    message += `<p><strong>SO Number:</strong> ${order.sonumber}</p>`;
    message += `<p><strong>Customer:</strong> ${customer.perusahaan}</p>`;
    message += `<p><strong>Contact Person:</strong> ${customer.cp}</p>`;
    
    message += `<h3>Products:</h3>`;
    products.forEach(product => {
        message += `<div style="margin-bottom: 15px;">`;
        message += `<p><strong>${product.name}:</strong> ${product.quantity} ${product.satuan}</p>`;
        if (product.packagingDetails && product.packagingDetails.length > 0) {
            message += `<p style="margin-left: 20px;"><em>Packaging:</em></p><ul style="margin-top: 5px;">`;
            product.packagingDetails.forEach(pkg => {
                message += `<li>${pkg.packagingName} (${pkg.volume}L) × ${pkg.unit} pcs</li>`;
            });
            message += `</ul>`;
        }
        message += `</div>`;
    });

    // Add consumables section if any are used
    const consumables = [];
    if (order.pallet) consumables.push('Pallet');
    if (order.sticker) consumables.push('Sticker');
    if (order.wrap) consumables.push('Wrap');
    if (order.handling) consumables.push('Handling');
    if (order.logistic) consumables.push('Logistic');
    if (order.triplek) consumables.push('Triplek');
    if (order.peti) consumables.push('Peti');
    if (order.kabelties) consumables.push('Kabel Ties');

    if (consumables.length > 0) {
        message += `<h3>Additional Services:</h3><ul>`;
        consumables.forEach(consumable => {
            message += `<li>${consumable}</li>`;
        });
        message += `</ul>`;
    }

    message += `<p><strong>Payment Type:</strong> ${order.paymentType}</p>`;
    if (order.deadline) {
        message += `<p><strong>Deadline:</strong> ${new Date(order.deadline).toLocaleDateString('id-ID')}</p>`;
    }
    if (order.notes) {
        message += `<h3>Notes:</h3><p>${order.notes}</p>`;
    }

    return message;
};

const sendOrderEmail = async (to, order, products, customer) => {
    try {
        const htmlMessage = formatOrderMessage(order, products, customer);
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: to,
            subject: `New Order: ${order.sonumber}`,
            html: htmlMessage
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', {
            messageId: info.messageId,
            orderId: order.id,
            soNumber: order.sonumber
        });
        return info;
    } catch (error) {
        console.error('Error sending email:', {
            error: error.message,
            orderId: order.id,
            soNumber: order.sonumber
        });
        throw error;
    }
};

module.exports = {
    sendOrderEmail
};
