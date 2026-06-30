const RawMaterialRequest = require('../models/rawMaterialRequest');
const Vendor = require('../models/vendor');
const Order = require('../models/order');
const { Op } = require('sequelize');
const Customer = require('../models/customer');
const OrderItem = require('../models/orderItem');
const Product = require('../models/product');
const RawMaterialRequestVendor = require('../models/rawMaterialRequestVendor');
const RawMaterial = require('../models/rawMaterial');
const PackagingRequest = require('../models/packagingRequest');
const PackagingRequestVendor = require('../models/packagingRequestVendor');
const Packaging = require('../models/packaging');
const sequelize = require('sequelize');
const User = require('../models/user'); // Add User model import

const getFinanceData = async () => {
    try {
        // Get income from orders
        const income = await Order.findAll({
            where: {
                status: 'Paid'
            },
            attributes: [
                [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
                [sequelize.fn('SUM', sequelize.col('total')), 'total']
            ],
            group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
            order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
            raw: true
        });

        // Get spending from raw materials
        const rawMaterialSpending = await RawMaterialRequestVendor.findAll({
            where: {
                status: 'Paid'
            },
            include: [{
                model: RawMaterialRequest,
                include: [RawMaterial],
                attributes: []
            }],
            attributes: [
                [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
                [sequelize.literal('SUM(splitQuantity * RawMaterialRequest.RawMaterial.price)'), 'total']
            ],
            group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
            order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
            raw: true
        });

        // Get spending from packaging
        const packagingSpending = await PackagingRequestVendor.findAll({
            where: {
                status: 'Paid'
            },
            include: [{
                model: PackagingRequest,
                include: [Packaging],
                attributes: []
            }],
            attributes: [
                [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
                [sequelize.literal('SUM(splitQuantity * PackagingRequest.Packaging.price)'), 'total']
            ],
            group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
            order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
            raw: true
        });

        // Combine raw material and packaging spending
        const spendingByDate = {};
        [...rawMaterialSpending, ...packagingSpending].forEach(spend => {
            const date = spend.date;
            if (!spendingByDate[date]) {
                spendingByDate[date] = 0;
            }
            spendingByDate[date] += parseFloat(spend.total || 0);
        });

        const spending = Object.entries(spendingByDate).map(([date, total]) => ({
            date,
            total
        })).sort((a, b) => new Date(a.date) - new Date(b.date));

        return {
            income: income.map(i => ({
                date: i.date,
                total: parseFloat(i.total || 0)
            })),
            spending
        };
    } catch (error) {
        console.error('Error getting finance data:', error);
        return { income: [], spending: [] };
    }
};

exports.getFinanceRawMaterialRequests = async (req, res) => {
    try {
        const rawMaterialRequestsVendors = await RawMaterialRequestVendor.findAll({
            where: {
                status: ['Approved', 'Pending', 'Paid']
            },
            include: [
                { 
                    model: RawMaterialRequest,
                    include: [{ 
                        model: RawMaterial, 
                        attributes: ['price', 'density'],
                        include: [{
                            model: Vendor,
                            through: {
                                model: sequelize.models.rawmaterialvendor,
                                attributes: ['price']
                            }
                        }]
                    }]
                },
                { model: Vendor }
            ]
        });

        const packagingRequestVendors = await PackagingRequestVendor.findAll({
            where: {
                status: ['Approved', 'Pending', 'Paid']
            },
            include: [
                { 
                    model: PackagingRequest,
                    include: [{ 
                        model: Packaging,
                        include: [{
                            model: Vendor,
                            through: {
                                model: sequelize.models.packagingvendor,
                                attributes: ['price']
                            }
                        }]
                    }]
                },
                { model: Vendor }
            ]
        });

        const orders = await Order.findAll({
            where: {
                status: ['Approved', 'Paid', 'Ready to Deliver']
            },
            include: [
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    include: [{
                        model: Product,
                        attributes: ['name']
                    }]
                },
                {
                    model: Customer,
                    attributes: ['name']
                }
            ]
        });
        const userRole = req.user.role;
        // Get finance data for graphs
        const { income, spending } = await getFinanceData();

        // Fetch users for chat feature
        const users = await User.findAll({
            attributes: ['id', 'username', 'role']
        });

        res.render('dashboards/finance', {
            orders,
            rawMaterialRequestsVendors,
            packagingRequestVendors,
            // chart datasets (the view reads all* for the buying/selling charts)
            allOrders: orders,
            allRawMaterialRequestsVendors: rawMaterialRequestsVendors,
            allPackagingRequestVendors: packagingRequestVendors,
            userRole,
            userId: req.user.id,
            users, // Add users data
            path: '/dashboard/finance',
            financeData: {
                income,
                spending
            }
        });
    } catch (error) {
        console.error('Error fetching requests for finance:', error);
        res.status(400).send(error);
    }
};


exports.approveRawMaterialRequest = async (req, res) => {
    try {
        const requestId = req.params.id;
        const request = await RawMaterialRequestVendor.findByPk(requestId, {
            include: [{ model: RawMaterialRequest, include: [RawMaterial] }]
        });

        if (!request) {
            return res.status(404).json({ success: false, message: 'Raw material request not found' });
        }

        request.status = 'Approved';
        await request.save();

        // Generate new actions HTML based on payment type
        let newActions = '';
        if (request.paymentType === 'CBD' || request.paymentType === 'DP') {
            newActions = `
                <div class="action-buttons">
                    <button class="btn btn-success paid-request-btn" data-id="${request.id}">
                        <i class="bi bi-cash"></i>
                        Mark as Paid
                    </button>
                </div>
            `;
        } else {
            newActions = `
                <div class="action-buttons">
                    <button class="btn btn-primary deliver-request-btn" data-id="${request.id}" data-payment="${request.paymentType}">
                        <i class="bi bi-truck"></i>
                        Deliver
                    </button>
                </div>
            `;
        }

        res.json({ 
            success: true, 
            status: 'Approved',
            newActions
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.declineRawMaterialRequest = async (req, res) => {
    try {
        const requestId = req.params.id;
        const request = await RawMaterialRequestVendor.findByPk(requestId);

        if (!request) {
            return res.status(404).json({ success: false, message: 'Raw material request not found' });
        }

        request.status = 'Declined';
        await request.save();

        res.json({ 
            success: true, 
            status: 'Declined',
            newActions: '<div class="action-buttons"></div>' // No actions for declined requests
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.payRawMaterialRequest = async (req, res) => {
    const { id } = req.params;
    try {
        const requestVendor = await RawMaterialRequestVendor.findByPk(id, {
            include: RawMaterialRequest
        });

        if (!requestVendor) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        requestVendor.status = 'Paid';
        await requestVendor.save();

        const newActions = `
            <div class="action-buttons">
                <button class="btn btn-primary deliver-request-btn" data-id="${requestVendor.id}" data-payment="${requestVendor.paymentType}">
                    <i class="bi bi-truck"></i>
                    Deliver
                </button>
            </div>
        `;

        res.json({ 
            success: true, 
            status: 'Paid',
            newActions
        });
    } catch (error) {
        console.error('Error paying for raw material request vendor:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.markAsPaid = async (req, res) => {
    const { orderId } = req.params;

    try {
        const order = await Order.findByPk(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Mark the order as paid
        order.status = 'Paid';
        await order.save();

        const newActions = `
            <div class="action-buttons">
                <button class="btn btn-primary proceed-delivery-btn" data-id="${order.id}">
                    <i class="bi bi-truck"></i>
                    Proceed Delivery
                </button>
            </div>
        `;

        res.json({ 
            success: true,
            status: 'Paid',
            newActions
        });
    } catch (error) {
        console.error('Error marking as paid:', error);
        res.status(500).json({ success: false, message: 'Error marking as paid' });
    }
};

exports.proceedDelivery = async (req, res) => {
    const { orderId } = req.params;

    try {
        const order = await Order.findByPk(orderId, {
            include: [{
                model: OrderItem,
                as: 'OrderItems'
            }]
        });

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Update invoicedQuantity for each OrderItem
        for (const orderItem of order.OrderItems) {
            await OrderItem.update(
                { invoicedQuantity: orderItem.sentQuantity },
                { where: { id: orderItem.id } }
            );
        }

        // Change order status to "Ready to Deliver"
        order.status = 'Ready to Deliver';
        await order.save();

        // Send notification to product warehouse
        req.app.locals.sendNotification({
            type: 'newDeliveryOrder',
            sonumber: order.sonumber,
            customerName: order.customerName,
            status: 'Ready to Deliver',
            audio: 'product.mp3'
        });

        // No more actions needed after proceeding to delivery
        const newActions = '<div class="action-buttons"></div>';

        res.json({ 
            success: true,
            status: 'Ready to Deliver',
            newActions
        });

    } catch (error) {
        console.error('Error proceeding delivery:', error);
        res.status(500).json({ success: false, message: 'Error proceeding delivery' });
    }
};

// Packaging request functions
exports.approvePackaging = async (req, res) => {
    try {
        const requestId = req.params.id;
        const request = await PackagingRequestVendor.findByPk(requestId, {
            include: [{ model: PackagingRequest, include: [Packaging] }]
        });

        if (!request) {
            return res.status(404).json({ success: false, message: 'Packaging request vendor not found' });
        }

        request.status = 'Approved';
        await request.save();

        // Generate new actions HTML based on payment type
        let newActions = '';
        if (request.paymentType === 'CBD' || request.paymentType === 'DP') {
            newActions = `
                <div class="action-buttons">
                    <button class="btn btn-success paid-packaging-btn" data-id="${request.id}">
                        <i class="bi bi-cash"></i>
                        Mark as Paid
                    </button>
                </div>
            `;
        } else {
            newActions = `
                <div class="action-buttons">
                    <button class="btn btn-primary deliver-packaging-btn" data-id="${request.id}" data-payment="${request.paymentType}">
                        <i class="bi bi-truck"></i>
                        Deliver
                    </button>
                </div>
            `;
        }

        res.json({ 
            success: true, 
            status: 'Approved',
            newActions
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.declinePackaging = async (req, res) => {
    try {
        const requestId = req.params.id;
        const request = await PackagingRequestVendor.findByPk(requestId);

        if (!request) {
            return res.status(404).json({ success: false, message: 'Packaging request vendor not found' });
        }

        request.status = 'Declined';
        await request.save();

        res.json({ 
            success: true, 
            status: 'Declined',
            newActions: '<div class="action-buttons"></div>' // No actions for declined requests
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.payPackaging = async (req, res) => {
    const { id } = req.params;
    try {
        const request = await PackagingRequestVendor.findByPk(id, {
            include: PackagingRequest
        });

        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        request.status = 'Paid';
        await request.save();

        const newActions = `
            <div class="action-buttons">
                <button class="btn btn-primary deliver-packaging-btn" data-id="${request.id}" data-payment="${request.paymentType}">
                    <i class="bi bi-truck"></i>
                    Deliver
                </button>
            </div>
        `;

        res.json({ 
            success: true, 
            status: 'Paid',
            newActions
        });
    } catch (error) {
        console.error('Error paying for packaging request:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.deliverPackaging = async (req, res) => {
    try {
        const { id } = req.params;
        const request = await PackagingRequestVendor.findByPk(id, {
            include: PackagingRequest
        });

        if (!request) {
            return res.status(404).json({ success: false, message: 'Packaging request vendor not found' });
        }

        let paymentDueDate = null;

        if (request.paymentType && request.paymentType.startsWith('TOP')) {
            const days = parseInt(request.paymentType.replace('TOP', ''));
            paymentDueDate = new Date();
            paymentDueDate.setDate(paymentDueDate.getDate() + days);
        }

        request.status = 'On Delivery';
        request.paymentDueDate = paymentDueDate;
        await request.save();

        // Send SSE notification for finance
        req.app.locals.sendNotification({
            type: 'newDeliveryPackaging',
            status: 'On Delivery',
            audio: 'raw.mp3'
        });

        res.json({ 
            success: true,
            status: 'On Delivery',
            newActions: '<div class="action-buttons"></div>' // No more actions after delivery
        });

    } catch (error) {
        console.error('Error delivering packaging request:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

exports.markOrderPaid = async (req, res) => {
    const { id } = req.params;

    try {
        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).send('Order not found');
        }

        // Update the isPaid status
        await order.update({ isPaid: true });

        res.redirect('/finance/orderHistory');
    } catch (error) {
        console.error('Error marking order as paid:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.deliverRawMaterial = async (req, res) => {
    try {
        const { id } = req.params;
        const rawMaterialRequestVendor = await RawMaterialRequestVendor.findByPk(id, {
            include: [{
                model: RawMaterialRequest,
                attributes: ['id', 'materialName']
            }]
        });

        if (!rawMaterialRequestVendor) {
            return res.status(404).json({ success: false, message: 'Raw material request vendor not found' });
        }

        let paymentDueDate = null;

        if (rawMaterialRequestVendor.paymentType && rawMaterialRequestVendor.paymentType.startsWith('TOP')) {
            const days = parseInt(rawMaterialRequestVendor.paymentType.replace('TOP', ''));
            paymentDueDate = new Date();
            paymentDueDate.setDate(paymentDueDate.getDate() + days);
        }

        rawMaterialRequestVendor.status = 'On Delivery';
        rawMaterialRequestVendor.paymentDueDate = paymentDueDate;
        await rawMaterialRequestVendor.save();

        // Send SSE notification for finance
        req.app.locals.sendNotification({
            type: 'newDeliveryRawMaterial',
            status: 'On Delivery',
            materialName: rawMaterialRequestVendor.RawMaterialRequest.materialName,
            audio: 'raw.mp3'
        });

        res.json({ 
            success: true,
            status: 'On Delivery',
            newActions: '<div class="action-buttons"></div>' // No more actions after delivery
        });

    } catch (error) {
        console.error('Error delivering raw material request vendor:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};


// In your controller file, e.g., topController.js
exports.getTopList = async (req, res) => {
    try {
        // Fetch all orders with TOP payment type
        const topOrders = await Order.findAll({
            where: {
                paymentType: {
                    [Op.like]: 'TOP%'
                }
            }
        });

        // Fetch all raw material requests with TOP payment type
        const topRawMaterialRequests = await RawMaterialRequest.findAll({
            where: {
                paymentType: {
                    [Op.like]: 'TOP%'
                }
            }
        });

        const userRole = req.user.role;
        const today = new Date(); // Current date

        // Render the TOP list page with the retrieved data
        res.render('orders/topList', { 
            topOrders, 
            topRawMaterialRequests, 
            userRole, 
            today,
            path: '/orders/topList'
        });
    } catch (error) {
        console.error('Error fetching TOP list:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.getRawMaterialRequestHistory = async (req, res) => {
    try {
        const { startDate, endDate, sortOrder = 'asc' } = req.query;

        const dateFilter = {};
        if (startDate) dateFilter[Op.gte] = new Date(startDate);
        if (endDate) dateFilter[Op.lte] = new Date(endDate);

        const requestFilter = {
            where: {},
            include: [
                {
                    model: RawMaterialRequest,
                    attributes: ['materialName', 'realQuantity'],
                    include: [
                        {
                            model: RawMaterial,
                            attributes: ['density']  // Fetch the density from the RawMaterial model
                        }
                    ]
                },
                {
                    model: Vendor,
                    attributes: ['name'],
                }
            ],
            order: [['createdAt', sortOrder.toUpperCase()]]
        };

        // Fetch raw material request vendors with paymentType containing 'TOP' and not paid
        const topRequests = await RawMaterialRequestVendor.findAll({
            ...requestFilter,
            where: {
                ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
                paymentType: {
                    [Op.like]: 'TOP%'
                },
                '$RawMaterialRequest.isPaid$': false
            }
        });

        // Fetch raw material request vendors with either:
        // 1. paymentType other than 'TOP', or
        // 2. paymentType 'TOP' and isPaid is true
        const otherRequests = await RawMaterialRequestVendor.findAll({
            ...requestFilter,
            where: {
                ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
                [Op.or]: [
                    {
                        paymentType: {
                            [Op.notLike]: 'TOP%'
                        }
                    },
                    {
                        [Op.and]: [
                            {
                                paymentType: {
                                    [Op.like]: 'TOP%'
                                }
                            },
                            {
                                '$RawMaterialRequest.isPaid$': true
                            }
                        ]
                    }
                ]
            }
        });

        const userRole = req.user.role;
        res.render('products/rawMaterialRequestHistory', { 
            topRequests, 
            otherRequests, 
            userRole, 
            sortOrder, 
            startDate, 
            endDate,
            path: '/finance/rawMaterialRequestHistory'
        });
    } catch (error) {
        console.error('Error fetching raw material request history:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.getOrderHistory = async (req, res) => {
    try {
        const { startDate, endDate, sortOrder = 'asc' } = req.query;

        const dateFilter = {};
        if (startDate) dateFilter[Op.gte] = new Date(startDate);
        if (endDate) dateFilter[Op.lte] = new Date(endDate);

        const baseOrderFilter = {
            where: {},
            include: [
                {
                    model: Customer,
                    attributes: ['id', 'name']
                },
                {
                    model: OrderItem,
                    as: 'OrderItems',
                    attributes: [
                        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantity']
                    ],
                    required: false
                }
            ],
            group: ['Order.id', 'Customer.id'],
            order: [['createdAt', sortOrder.toUpperCase()]],
            raw: true
        };

        // Fetch orders with paymentType containing 'TOP' and not paid, excluding declined orders
        const topOrders = await Order.findAll({
            ...baseOrderFilter,
            where: {
                ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
                paymentType: {
                    [Op.like]: 'TOP%'
                },
                isPaid: false,
                status: {
                    [Op.ne]: 'Declined'
                }
            }
        });

        // Fetch orders with either:
        // 1. paymentType other than 'TOP', or
        // 2. paymentType 'TOP' and isPaid is true
        // And exclude declined orders in both cases
        const otherOrders = await Order.findAll({
            ...baseOrderFilter,
            where: {
                ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
                status: {
                    [Op.ne]: 'Declined'
                },
                [Op.or]: [
                    {
                        paymentType: {
                            [Op.notLike]: 'TOP%'
                        }
                    },
                    {
                        [Op.and]: [
                            {
                                paymentType: {
                                    [Op.like]: 'TOP%'
                                }
                            },
                            {
                                isPaid: true
                            }
                        ]
                    }
                ]
            }
        });

        const userRole = req.user.role;
        res.render('orders/orderHistory', { 
            topOrders, 
            otherOrders, 
            userRole, 
            sortOrder, 
            startDate, 
            endDate,
            path: '/finance/orderHistory'
        });
    } catch (error) {
        console.error('Error fetching order history:', error);
        res.status(500).send('Internal Server Error');
    }
};
