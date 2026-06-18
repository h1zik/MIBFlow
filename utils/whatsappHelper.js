require('dotenv').config();
const axios = require('axios');

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

const sendWhatsAppMessage = async (to, message) => {
    let formattedNumber;
    try {
        // Validate token format and length
        if (!WHATSAPP_TOKEN || WHATSAPP_TOKEN.length < 50) {
            throw new Error('Invalid or expired WhatsApp token. Token should be a long string.');
        }

        if (!WHATSAPP_PHONE_ID) {
            throw new Error('Missing WhatsApp Phone ID in environment variables');
        }

        // Ensure proper number format: remove any non-digits and ensure starts with country code
        formattedNumber = to.replace(/\D/g, '');
        if (!formattedNumber.match(/^[0-9]{10,}$/)) {
            throw new Error(`Invalid phone number format: ${to}`);
        }
        
        console.log('Validating WhatsApp configuration:', {
            originalNumber: to,
            formattedNumber,
            phoneId: WHATSAPP_PHONE_ID,
            messageLength: message.length,
            tokenLength: WHATSAPP_TOKEN.length,
            tokenPrefix: WHATSAPP_TOKEN.substring(0, 10) + '...'
        });

        // Send test message
        try {
            const testMessage = "Hello World\nWelcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.";
            
            const response = await axios.post(
                `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
                {
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to: formattedNumber,
                    type: "text",
                    text: { 
                        preview_url: false,
                        body: testMessage 
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            console.log('WhatsApp API Response:', JSON.stringify(response.data, null, 2));
            
            if (response.data.messages && response.data.messages[0]) {
                console.log('Message ID:', response.data.messages[0].id);
                // Try to check message status
                try {
                    const statusResponse = await axios.get(
                        `https://graph.facebook.com/v18.0/${response.data.messages[0].id}`,
                        {
                            headers: {
                                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );
                    console.log('Message Status:', JSON.stringify(statusResponse.data, null, 2));
                } catch (statusError) {
                    console.error('Error checking message status:', {
                        error: statusError.message,
                        response: statusError.response?.data
                    });
                }
            }
            
            return response.data;
        } catch (sendError) {
            throw new Error(`Failed to send message: ${sendError.response?.data?.error?.message || sendError.message}`);
        }
    } catch (error) {
        console.error('Error sending WhatsApp message:', {
            error: error.message,
            response: error.response?.data,
            status: error.response?.status,
            originalNumber: to,
            formattedNumber,
            token: WHATSAPP_TOKEN ? `${WHATSAPP_TOKEN.substring(0, 10)}...` : 'Missing',
            phoneId: WHATSAPP_PHONE_ID || 'Missing'
        });
        throw error;
    }
};

const formatOrderMessage = (order, products, customer) => {
    let message = `🆕 *New Order Received*\n\n`;
    message += `*SO Number:* ${order.sonumber}\n`;
    message += `*Customer:* ${customer.perusahaan}\n`;
    message += `*Contact Person:* ${customer.cp}\n`;
    message += `*Total Amount:* Rp${order.total.toLocaleString('id-ID')}\n\n`;
    
    message += `*Products:*\n`;
    products.forEach(product => {
        message += `- ${product.name}: ${product.quantity} ${product.satuan}\n`;
    });

    message += `\n*Payment Type:* ${order.paymentType}`;
    if (order.deadline) {
        message += `\n*Deadline:* ${new Date(order.deadline).toLocaleDateString('id-ID')}`;
    }
    if (order.notes) {
        message += `\n\n*Notes:*\n${order.notes}`;
    }

    return message;
};

module.exports = {
    sendWhatsAppMessage,
    formatOrderMessage
};
