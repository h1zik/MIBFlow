const { Order, OrderItem, Complain, ComplainItem, Product, ComplainItemRawMaterial, ComplainRework } = require('../models/associations');
const Tank = require('../models/tank');
const ComplainTank = require('../models/complainTank');
const RawMaterial = require('../models/rawMaterial');
const Inbound = require('../models/inbound');
const Outbound = require('../models/outbound');
const sequelize = require('../config/database');
const { adjustStock } = require('../utils/stock');

exports.getCreateComplain = async (req, res) => {
    try {
        // Get all orders with their items and products
        const orders = await Order.findAll({
            where: { status: 'Delivered' },
            include: [{
                model: OrderItem,
                include: [{
                    model: Product,
                    attributes: ['id', 'name']
                }]
            }]
        });

        // Process orders to combine products with same name
        const processedOrders = orders.map(order => {
            const productMap = new Map();
            
            order.OrderItems.forEach(item => {
                if (item.Product) {  // Only process if Product exists
                    const productKey = item.Product.name;
                    if (!productMap.has(productKey)) {
                        productMap.set(productKey, {
                            Product: {
                                id: item.Product.id,
                                name: item.Product.name
                            }
                        });
                    }
                }
            });

            const orderData = order.toJSON();
            return {
                ...orderData,
                OrderItems: Array.from(productMap.values())
            };
        });

        res.render('complain/create', {
            orders: processedOrders,
            user: req.user,
            userRole: req.user.role,
            path: '/complain/create'
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).send('Error fetching orders');
    }
};

// Add function for getting schedule rework form
exports.getScheduleReworkForm = async (req, res) => {
    try {
        const complainItem = await ComplainItem.findByPk(req.params.id, {
            include: [
                {
                    model: Complain,
                    include: [Order]
                },
                {
                    model: ComplainItemRawMaterial,
                    attributes: ['id', 'rawMaterialName', 'quantity']
                }
            ]
        });

        if (!complainItem) {
            return res.status(404).send('Complain item not found');
        }

        const userRole = req.user.role;

        const tanks = await Tank.findAll();
        res.render('production/scheduleRework', {
            complainItem,
            userRole,
            complainItemsRawMaterials: complainItem.ComplainItemRawMaterials.map(cirm => ({
                id: cirm.id,
                name: cirm.rawMaterialName,
                quantity: cirm.quantity
            })),
            tanks,
            error: req.query.error || null,
            path: '/production/scheduleRework'
        });
    } catch (error) {
        console.error('Error fetching complain:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Add function for scheduling rework
exports.scheduleRework = async (req, res) => {
    const { startDate, deadlineDate, quantity, tanks, stirSequences } = req.body;

    const transaction = await sequelize.transaction();

    try {
        // First get all required data without transaction
        const complainItem = await ComplainItem.findByPk(req.params.id, {
            include: [
                {
                    model: Complain,
                    include: [Order]
                },
                {
                    model: ComplainItemRawMaterial,
                    attributes: ['id', 'rawMaterialName', 'quantity']
                }
            ]
        });

        if (!complainItem) {
            return res.status(404).send('Complain item not found');
        }

        // Get raw materials from complain item
        const rawMaterials = complainItem.ComplainItemRawMaterials.map(cirm => ({
            name: cirm.rawMaterialName,
            quantity: cirm.quantity
        }));

        // Validate raw materials stock
        for (const rawMaterial of rawMaterials) {
            const material = await RawMaterial.findOne({
                where: { name: rawMaterial.name }
            });

            if (!material) {
                return res.status(400).render('production/scheduleRework', {
                    error: `Raw material not found: ${rawMaterial.name}`,
                    complainItem,
                    complainItemsRawMaterials: complainItem.ComplainItemRawMaterials,
                    tanks: await Tank.findAll(),
                    userRole: req.user.role,
                    path: '/production/scheduleRework'
                });
            }

            if (material.stock < rawMaterial.quantity) {
                return res.status(400).render('production/scheduleRework', {
                    error: `Not enough stock for raw material: ${rawMaterial.name}`,
                    complainItem,
                    complainItemsRawMaterials: complainItem.ComplainItemRawMaterials,
                    tanks: await Tank.findAll(),
                    userRole: req.user.role,
                    path: '/production/scheduleRework'
                });
            }
        }

        // Validate tank capacity and create rework splits
        const selectedTanks = await Tank.findAll({ where: { id: tanks } });
        let totalReworkCapacity = 0;

        const reworkSplits = [];

        selectedTanks.forEach((tank, index) => {
            const stirCount = parseInt(stirSequences[index]) || 1;
            const tankCapacity = tank.volume * stirCount;
            totalReworkCapacity += tankCapacity;

            for (let i = 0; i < stirCount; i++) {
                reworkSplits.push({
                    tankId: tank.id,
                    quantity: tank.volume,
                    stirSequence: i + 1
                });
            }
        });

        if (totalReworkCapacity < quantity) {
            return res.status(400).render('production/scheduleRework', {
                error: 'Selected tanks do not have enough capacity for the rework quantity',
                complainItem,
                complainItemsRawMaterials: complainItem.ComplainItemRawMaterials,
                tanks: await Tank.findAll(),
                userRole: req.user.role,
                path: '/production/scheduleRework'
            });
        }

        // Start transaction only for database modifications
        let remainingQuantity = quantity;

        // Start transaction for database modifications
        await sequelize.transaction(async (t) => {
            for (const split of reworkSplits) {
                if (remainingQuantity <= 0) break;

                const actualQuantity = Math.min(split.quantity, remainingQuantity);
                remainingQuantity -= actualQuantity;

                // Create ComplainRework entry for each tank split
                const complainRework = await ComplainRework.create({
                    complainItemId: complainItem.id,
                    startDate,
                    deadlineDate,
                    quantity: actualQuantity,
                    status: 'Scheduled',
                    stirSequence: split.stirSequence
                }, { transaction: t });

                // Create ComplainTank entry
                await ComplainTank.create({
                    complainId: complainItem.Complain.id,
                    tankId: split.tankId
                }, { transaction: t });

                // Associate tank with the rework
                await complainRework.addTank(split.tankId, { transaction: t });

                // Subtract proportional raw material quantities
                for (const cirm of complainItem.ComplainItemRawMaterials) {
                    const material = await RawMaterial.findOne({
                        where: { name: cirm.rawMaterialName },
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    });
                    
                    if (material) {
                        const proportionalQuantity = (cirm.quantity / quantity) * actualQuantity;
                        material.stock -= proportionalQuantity;
                        await material.save({ transaction: t });

                        // Create outbound record for raw material usage
                        await Outbound.create({
                            date: new Date(),
                            soPrn: complainItem.Complain.sonumber,
                            batchNumber: 'N/A',
                            customer: 'Internal Rework',
                            product: material.name,
                            item: material.name,
                            quantity: proportionalQuantity,
                            type: 'Raw Material',
                            reason: 'Rework',
                            notes: `Used for rework of complain ${complainItem.Complain.sonumber}`
                        }, { transaction: t });
                    }
                }
            }

            // Update complain item status
            await complainItem.update({ status: 'Scheduled' }, { transaction: t });
        });

        res.redirect('/dashboard/production');
    } catch (error) {
        console.error('Error scheduling rework:', error);
        
        return res.status(400).render('production/scheduleRework', {
            error: 'Error scheduling rework: ' + error.message,
            complainItem: await ComplainItem.findByPk(req.params.id, {
                include: [
                    {
                        model: Complain,
                        include: [Order]
                    },
                    {
                        model: ComplainItemRawMaterial,
                        attributes: ['id', 'rawMaterialName', 'quantity']
                    }
                ]
            }),
            complainItemsRawMaterials: (await ComplainItem.findByPk(req.params.id, {
                include: [ComplainItemRawMaterial]
            }))?.ComplainItemRawMaterials || [],
            tanks: await Tank.findAll(),
            userRole: req.user.role,
            path: '/production/scheduleRework'
        });
    }
};

exports.createComplain = async (req, res) => {
    try {
        const { orderId, sonumber, customerName, items } = req.body;

        // Create the complain
        const complain = await Complain.create({
            orderId,
            sonumber,
            customerName,
            status: 'Open'
        });

        // Create complain items
        if (Array.isArray(items)) {
            for (const item of items) {
                // Find the product first
                const product = await Product.findOne({
                    where: { name: item.product }
                });

                if (!product) {
                    throw new Error(`Product not found: ${item.product}`);
                }

                const complainItem = await ComplainItem.create({
                    complainId: complain.id,
                    productId: product.id,
                    product: item.product,
                    quantityRejected: item.quantityRejected,
                    notes: item.notes
                });

                // Create inbound record for the rejected quantity (negative since it's a return)
                await Inbound.create({
                    date: new Date(),
                    poSoNumber: sonumber,
                    batchNumber: 'N/A', // No batch number for returns
                    item: item.product,
                    vendor: customerName,
                    quantity: item.quantityRejected, // Negative quantity since it's a return
                    expiredDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
                    type: 'Product',
                    reason: 'Complain',
                    notes: item.notes || 'Return from customer'
                });
            }
        }

        // Send notification to product warehouse
        req.app.locals.sendNotification({
            type: 'newComplain',
            sonumber: sonumber,
            customerName: customerName,
            status: 'Open',
            audio: 'product.mp3'
        });

        res.json({ success: true, message: 'Complain created successfully' });
    } catch (error) {
        console.error('Error creating complain:', error);
        res.status(500).json({ success: false, message: 'Error creating complain' });
    }
};

exports.getComplains = async (req, res) => {
    try {
        const complains = await Complain.findAll({
            include: [{
                model: ComplainItem,
                attributes: ['id', 'productId', 'product', 'quantityRejected', 'notes', 'status']
            }],
            order: [['createdAt', 'DESC']]
        });

        res.render('complain/list', {
            complains: complains,
            user: req.user,
            userRole: req.user.role,
            path: '/complain'
        });
    } catch (error) {
        console.error('Error fetching complains:', error);
        res.status(500).send('Error fetching complains');
    }
};

exports.requestRework = async (req, res) => {
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

        // Update status to indicate it's sent to production
        await complainItem.update({ status: 'Sent to Production' });

        // Send notification to production
        req.app.locals.sendNotification({
            type: 'rework',
            sonumber: complainItem.Complain.Order.sonumber,
            customerName: complainItem.Complain.Order.customerName,
            product: complainItem.product,
            audio: 'production.mp3'
        });

        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error requesting rework:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.produceBatch = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const { id } = req.params;

    try {
        const complainRework = await ComplainRework.findByPk(id, {
            include: [
                {
                    model: Tank,
                    attributes: ['name']
                },
                {
                    model: ComplainItem,
                    include: [Complain]
                }
            ]
        });

        if (!complainRework) {
            if (wantsJson) return res.status(404).json({ success: false, message: 'Rework not found' });
            return res.status(404).send('Rework not found');
        }

        // Generate the batch number
        const currentDate = new Date();
        const day = String(currentDate.getDate()).padStart(2, '0');
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const year = String(currentDate.getFullYear()).slice(-2);
        const tankName = complainRework.Tanks[0].name;
        const stirSequence = String(complainRework.stirSequence).padStart(2, '0');

        const batchNumber = `RW${day}.${month}.${year}.${tankName}-${stirSequence}`;

        // Update the rework with the generated batch number
        complainRework.batchNumber = batchNumber;
        await complainRework.save();

        if (wantsJson) return res.json({ success: true });
        res.redirect('/dashboard/production');
    } catch (error) {
        console.error('Error producing batch:', error);
        if (wantsJson) return res.status(500).json({ success: false, message: 'Internal Server Error' });
        res.status(500).send('Internal Server Error');
    }
};

exports.sendToQC = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const { id } = req.params;

    try {
        const complainRework = await ComplainRework.findByPk(id, {
            include: [
                {
                    model: ComplainItem,
                    include: [Complain]
                }
            ]
        });

        if (!complainRework) {
            if (wantsJson) return res.status(404).json({ success: false, message: 'Rework not found' });
            return res.status(404).send({ error: 'Rework not found' });
        }

        complainRework.qcStatus = 'Pending';
        await complainRework.save();

        // Send notification to QC
        req.app.locals.sendNotification({
            type: 'newQCRequest',
            batchNumber: complainRework.batchNumber,
            source: 'Complain',
            status: 'Pending',
            audio: 'qc.mp3'
        });

        if (wantsJson) return res.json({ success: true });
        res.redirect('/dashboard/production');
    } catch (error) {
        console.error('Error sending to QC:', error);
        if (wantsJson) return res.status(500).json({ success: false, message: 'Internal Server Error' });
        res.status(500).send('Internal Server Error');
    }
};

exports.proceedToDeliver = async (req, res) => {
    const { id } = req.params;
    const transaction = await sequelize.transaction();

    try {
        const rework = await ComplainRework.findByPk(id, {
            include: [{
                model: ComplainItem,
                include: [{
                    model: Complain,
                    attributes: ['sonumber', 'customerName']
                }]
            }],
            transaction
        });

        if (!rework) {
            await transaction.rollback();
            return res.status(404).send('Rework not found');
        }

        // Update rework status to Completed
        rework.status = 'Completed';
        await rework.save({ transaction });

        // Check if all reworks for this complainItem are completed
        const allReworks = await ComplainRework.findAll({
            where: { complainItemId: rework.complainItemId },
            transaction
        });

        const allCompleted = allReworks.every(r => r.status === 'Completed');

        if (allCompleted) {
            // Update complainItem status to Ready to Deliver
            await ComplainItem.update(
                { status: 'Ready to Deliver' },
                { 
                    where: { id: rework.complainItemId },
                    transaction 
                }
            );
        }

        await transaction.commit();
        res.redirect('/dashboard/production');
    } catch (error) {
        await transaction.rollback();
        console.error('Error proceeding to deliver:', error);
        res.status(500).send('Error proceeding to deliver');
    }
};

exports.updateStock = async (req, res) => {
    const { id } = req.params;
    let { realQuantity } = req.body;

    // Convert and validate realQuantity
    realQuantity = parseFloat(realQuantity);
    if (isNaN(realQuantity) || realQuantity < 0) {
        return res.status(400).send('Invalid quantity value. Please enter a valid non-negative number.');
    }

    const transaction = await sequelize.transaction();

    try {
        const complainRework = await ComplainRework.findByPk(id, {
            include: [
                {
                    model: ComplainItem,
                    attributes: ['product', 'productId']
                }
            ],
            transaction
        });

        if (!complainRework) {
            await transaction.rollback();
            return res.status(404).send('Rework not found');
        }

        if (complainRework.qcStatus !== 'Pass') {
            await transaction.rollback();
            return res.status(400).send('Rework has not passed QC');
        }

        // Find the product using productId
        const product = await Product.findByPk(complainRework.ComplainItem.productId, { transaction });

        if (!product) {
            await transaction.rollback();
            return res.status(404).send('Product not found');
        }

        // Ensure current stock is valid
        const currentStock = parseFloat(product.stock) || 0;

        // Calculate new stock with validated numbers
        const newStock = currentStock + realQuantity;

        // Update product stock with explicit number conversion and rounding
        await product.update(
            { stock: Number(newStock.toFixed(2)) },
            { transaction }
        );

        // Update rework record
        await complainRework.update(
            {
                quantity: Number(realQuantity.toFixed(2)),
                stockUpdated: true,
                status: 'Completed'
            },
            { transaction }
        );

        await transaction.commit();
        return res.redirect('/dashboard/production');
    } catch (error) {
        await transaction.rollback();
        console.error('Error updating stock:', error);
        return res.status(500).send('Error updating stock. Please try again.');
    }
};

exports.viewComplain = async (req, res) => {
    try {
        const complain = await Complain.findByPk(req.params.id, {
            include: [{
                model: ComplainItem,
                attributes: ['id', 'productId', 'product', 'quantityRejected', 'notes', 'status']
            }],
            order: [[ComplainItem, 'createdAt', 'DESC']]
        });

        if (!complain) {
            return res.status(404).send('Complain not found');
        }

        res.render('complain/view', {
            complain: complain,
            user: req.user,
            userRole: req.user.role,
            path: '/complain'
        });
    } catch (error) {
        console.error('Error fetching complain:', error);
        res.status(500).send('Error fetching complain');
    }
};

exports.updateComplainStatus = async (req, res) => {
    try {
        const { id, status } = req.body;
        
        await Complain.update(
            { status },
            { where: { id } }
        );

        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        console.error('Error updating complain status:', error);
        res.status(500).json({ success: false, message: 'Error updating status' });
    }
};

exports.setRawMaterialChoice = async (req, res) => {
    const { id } = req.params;
    const { choice } = req.body;

    try {
        const rework = await ComplainRework.findByPk(id);
        if (!rework) {
            return res.status(404).send('Rework not found');
        }

        rework.rawMaterialChoice = choice;
        await rework.save();

        res.redirect('/dashboard/production');
    } catch (error) {
        console.error('Error setting raw material choice:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.addRawMaterial = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const { id } = req.params;
    const { rawMaterialId, quantity } = req.body;
    const transaction = await sequelize.transaction();

    try {
        const rework = await ComplainRework.findByPk(id, {
            include: [ComplainItem],
            transaction
        });

        if (!rework) {
            await transaction.rollback();
            if (wantsJson) return res.status(404).json({ success: false, message: 'Rework not found' });
            return res.status(404).send('Rework not found');
        }

        const rawMaterial = await RawMaterial.findByPk(rawMaterialId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!rawMaterial) {
            await transaction.rollback();
            if (wantsJson) return res.status(404).json({ success: false, message: 'Raw material not found' });
            return res.status(404).send('Raw material not found');
        }

        // Check if there's enough stock
        if (rawMaterial.stock < quantity) {
            await transaction.rollback();
            if (wantsJson) return res.status(400).json({ success: false, message: 'Not enough raw material stock' });
            return res.status(400).send('Not enough raw material stock');
        }

        // Create ComplainItemRawMaterial record
        await ComplainItemRawMaterial.create({
            complainItemId: rework.complainItemId,
            rawMaterialId,
            rawMaterialName: rawMaterial.name,
            quantity,
            unit: 'KG'  // Set unit to KG by default
        }, { transaction });

        // Update raw material stock (atomic, locked, never negative)
        await adjustStock(RawMaterial, rawMaterialId, -quantity, { transaction });

        // Update rework status
        rework.rawMaterialAdded = true;
        await rework.save({ transaction });

        await transaction.commit();
        if (wantsJson) return res.json({ success: true });
        res.redirect('/dashboard/production');
    } catch (error) {
        await transaction.rollback();
        console.error('Error adding raw material:', error);
        if (wantsJson) return res.status(500).json({ success: false, message: 'Internal Server Error' });
        res.status(500).send('Internal Server Error');
    }
};

exports.quarantine = async (req, res) => {
    const { id } = req.params;

    try {
        const rework = await ComplainRework.findByPk(id);
        if (!rework) {
            return res.status(404).send('Rework not found');
        }

        rework.status = 'Quarantined';
        await rework.save();

        res.redirect('/dashboard/production');
    } catch (error) {
        console.error('Error quarantining rework:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.completeComplain = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const { complainId } = req.params;
    const transaction = await sequelize.transaction();

    try {
        // Find all items for this complain
        const complainItems = await ComplainItem.findAll({
            where: { complainId },
            transaction
        });

        // Check if all items are delivered
        const allDelivered = complainItems.every(item => item.status === 'Delivered');
        if (!allDelivered) {
            await transaction.rollback();
            if (wantsJson) return res.status(400).json({ success: false, message: 'Cannot complete complain. Not all items are delivered.' });
            return res.status(400).send('Cannot complete complain. Not all items are delivered.');
        }

        // Update only the ComplainItem status to Completed
        await ComplainItem.update(
            { status: 'Completed' },
            { 
                where: { complainId },
                transaction
            }
        );

        await transaction.commit();
        if (wantsJson) return res.json({ success: true });
        res.redirect('/dashboard/ppic');
    } catch (error) {
        await transaction.rollback();
        console.error('Error completing complain:', error);
        if (wantsJson) return res.status(500).json({ success: false, message: 'Error completing complain' });
        res.status(500).send('Error completing complain');
    }
};
