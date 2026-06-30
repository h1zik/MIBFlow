const { Op } = require('sequelize');
const { Order, OrderItem, Product, Packaging, Inbound, Outbound, Complain, ComplainItem, User } = require('../models');
const Production = require('../models/production').Production;
const ProductionRequest = require('../models/productionRequest');
const ComplainRework = require('../models/complainRework');
const sequelize = require('../config/database');
const { adjustStock } = require('../utils/stock');

exports.getProductWarehouse = async (req, res) => {
    try {
        const { inboundStartDate, inboundEndDate, outboundStartDate, outboundEndDate } = req.query;

        // Get yesterday's date and today's date for default date range
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayFormatted = yesterday.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        
        const today = new Date();
        const todayFormatted = today.toISOString().split('T')[0]; // Format as YYYY-MM-DD

        // Default date ranges are now yesterday to today
        const defaultInboundStartDate = yesterdayFormatted;
        const defaultInboundEndDate = todayFormatted;
        const defaultOutboundStartDate = yesterdayFormatted;
        const defaultOutboundEndDate = todayFormatted;

        // Get inbound products
        const completedProductions = await Inbound.findAll({
            where: {
                type: 'Product',
                date: {
                    [Op.gte]: inboundStartDate ? new Date(inboundStartDate) : new Date(defaultInboundStartDate),
                    [Op.lte]: inboundEndDate ? new Date(new Date(inboundEndDate).setHours(23, 59, 59, 999)) : new Date(new Date(defaultInboundEndDate).setHours(23, 59, 59, 999))
                }
            },
            order: [['date', 'DESC']]
        });

        // Get outbound products
        const outboundProducts = await Outbound.findAll({
            where: {
                type: 'Product',
                date: {
                    [Op.gte]: outboundStartDate ? new Date(outboundStartDate) : new Date(defaultOutboundStartDate),
                    [Op.lte]: outboundEndDate ? new Date(new Date(outboundEndDate).setHours(23, 59, 59, 999)) : new Date(new Date(defaultOutboundEndDate).setHours(23, 59, 59, 999))
                }
            },
            include: [{
                model: Packaging,
                attributes: ['name','volume']
            }],
            order: [['date', 'DESC']]
        });

        // Transform outbound products to match the expected format
        const outboundProductDetails = outboundProducts.map(outbound => ({
            date: outbound.date,
            sonumber: outbound.soPrn || '-',
            customer: outbound.customer || '-',
            item: outbound.item || '-',
            quantity: outbound.quantity,
            packagingName: outbound.Packaging ? outbound.Packaging.name : '-',
            packagingVolume: outbound.Packaging ? ` ${outbound.Packaging.volume}L` : ''
        }));

        // Get approved orders
        const approvedOrders = await Order.findAll({
            where: { status: 'Ready to Deliver' },
            include: [
                {
                    model: OrderItem,
                    attributes: ['invoicedQuantity', 'shippedQuantity'],
                    include: [
                        {
                            model: Product,
                            attributes: ['name']
                        },
                        {
                            model: Packaging,
                            attributes: ['name']
                        }
                    ]
                }
            ]
        });

        const processedApprovedOrders = approvedOrders.map(order => ({
            id: order.id,
            deadline: order.deadline,
            updatedAt: order.updatedAt,
            customerName: order.customerName,
            sonumber: order.sonumber,
            OrderItems: order.OrderItems?.map(item => ({
                id: item.id,
                Product: item.Product,
                Packaging: item.Packaging,
                invoicedQuantity: item.invoicedQuantity,
                shippedQuantity: item.shippedQuantity
            })) || []
        }));

        // Fetch complain items for rework
        const complainItems = await ComplainItem.findAll({
            include: [{
                model: Complain,
                include: [{
                    model: Order,
                    attributes: ['sonumber', 'customerName']
                }]
            }],
            where: {
                status: {
                    [Op.in]: ['Rework Approved', 'Pending', 'Ready to Deliver']
                }
            },
            order: [['createdAt', 'DESC']]
        });

        // Fetch users for chat feature
        const users = await User.findAll({
            attributes: ['id', 'username', 'role']
        });

        res.render('dashboards/productWarehouse', {
            userRole: req.user.role,
            userId: req.user.id,
            users,
            completedProductions,
            outboundProductDetails,
            approvedOrders: processedApprovedOrders,
            inboundStartDate: inboundStartDate || defaultInboundStartDate,
            inboundEndDate: inboundEndDate || defaultInboundEndDate,
            outboundStartDate: outboundStartDate || defaultOutboundStartDate,
            outboundEndDate: outboundEndDate || defaultOutboundEndDate,
            defaultInboundStartDate: defaultInboundStartDate,
            defaultOutboundStartDate: defaultOutboundStartDate,
            defaultInboundEndDate,
            defaultOutboundEndDate,
            path: '/dashboard/productWarehouse',
            complainItems
        });
    } catch (error) {
        console.error('Error in product warehouse:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.proceedToQC = async (req, res) => {
    try {
        const { complainItemId } = req.body;

        const complainItem = await ComplainItem.findByPk(complainItemId, {
            include: [{
                model: Complain,
                attributes: ['sonumber', 'customerName']
            }]
        });

        await ComplainItem.update(
            { status: 'Sent to QC' },
            { where: { id: complainItemId } }
        );

        // Send notification to QC
        req.app.locals.sendNotification({
            type: 'newComplainQC',
            sonumber: complainItem.Complain.sonumber,
            customerName: complainItem.Complain.customerName,
            status: 'Sent to QC',
            audio: 'qc.mp3'
        });

        res.redirect('/dashboard/productWarehouse');
    } catch (error) {
        console.error('Error updating complain item status:', error);
        res.status(400).send('Bad Request');
    }
};


exports.proceedToPPIC = async (req, res) => {
    try {
        const { complainItemId } = req.body;

        const complainItem = await ComplainItem.findByPk(complainItemId, {
            include: [{
                model: Complain,
                include: [{
                    model: Order,
                    attributes: ['sonumber', 'customerName']
                }]
            }]
        });

        await ComplainItem.update(
            { status: 'Sent to PPIC' },
            { where: { id: complainItemId } }
        );

        // Send notification
        req.app.locals.sendNotification({
            type: 'ppicRework',
            sonumber: complainItem.Complain.Order.sonumber,
            customerName: complainItem.Complain.Order.customerName,
            product: complainItem.product,
            audio: 'notification.mp3'
        });

        res.redirect('/dashboard/productWarehouse');
    } catch (error) {
        console.error('Error updating complain item status:', error);
        res.status(400).send('Bad Request');
    }
};

exports.deliverRework = async (req, res) => {
    const { id } = req.params;
    const transaction = await sequelize.transaction();

    try {
        // Update complain item status to Delivered
        await ComplainItem.update(
            { status: 'Delivered' },
            { 
                where: { id },
                transaction
            }
        );

        // Get complain item details for outbound record
        const complainItem = await ComplainItem.findByPk(id, {
            include: [
                {
                    model: Complain,
                    attributes: ['sonumber', 'customerName']
                },
                {
                    model: ComplainRework,
                    attributes: ['batchNumber'],
                    order: [['createdAt', 'DESC']],
                    limit: 1
                }
            ],
            transaction
        });

        // Create outbound record
        await Outbound.create({
            date: new Date(),
            soPrn: complainItem.Complain.sonumber,
            batchNumber: complainItem.ComplainRework?.batchNumber || 'N/A',
            customer: complainItem.Complain.customerName,
            product: complainItem.product,
            item: complainItem.product,
            quantity: complainItem.quantityRejected,
            type: 'Product',
            reason: 'Rework',
            notes: `Rework delivered for complain ${complainItem.Complain.sonumber}`
        }, { transaction });

        await transaction.commit();
        res.redirect('/dashboard/productWarehouse');
    } catch (error) {
        await transaction.rollback();
        console.error('Error delivering rework item:', error);
        res.status(400).send('Bad Request');
    }
};

exports.getUndeliveredOrders = async (req, res) => {
    try {
        console.log('Fetching undelivered orders...');
        const undeliveredItems = await OrderItem.findAll({
            where: {
                [Op.or]: [
                    { sentQuantity: null },
                    { sentQuantity: { [Op.lt]: sequelize.col('unit') } }
                ]
            },
            include: [
                {
                    model: Order,
                    attributes: ['id', 'sonumber', 'customerName', 'status'],
                    where: {
                        status: {
                            [Op.ne]: 'Declined'
                        }
                    }
                },
                {
                    model: Product,
                    attributes: ['name']
                },
                {
                    model: Packaging,
                    attributes: ['name', 'volume']
                }
            ]
        });

        const userRole = req.user.role;

        console.log('Found items:', undeliveredItems.length);
        res.render('dashboards/undeliveredOrders', {
            undeliveredItems,
            userRole,
            path: '/dashboard/undelivered-orders'
        });
    } catch (error) {
        console.error('Error fetching undelivered orders:', error);
        res.status(400).send('Bad Request');
    }
};

exports.deliverRemaining = async (req, res) => {
    const { id } = req.params;
    const { sentQuantity } = req.body;

    try {
        // Find the order item with its relations
        const orderItem = await OrderItem.findByPk(id, {
            include: [
                {
                    model: Product,
                },
                {
                    model: Packaging,
                },
                {
                    model: Order,
                }
            ]
        });

        if (!orderItem) {
            req.flash('error', 'Order item not found');
            return res.redirect('/dashboard/undelivered-orders');
        }

        // Validate sent quantity
        const remainingUnits = orderItem.unit - (orderItem.sentQuantity || 0);
        const newSentQuantity = parseInt(sentQuantity, 10);

        if (isNaN(newSentQuantity) || newSentQuantity <= 0 || newSentQuantity > remainingUnits) {
            req.flash('error', 'Invalid number of packaging units');
            return res.redirect('/dashboard/undelivered-orders');
        }

        // Calculate product quantity based on packaging units
        const productQuantityPerUnit = orderItem.quantity / orderItem.unit;
        const sentProductQuantity = productQuantityPerUnit * newSentQuantity;

        // Convert to KG for stock update if the order is in L
        const stockUpdateQuantity = orderItem.satuan === 'L' ? 
            sentProductQuantity * orderItem.Product.density : 
            sentProductQuantity;

        // Begin transaction
        const t = await sequelize.transaction();

        try {
            // Update product stock (atomic, locked, never negative)
            await adjustStock(Product, orderItem.productId, -stockUpdateQuantity, { transaction: t });

            // Update packaging stock with the entered units (integer)
            await adjustStock(Packaging, orderItem.packagingId, -newSentQuantity, { transaction: t, integer: true });

            // Update order item with sent quantities (add to existing sentQuantity)
            await OrderItem.update(
                {
                    sentQuantity: sequelize.literal(`COALESCE(sentQuantity, 0) + ${newSentQuantity}`)
                },
                {
                    where: { id: orderItem.id },
                    transaction: t
                }
            );

            // Check if this completes the order
            const orderItems = await OrderItem.findAll({
                where: { orderId: orderItem.orderId },
                transaction: t
            });

            const allItemsDelivered = orderItems.every(item => item.sentQuantity === item.unit);

            // Update order status based on delivery status
            await Order.update(
                { 
                    status: allItemsDelivered ? 'Approved' : 'Partially Delivered'
                },
                { 
                    where: { id: orderItem.orderId },
                    transaction: t 
                }
            );

            // Commit transaction
            await t.commit();

            req.flash('success', 'Delivery completed successfully');
            res.redirect('/productWarehouse/undelivered');
        } catch (error) {
            await t.rollback();
            console.error('Transaction error:', error);
            req.flash('error', 'An error occurred while processing the delivery');
            res.redirect('/productWarehouse/undelivered');
        }
    } catch (error) {
        console.error('Error processing delivery:', error);
        req.flash('error', 'An error occurred while processing your request');
        res.redirect('/productWarehouse/undelivered');
    }
};

exports.deliverOrder = async (req, res) => {
    try {
        const { orderId } = req.body;

        // Find the order to get its payment type
        const order = await Order.findByPk(orderId);

        if (!order) {
            return res.status(404).send({ error: 'Order not found' });
        }

        let paymentDueDate = null;

        // Check if the payment type is TOP
        if (order.paymentType && order.paymentType.startsWith('TOP')) {
            const days = parseInt(order.paymentType.replace('TOP', '')); // Extract the number of days
            const deliverDate = new Date(); // Date when the order is delivered

            // Calculate the paymentDueDate
            paymentDueDate = new Date(deliverDate);
            paymentDueDate.setDate(deliverDate.getDate() + days);
        }

        // Begin transaction
        const t = await sequelize.transaction();

        try {
            // Get all order items with product and packaging info
            const orderItems = await OrderItem.findAll({
                where: { orderId: orderId },
                include: [
                    {
                        model: Product,
                        attributes: ['name']
                    },
                    {
                        model: Packaging,
                        attributes: ['id', 'name']
                    }
                ]
            });

            for (const item of orderItems) {
                // Case 1: shippedQuantity is not 0 and invoicedQuantity is bigger
                if (item.shippedQuantity !== 0 && item.invoicedQuantity > item.shippedQuantity) {
                    const difference = item.invoicedQuantity - item.shippedQuantity;
                    
                    // Add the difference to shippedQuantity
                    await OrderItem.update(
                        { 
                            shippedQuantity: sequelize.literal(`shippedQuantity + ${difference}`)
                        },
                        { 
                            where: { id: item.id },
                            transaction: t 
                        }
                    );
                }
                // Case 2: invoicedQuantity is not 0 and sentQuantity is bigger
                else if (item.invoicedQuantity !== 0 && item.sentQuantity > item.invoicedQuantity) {
                    const difference = item.sentQuantity - item.invoicedQuantity;
                    
                    // Update invoicedQuantity with the difference
                    await OrderItem.update(
                        { 
                            shippedQuantity: item.sentQuantity,
                            invoicedQuantity: sequelize.literal(`invoicedQuantity + ${difference}`)
                        },
                        { 
                            where: { id: item.id },
                            transaction: t 
                        }
                    );
                } else {
                    // If no special conditions met, just update shippedQuantity
                    await OrderItem.update(
                        { shippedQuantity: item.sentQuantity },
                        { 
                            where: { id: item.id },
                            transaction: t 
                        }
                    );
                }
            }

            // Update the order status to "On Delivery" and set the paymentDueDate if applicable
            await Order.update(
                { 
                    status: 'On Delivery',
                    paymentDueDate: paymentDueDate 
                },
                { 
                    where: { id: orderId },
                    transaction: t 
                }
            );

            // Create outbound records for each product
            for (const item of orderItems) {
                await Outbound.create({
                    date: new Date(),
                    soPrn: order.sonumber,
                    batchNumber: item.batchNumber || 'N/A',
                    customer: order.customerName,
                    product: item.Product.name,
                    item: item.Product.name,
                    quantity: item.invoicedQuantity - item.shippedQuantity,
                    type: 'Product',
                    reason: 'Order',
                    notes: `Delivered from order ${order.sonumber}`,
                    packagingId: item.Packaging?.id || null
                }, { transaction: t });
            }

            await t.commit();
            res.redirect('/dashboard/productWarehouse');
        } catch (error) {
            await t.rollback();
            console.error('Error updating order status:', error);
            res.status(400).send('Bad Request');
        }
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(400).send('Bad Request');
    }
};
