const ComplainItem = require('../models/complainItem');
const ComplainItemRawMaterial = require('../models/complainItemRawMaterial');
const Complain = require('../models/complain');
const RawMaterial = require('../models/rawMaterial');
const User = require('../models/user'); 

exports.requestFormula = async (req, res) => {
    try {
        const { complainItemId } = req.params;
        
        // Find the complain item
        const complainItem = await ComplainItem.findByPk(complainItemId, {
            include: [{
                model: Complain,
                include: ['Order']
            }]
        });

        if (!complainItem) {
            return res.status(404).json({ error: 'Complain item not found' });
        }

        // Update status to indicate formula has been requested
        await complainItem.update({ status: 'Formula Requested' });

        // Send notification
        req.app.locals.sendNotification({
            type: 'rdFormula',
            sonumber: complainItem.Complain.Order.sonumber,
            customerName: complainItem.Complain.Order.customerName,
            product: complainItem.product,
            audio: 'rd.mp3'
        });

        // Redirect to insert raw materials page
        res.redirect(`/dashboard/ppic`);
    } catch (error) {
        console.error('Error requesting formula:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getInsertRawMaterials = async (req, res) => {
    try {
        const { complainItemId } = req.params;
        
        // Find the complain item with its associations
        const complainItem = await ComplainItem.findByPk(complainItemId, {
            include: [{
                model: Complain,
                include: ['Order']
            }]
        });

        if (!complainItem) {
            return res.status(404).json({ error: 'Complain item not found' });
        }

        // Fetch raw materials
        const rawMaterials = await RawMaterial.findAll({
            order: [['name', 'ASC']]
        });

        res.render('rd/insertRawMaterials', {
            complainItem,
            rawMaterials,
            userRole: req.user.role,
            path: '/rd/insert-raw-materials'
        });
    } catch (error) {
        console.error('Error getting insert raw materials page:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.submitRawMaterials = async (req, res) => {
    try {
        const { complainItemId, materials } = req.body;

        // Find the complain item with its associations
        const complainItem = await ComplainItem.findByPk(complainItemId, {
            include: [{
                model: Complain,
                include: ['Order']
            }]
        });

        if (!complainItem) {
            return res.status(404).json({ error: 'Complain item not found' });
        }

        // Create raw materials entries
        const rawMaterials = Array.isArray(materials) ? materials : Object.values(materials);
        
        for (const material of rawMaterials) {
            await ComplainItemRawMaterial.create({
                complainItemId,
                rawMaterialName: material.rawMaterialName,
                quantity: material.quantity,
                unit: material.unit,
                notes: material.notes
            });
        }

        // Update complain item status
        await complainItem.update({ status: 'Raw Materials Added' });

        // Send notification
        req.app.locals.sendNotification({
            type: 'ppicRawMaterials',
            sonumber: complainItem.Complain.Order.sonumber,
            customerName: complainItem.Complain.Order.customerName,
            product: complainItem.product,
            audio: 'notification.mp3'
        });

        // Redirect to R&D dashboard
        res.redirect('/dashboard/rd');
    } catch (error) {
        console.error('Error submitting raw materials:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getRDDashboard = async (req, res) => {
    try {
        // Existing code...

        // Fetch users for chat feature
        const users = await User.findAll({
            attributes: ['id', 'username', 'role']
        });

        res.render('dashboards/rd', {
            userRole: req.user.role,
            userId: req.user.id,
            users, 
            path: '/dashboard/rd'
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
};
