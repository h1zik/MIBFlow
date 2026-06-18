const TdsMsdsRequest = require('../models/tdsmsdsRequest');
const Product = require('../models/product');
const path = require('path');


// Create a new request
exports.createRequest = async (req, res) => {
    const { productId, requestType } = req.body;

    try {
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        const newRequest = await TdsMsdsRequest.create({ productId, requestType });
        
        // Send notification to R&D dashboard
        req.app.locals.sendNotification({
            type: 'newTdsMsdsRequest',
            productName: product.name,
            requestType: requestType,
            audio: '/audio/rd.mp3'
        });

        res.redirect('/dashboard/marketing');
    } catch (error) {
        console.error('Error creating TDS/MSDS request:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Approve a request
exports.approveRequest = async (req, res) => {
    const { id } = req.params;

    try {
        const request = await TdsMsdsRequest.findByPk(id, { include: Product });
        if (!request) {
            return res.status(404).send('Request not found');
        }

        request.status = 'Approved';
        await request.save();

        res.redirect('/dashboard/rd');
    } catch (error) {
        console.error('Error approving request:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.uploadFile = async (req, res) => {
    const { id } = req.params;

    try {
        const request = await TdsMsdsRequest.findByPk(id, { include: Product });
        if (!request) {
            return res.status(404).send('Request not found');
        }

        // Check uploaded files
        const uploadedFile = req.files[request.requestType.toLowerCase()];
        if (!uploadedFile || uploadedFile.length === 0) {
            return res.status(400).send('No file uploaded');
        }

        const filePath = path.join('uploads', request.requestType.toUpperCase(), uploadedFile[0].filename);

        // Update the respective column in the Product model
        await request.Product.update({
            [request.requestType.toLowerCase()]: filePath, // 'tds' or 'msds'
        });

        // Update the request status
        request.status = 'Approved';
        await request.save();

        // Send notification to marketing dashboard
        req.app.locals.sendNotification({
            type: 'tdsMsdsRequestApproved',
            productName: request.Product ? request.Product.name : 'Unknown Product',
            requestType: request.requestType,
            audio: '/audio/marketing.mp3'
        });

        res.redirect('/dashboard/rd');
    } catch (error) {
        console.error('Error uploading file for TDS/MSDS request:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Decline a request
exports.declineRequest = async (req, res) => {
    const { id } = req.params;

    try {
        const request = await TdsMsdsRequest.findByPk(id, { include: Product });
        if (!request) {
            return res.status(404).send('Request not found');
        }

        request.status = 'Declined';
        await request.save();

        // Send notification to marketing dashboard
        req.app.locals.sendNotification({
            type: 'tdsMsdsRequestDeclined',
            productName: request.Product ? request.Product.name : 'Unknown Product',
            requestType: request.requestType,
            audio: '/audio/marketing.mp3'
        });

        res.redirect('/dashboard/rd');
    } catch (error) {
        console.error('Error declining request:', error);
        res.status(500).send('Internal Server Error');
    }
};
