const ProductionRequest = require('../models/productionRequest');
const Product = require('../models/product');
const RawMaterialRequest = require('../models/rawMaterialRequest'); // Add this line
const { Production, ProductionRawMaterial } = require('../models/production');
const Inbound = require('../models/inbound');
const Outbound = require('../models/outbound');
const Tank = require('../models/tank'); // Add this line
const Order = require('../models/order');
const OrderItem = require('../models/orderItem');
const Packaging = require('../models/packaging');
const RawMaterial = require('../models/rawMaterial'); // Add this line
const sequelize = require('../config/database');
const ProductionRequestRawMaterial = require('../models/productionRequestRawMaterial');
const ProductFormula = require('../models/productFormula');
const ComplainItem = require('../models/complainItem');
const Complain = require('../models/complain');
const ComplainRework = require('../models/complainRework');
const ProductionRequestPackaging = require('../models/productionRequestPackaging');
const OrderConsumable = require('../models/orderConsumable');
const User = require('../models/user'); // Add User model
const { Op } = require('sequelize');
const { adjustStock } = require('../utils/stock');


exports.requestProductionForm = async (req, res) => {
    try {
        const [products, packagings] = await Promise.all([
            Product.findAll(),
            Packaging.findAll()
        ]);
        const userRole = req.user.role;
        res.render('ppic/requestProduction', { 
            products, 
            packagings,
            userRole,
            path: '/ppic/requestProduction'
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.getRawMaterials = async (req, res) => {
    const { productId, quantity } = req.query;

    try {
        const productFormulas = await ProductFormula.findAll({
            where: { productId },
            include: [RawMaterial]
        });

        const rawMaterials = productFormulas.map(formula => {
            const requiredQuantity = (formula.percentage / 100) * quantity;
            return {
                name: formula.RawMaterial.name,
                quantity: requiredQuantity,
                stock: formula.RawMaterial.stock
            };
        });

        res.json({ rawMaterials });
    } catch (error) {
        console.error('Error fetching raw materials:', error);
        res.status(500).send('Internal Server Error');
    }
};


exports.requestProduction = async (req, res) => {
    const { product, quantity, unit, formulaSource, existingFormula } = req.body;
    const file = req.file; // For formula upload
    let packaging = [];
    
    // Parse packaging data from form
    if (req.body.packaging) {
        if (Array.isArray(req.body.packaging)) {
            packaging = req.body.packaging.map(p => {
                return {
                    packagingId: p.packagingId,
                    quantity: parseInt(p.quantity)
                };
            });
        } else {
            // Handle case where only one packaging is selected
            packaging = [{
                packagingId: req.body.packaging.packagingId,
                quantity: parseInt(req.body.packaging.quantity)
            }];
        }
    }
    
    // Check if product is selected
    if (!product) {
        return res.render('ppic/requestProduction', { 
            products: await Product.findAll(),
            packagings: await Packaging.findAll(),
            userRole: req.user.role,
            path: '/ppic/requestProduction',
            error: 'Please select a product'
        });
    }
    
    // Validate formula selection
    if (formulaSource === 'existing' && !existingFormula) {
        // User selected to use existing formula but no formula exists
        return res.render('ppic/requestProduction', { 
            products: await Product.findAll(),
            packagings: await Packaging.findAll(),
            userRole: req.user.role,
            path: '/ppic/requestProduction',
            error: 'No existing formula available. Please upload a formula file.'
        });
    }
    
    if (formulaSource === 'upload' && !file) {
        // User selected to upload a formula but didn't provide a file
        return res.render('ppic/requestProduction', { 
            products: await Product.findAll(),
            packagings: await Packaging.findAll(),
            userRole: req.user.role,
            path: '/ppic/requestProduction',
            error: 'Please upload a formula file.'
        });
    }
    
    // Begin transaction for database operations
    const transaction = await sequelize.transaction();

    try {
        const selectedProduct = await Product.findByPk(product);
        if (!selectedProduct) {
            await transaction.rollback();
            return res.render('ppic/requestProduction', { 
                products: await Product.findAll(),
                packagings: await Packaging.findAll(),
                userRole: req.user.role,
                path: '/ppic/requestProduction',
                error: 'Product not found'
            });
        }


        // Calculate quantity based on unit
        let finalQuantity = parseFloat(quantity);
        let volumeInLiters;
        if (unit === 'L') {
            finalQuantity *= selectedProduct.density;
            volumeInLiters = parseFloat(quantity);
        } else {
            volumeInLiters = finalQuantity / selectedProduct.density;
        }

        // Validate packaging
        if (!packaging || !Array.isArray(packaging)) {
            await transaction.rollback();
            return res.render('ppic/requestProduction', { 
                products: await Product.findAll(),
                packagings: await Packaging.findAll(),
                userRole: req.user.role,
                path: '/ppic/requestProduction',
                error: 'Packaging information is required'
            });
        }

        // Calculate total packaging volume
        let totalPackagingVolume = 0;
        for (const pack of packaging) {
            const packagingItem = await Packaging.findByPk(pack.packagingId);
            if (!packagingItem) {
                await transaction.rollback();
                return res.render('ppic/requestProduction', { 
                    products: await Product.findAll(),
                    packagings: await Packaging.findAll(),
                    userRole: req.user.role,
                    path: '/ppic/requestProduction',
                    error: 'Packaging not found'
                });
            }

            // Check if there's enough packaging stock
            if (packagingItem.stock < pack.quantity) {
                await transaction.rollback();
                return res.render('ppic/requestProduction', { 
                    products: await Product.findAll(),
                    packagings: await Packaging.findAll(),
                    userRole: req.user.role,
                    path: '/ppic/requestProduction',
                    error: `Not enough stock for packaging: ${packagingItem.name}. Available: ${packagingItem.stock}, Required: ${pack.quantity}`
                });
            }

            totalPackagingVolume += packagingItem.volume * pack.quantity;
        }

        // Check if packaging volume is sufficient and minimal
        if (totalPackagingVolume < volumeInLiters) {
            await transaction.rollback();
            return res.render('ppic/requestProduction', { 
                products: await Product.findAll(),
                packagings: await Packaging.findAll(),
                userRole: req.user.role,
                path: '/ppic/requestProduction',
                error: 'Total packaging volume is insufficient'
            });
        }

        // Check for minimality - ensure we can't reduce any packaging quantity and still meet the volume requirement
        for (const pack of packaging) {
            const packagingItem = await Packaging.findByPk(pack.packagingId);
            const currentPackVolume = packagingItem.volume * pack.quantity;
            
            // Try reducing this packaging's quantity by 1
            const reducedVolume = totalPackagingVolume - packagingItem.volume;
            
            // If we can reduce by 1 and still meet the requirement, the configuration is not minimal
            if (reducedVolume >= volumeInLiters && pack.quantity > 1) {
                await transaction.rollback();
                return res.render('ppic/requestProduction', { 
                    products: await Product.findAll(),
                    packagings: await Packaging.findAll(),
                    userRole: req.user.role,
                    path: '/ppic/requestProduction',
                    error: 'The packaging configuration is not minimal. Please reduce the packaging quantity to the minimum required.'
                });
            }
            
            // Check if we can use a smaller quantity of this packaging type
            const minQuantityNeeded = Math.ceil((volumeInLiters - (totalPackagingVolume - currentPackVolume)) / packagingItem.volume);
            if (minQuantityNeeded < pack.quantity) {
                await transaction.rollback();
                return res.status(400).send('The packaging configuration is not minimal. Please reduce the packaging quantity to the minimum required.');
            }
        }

        // Fetch product formulas to determine the raw material quantities
        const productFormulas = await ProductFormula.findAll({
            where: { productId: selectedProduct.id },
            include: [RawMaterial]
        });

        let totalRawMaterialQuantity = 0;
        const rawMaterialsData = [];

        for (const formula of productFormulas) {
            const rawMaterial = await RawMaterial.findByPk(formula.rawMaterialId);
            const rawMaterialQuantity = (formula.percentage / 100) * finalQuantity;

            totalRawMaterialQuantity += rawMaterialQuantity;

            if (rawMaterial.stock < rawMaterialQuantity) {
                await transaction.rollback();
                return res.render('ppic/requestProduction', { 
                    products: await Product.findAll(),
                    packagings: await Packaging.findAll(),
                    userRole: req.user.role,
                    path: '/ppic/requestProduction',
                    error: `Not enough stock for raw material: ${rawMaterial.name}`
                });
            }

            rawMaterialsData.push({
                rawMaterialId: rawMaterial.id,
                quantity: rawMaterialQuantity,
            });
        }

        // Determine which formula to use
        let formulaFilename;
        if (formulaSource === 'existing' && existingFormula) {
            // Use existing formula
            formulaFilename = existingFormula;
            // Ensure it's a string
            if (typeof formulaFilename !== 'string') {
                formulaFilename = String(formulaFilename);
            }
        } else if (file) {
            // Use uploaded formula
            formulaFilename = file.filename;
            
            // Update the product's formula if it doesn't have one
            if (!selectedProduct.formula) {
                await selectedProduct.update({ formula: formulaFilename }, { transaction });
            }
        } else {
            // No formula provided - this should not happen due to validation, but just in case
            await transaction.rollback();
            return res.render('ppic/requestProduction', { 
                products: await Product.findAll(),
                packagings: await Packaging.findAll(),
                userRole: req.user.role,
                path: '/ppic/requestProduction',
                error: 'Formula is required. Please either select an existing formula or upload a new one.'
            });
        }
        
        // Create production request with formula
        // Make sure formulaFilename is defined and is a string
        if (!formulaFilename) {
            // If we somehow got here without a formula, use the product's formula as fallback
            formulaFilename = selectedProduct.formula || 'no_formula.xlsx';
        }
        
        // Ensure formula is a string to prevent Sequelize validation errors
        if (typeof formulaFilename !== 'string') {
            formulaFilename = String(formulaFilename);
        }
        
        // Create production request
        let productionRequest;
        try {
            productionRequest = await ProductionRequest.create({
                product: selectedProduct.name,
                quantity: finalQuantity,
                formula: formulaFilename,
                orderId: null,
                prodreqnumber: req.body.prodreqnumber
            }, { transaction });
        } catch (error) {
            console.error('Error creating production request:', error);
            await transaction.rollback();
            return res.render('ppic/requestProduction', { 
                products: await Product.findAll(),
                packagings: await Packaging.findAll(),
                userRole: req.user.role,
                path: '/ppic/requestProduction',
                error: 'Error creating production request: ' + error.message
            });
        }

        // Save packaging information and update stock
        for (const pack of packaging) {
            const packagingItem = await Packaging.findByPk(pack.packagingId, { transaction });
            
            // Create production request packaging record
            await ProductionRequestPackaging.create({
                productionRequestId: productionRequest.id,
                packagingId: pack.packagingId,
                quantity: pack.quantity
            }, { transaction });
            
            // Subtract the quantity from the packaging stock (atomic, locked, never negative)
            if (packagingItem) {
                await adjustStock(Packaging, packagingItem.id, -pack.quantity, { transaction, integer: true });
            }

            // Create outbound record for packaging with SO number if available
            const soNumber = req.body.soNumber || req.body.prodreqnumber;
            
            await Outbound.create({
                date: new Date(),
                soPrn: soNumber,
                batchNumber: 'N/A',
                customer: 'Internal Production',
                product: packagingItem.name,
                item: packagingItem.name,
                quantity: pack.quantity,
                type: 'Packaging',
                reason: 'Production',
                notes: `Used for production request ${req.body.prodreqnumber}${req.body.soNumber ? ` for order SO#${req.body.soNumber}` : ''}`,
                packagingId: pack.packagingId
            }, { transaction });
        }

        // Save raw material information and update stock
        for (const rawMaterialData of rawMaterialsData) {
            // Create the production request raw material record
            await ProductionRequestRawMaterial.create({
                productionRequestId: productionRequest.id,
                rawMaterialId: rawMaterialData.rawMaterialId,
                quantity: rawMaterialData.quantity
            }, { transaction });
            
            // Subtract the quantity from the raw material stock (atomic, locked, never negative)
            const rawMaterial = await RawMaterial.findByPk(rawMaterialData.rawMaterialId, { transaction });
            if (rawMaterial) {
                await adjustStock(RawMaterial, rawMaterial.id, -rawMaterialData.quantity, { transaction });

                // Create outbound record for raw material with SO number if available
                const soNumber = req.body.soNumber || req.body.prodreqnumber;
                
                await Outbound.create({
                    date: new Date(),
                    soPrn: soNumber,
                    batchNumber: 'N/A',
                    customer: 'Internal Production',
                    product: rawMaterial.name,
                    item: rawMaterial.name,
                    quantity: rawMaterialData.quantity,
                    type: 'Raw Material',
                    reason: 'Production',
                    notes: `Used for production request ${req.body.prodreqnumber}${req.body.soNumber ? ` for order SO#${req.body.soNumber}` : ''}`,
                    rawMaterialId: rawMaterial.id
                }, { transaction });
            }
        }

        await transaction.commit();

        // Send notification for new production request
    req.app.locals.sendNotification({
        type: 'newProductionRequest',
        productName: selectedProduct.name,
        quantity: quantity,
        unit: unit,
        status: 'Pending',
        audio: 'production.mp3'
    });
    
        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error creating production request:', error);
        await transaction.rollback();
        return res.render('ppic/requestProduction', { 
            products: await Product.findAll(),
            packagings: await Packaging.findAll(),
            userRole: req.user.role,
            path: '/ppic/requestProduction',
            error: 'An error occurred while processing your request. Please try again.'
        });
    }
};


exports.getProductionRequests = async (req, res) => {
    try {
        // Fetch rework items that need scheduling
        const [reworkItems, reworkProductions] = await Promise.all([
            ComplainItem.findAll({
                where: { status: 'Sent to Production' },
                include: [{
                    model: Complain,
                    include: ['Order']
                }]
            }),
            ComplainRework.findAll({
                where: {
                    [Op.and]: [
                        {
                            status: {
                                [Op.notIn]: ['Completed', 'Quarantined']
                            }
                        }
                    ]
                },
                include: [
                    {
                        model: ComplainItem,
                        include: [
                            {
                                model: Complain,
                                include: ['Order']
                            },
                            {
                                model: Product,
                                foreignKey: 'product',
                                targetKey: 'name',
                                include: [{
                                    model: ProductFormula,
                                    include: [{
                                        model: RawMaterial,
                                        attributes: ['id', 'name', 'stock']
                                    }]
                                }]
                            }
                        ]
                    },
                    {
                        model: Tank,
                        attributes: ['name', 'volume']
                    }
                ],
                order: [['createdAt', 'DESC']]
            })
        ]);

        const requests = await ProductionRequest.findAll({
            where: {
                status: {
                    [Op.ne]: 'Completed'
                }
            },
            include: [{
                model: Order,
                attributes: ['sonumber']
            }]
        });
        const rawMaterialRequests = await RawMaterialRequest.findAll();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set the time to 00:00:00 for accurate comparison

        const productions = await Production.findAll({
            where: {
                stockUpdated: false,
                status: {
                    [Op.ne]: 'Quarantined'
                }
            },
            include: [
                {
                    model: Product,
                    attributes: ['name'],
                    include: [{
                        model: ProductFormula,
                        include: [{
                            model: RawMaterial,
                            attributes: ['id', 'name', 'stock']
                        }]
                    }]
                },
                {
                    model: ProductionRawMaterial,
                    include: [{
                        model: RawMaterial,
                        attributes: ['name']
                    }]
                },
                {
                    model: Tank,
                    attributes: ['name', 'volume']
                },
                {
                    model: ProductionRequest,
                    include: [{
                        model: Order,
                        attributes: ['sonumber']
                    }]
                }
            ]
        });

        const userRole = req.user.role;

        const ongoingProcesses = productions.filter(production => new Date(production.startDate).setHours(0, 0, 0, 0) <= today);
        const upcomingProcesses = productions.filter(production => new Date(production.startDate).setHours(0, 0, 0, 0) > today);

        // Fetch users for chat feature
        const users = await User.findAll({
            attributes: ['id', 'username', 'role']
        });

        res.status(200).render('dashboards/production', { 
            requests, 
            rawMaterialRequests, 
            ongoingProcesses, 
            upcomingProcesses,
            reworkItems,
            reworkProductions,
            users,
            userRole,
            userId: req.user.id,
            path: '/dashboard/production'
        });
    } catch (error) {
        res.status(400).send(error);
    }
};

exports.approveProductionRequest = async (req, res) => {
    const { id } = req.params;

    try {
        const request = await ProductionRequest.findByPk(id);
        if (!request) {
            return res.status(404).send({ error: 'Request not found' });
        }

        request.status = 'Approved';
        await request.save();
        res.redirect('/dashboard/production');
    } catch (error) {
        res.status(400).send(error);
    }
};

exports.declineProductionRequest = async (req, res) => {
    const { id } = req.params;
    const transaction = await sequelize.transaction();

    try {
        // Find the production request with its associated packaging and raw materials
        const request = await ProductionRequest.findByPk(id, { transaction });
        if (!request) {
            await transaction.rollback();
            return res.status(404).send({ error: 'Request not found' });
        }

        // Get the production request number for logging and finding outbound records
        const prodreqnumber = request.prodreqnumber;
        console.log(`Declining production request ${prodreqnumber}`);

        // 1. Handle packaging - restore stock and delete records
        const packagingRecords = await ProductionRequestPackaging.findAll({
            where: { productionRequestId: id },
            include: [Packaging],
            transaction
        });


        for (const packagingRecord of packagingRecords) {
            const packaging = packagingRecord.Packaging;
            if (packaging) {
                // Restore the stock (atomic, locked)
                await adjustStock(Packaging, packaging.id, packagingRecord.quantity, { transaction, integer: true });

                // Delete related outbound records
                await Outbound.destroy({
                    where: {
                        packagingId: packaging.id,
                        notes: { [Op.like]: `%${prodreqnumber}%` },
                        type: 'Packaging'
                    },
                    transaction
                });
            }

            // Delete the production request packaging record
            await packagingRecord.destroy({ transaction });
        }

        // 2. Handle raw materials - restore stock and delete records
        const rawMaterialRecords = await ProductionRequestRawMaterial.findAll({
            where: { productionRequestId: id },
            include: [RawMaterial],
            transaction
        });


        for (const rawMaterialRecord of rawMaterialRecords) {
            const rawMaterial = rawMaterialRecord.RawMaterial;
            if (rawMaterial) {
                // Restore the stock (atomic, locked)
                await adjustStock(RawMaterial, rawMaterial.id, rawMaterialRecord.quantity, { transaction });

                // Delete related outbound records for raw materials by name and notes
                // Since there's no rawMaterialId column in the Outbound table
                await Outbound.destroy({
                    where: {
                        product: rawMaterial.name,
                        notes: { [Op.like]: `%${prodreqnumber}%` },
                        type: 'Raw Material'
                    },
                    transaction
                });
            }

            // Delete the production request raw material record
            await rawMaterialRecord.destroy({ transaction });
        }

        // 3. Update the production request status
        request.status = 'Declined';
        await request.save({ transaction });

        // Commit the transaction
        await transaction.commit();
        console.log(`Successfully declined production request ${prodreqnumber} and restored all stocks`);

        res.redirect('/dashboard/production');
    } catch (error) {
        // Rollback in case of error
        await transaction.rollback();
        console.error('Error declining production request:', error);
        res.status(400).send(error);
    }
};

exports.sendToQC = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const { id } = req.params;

    try {
        const production = await Production.findByPk(id, {
            include: [
                {
                    model: Product,
                    attributes: ['name']
                }
            ]
        });

        if (!production) {
            if (wantsJson) return res.status(404).json({ success: false, message: 'Production not found' });
            return res.status(404).send({ error: 'Production not found' });
        }

        production.qcStatus = 'Pending';
        await production.save();

        // Send notification to QC
        req.app.locals.sendNotification({
            type: 'newQCRequest',
            batchNumber: production.batchNumber,
            productName: production.Product.name,
            source: 'Production',
            status: 'Pending',
            audio: 'qc.mp3'
        });

        if (wantsJson) return res.json({ success: true });
        res.redirect('/dashboard/production');
    } catch (error) {
        if (wantsJson) return res.status(400).json({ success: false, message: 'Error sending to QC' });
        res.status(400).send(error);
    }
};

exports.updateStock = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const { id } = req.params;
    let { realQuantity } = req.body;

    // Convert and validate realQuantity
    realQuantity = parseFloat(realQuantity);
    if (isNaN(realQuantity) || realQuantity < 0) {
        if (wantsJson) return res.status(400).json({ success: false, message: 'Invalid quantity value. Please enter a valid non-negative number.' });
        return res.status(400).send('Invalid quantity value. Please enter a valid non-negative number.');
    }

    const transaction = await sequelize.transaction();

    try {
        const production = await Production.findByPk(id, {
            include: [
                {
                    model: Product,
                    attributes: ['id', 'stock', 'name']
                },
                {
                    model: ProductionRequest,
                    include: [{
                        model: Order,
                        attributes: ['sonumber']
                    }]
                }
            ],
            transaction
        });

        if (!production) {
            await transaction.rollback();
            if (wantsJson) return res.status(404).json({ success: false, message: 'Production not found' });
            return res.status(404).send('Production not found');
        }

        if (production.qcStatus !== 'Pass') {
            await transaction.rollback();
            if (wantsJson) return res.status(400).json({ success: false, message: 'Production has not passed QC' });
            return res.status(400).send('Production has not passed QC');
        }

        // Add produced quantity to product stock (atomic, locked).
        await adjustStock(Product, production.Product.id, realQuantity, { transaction });

        // Update production record
        await production.update(
            {
                quantity: Number(realQuantity.toFixed(2)),
                stockUpdated: true,
                status: 'Completed'
            },
            { transaction }
        );

        // Get the SO number from the production request's order
        const productionRequest = await production.ProductionRequest;
        const soNumber = productionRequest?.Order?.sonumber || 'N/A';

        // Create inbound record
        await Inbound.create({
            date: new Date(),
            poSoNumber: soNumber,
            batchNumber: production.batchNumber,
            item: production.Product.name,
            vendor: 'Internal Production',
            quantity: realQuantity,
            expiredDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)), // Set expired date to 2 years from now
            type: 'Produk',
            reason: 'Dari Produksi',
            notes: 'Created from production'
        }, { transaction });

        await transaction.commit();
        console.log("Stock updated successfully");
        if (wantsJson) return res.json({ success: true });
        return res.redirect('/dashboard/production');
    } catch (error) {
        await transaction.rollback();
        console.error('Error updating stock:', error);
        if (wantsJson) return res.status(500).json({ success: false, message: 'Error updating stock. Please try again.' });
        return res.status(500).send('Error updating stock. Please try again.');
    }
};


exports.getSampleRetainedProductions = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Calculate default start and end dates (7 weeks before today and today)
        const defaultEndDate = new Date().toISOString().split('T')[0];
        const defaultStartDate = new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0];

        // Filter productions by date range if provided
        const productionWhereClause = {
            sampleRetained: true
        };

        if (startDate) {
            productionWhereClause.startDate = { [Op.gte]: new Date(startDate) };
        }
        if (endDate) {
            productionWhereClause.startDate = { ...productionWhereClause.startDate, [Op.lte]: new Date(endDate) };
        }

        const productions = await Production.findAll({
            where: productionWhereClause,
            include: [
                { model: Product }, // Include associated Product
                { model: Tank }     // Include associated Tank(s)
            ]
        });

        const userRole = req.user.role;
        res.render('production/sampleRetainedProductions', { 
            productions,
            userRole,
            startDate,
            endDate,
            defaultStartDate,
            defaultEndDate,
            path: '/qc/sampleRetainedProductions'
        });
    } catch (error) {
        console.error('Error fetching retained sample productions:', error);
        res.status(500).send('Internal Server Error');
    }
};


exports.renderRequestProductionPage = async (req, res) => {
    const { orderId } = req.params;

    try {
        const order = await Order.findByPk(orderId, {
            include: [{
                model: OrderItem,
                include: [
                    {
                        model: Product,
                        attributes: ['id', 'name', 'stock', 'density', 'formula']
                    },
                    {
                        model: Packaging,
                        attributes: ['id', 'name', 'volume', 'stock']
                    }
                ]
            }]
        });

        if (!order) {
            return res.status(404).send({ error: 'Order not found' });
        }

        const productsMap = {};

        // First pass: Calculate needed quantities for each product
        order.OrderItems.forEach(item => {
            const productId = item.Product.id;
            const productName = item.Product.name;
            const orderedQuantity = parseFloat(item.quantity);
            const units = item.satuan;
            const density = item.Product.density;

            let productionQuantity;
            if (units === "L") {
                productionQuantity = orderedQuantity * density;
            } else {
                productionQuantity = orderedQuantity;
            }

            if (!productsMap[productId]) {
                productsMap[productId] = {
                    productId,
                    productName,
                    totalOrderedQuantity: 0,
                    currentStock: item.Product.stock,
                    neededQuantity: 0,
                    units,
                    density: item.Product.density,
                    formula: item.Product.formula, // Include the formula attribute
                    rawMaterialsMap: new Map() // Track raw materials per product
                };
            }

            productsMap[productId].totalOrderedQuantity += productionQuantity;
        });

        // Calculate needed quantities and filter products that need production
        Object.values(productsMap).forEach(product => {
            const neededQuantity = product.totalOrderedQuantity - product.currentStock;
            if (neededQuantity > 0) {
                product.neededQuantity = neededQuantity;
            }
        });

        const productsToProduce = Object.values(productsMap).filter(product => product.neededQuantity > 0);

        // Get packaging requirements for each product
        for (let product of productsToProduce) {
            const orderItems = order.OrderItems.filter(item => item.Product.id === product.productId);
            product.packagings = [];

            for (const item of orderItems) {
                const packaging = await Packaging.findByPk(item.packagingId);
                if (packaging) {
                    let orderVolume = product.neededQuantity;
                    if (product.units === "KG") {
                        orderVolume = product.neededQuantity / item.Product.density;
                    }
                    const packagingQuantity = Math.ceil(orderVolume / packaging.volume);
                    product.packagings.push({
                        id: packaging.id,
                        name: packaging.name,
                        volume: packaging.volume,
                        stock: packaging.stock,
                        unit: item.unit
                    });
                }
            }
        }

        // Calculate raw materials needed for each product independently
        for (let product of productsToProduce) {
            const productFormulas = await ProductFormula.findAll({
                where: { productId: product.productId },
                include: [RawMaterial]
            });

            product.rawMaterials = productFormulas.map(formula => {
                const rawMaterialId = formula.rawMaterialId;
                const rawMaterialQuantity = formula.percentage / 100 * product.neededQuantity;
                const remainingStock = formula.RawMaterial.stock;

                // Store raw material info in the product's map
                if (!product.rawMaterialsMap.has(rawMaterialId)) {
                    product.rawMaterialsMap.set(rawMaterialId, {
                        id: rawMaterialId,
                        name: formula.RawMaterial.name,
                        quantity: rawMaterialQuantity,
                        stock: remainingStock
                    });
                }

                return {
                    id: rawMaterialId,
                    name: formula.RawMaterial.name,
                    quantity: rawMaterialQuantity,
                    stock: remainingStock,
                    percentage: formula.percentage
                };
            });
        }

        // Convert each product's raw materials map to an array
        productsToProduce.forEach(product => {
            product.rawMaterialsToRequest = Array.from(product.rawMaterialsMap.values());
            delete product.rawMaterialsMap; // Clean up the map as it's no longer needed
        });
        const userRole = req.user.role;
        res.render('ppic/requestProductions', { 
            order, 
            productsToProduce,
            userRole,
            path: '/ppic/requestProduction'
        });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.createProductionRequest = async (req, res) => {
    const { orderId, productId, productName, quantity, prodreqnumber } = req.body;
    const transaction = await sequelize.transaction();

    try {
        // Validate required fields
        if (!productId || !productName || !quantity) {
            await transaction.rollback();
            return res.status(400).send('Missing required fields');
        }

        // Formula now comes from the structured DB formula (ProductFormula); a file
        // upload is no longer required. Keep optional backward-compat: use an uploaded
        // file if one was provided, else any legacy existing-formula reference, else ''.
        // Raw-material quantities are computed from ProductFormula below regardless.
        const existingFormula = req.body[`existingFormula-${productId}`];
        const uploadedFormula = req.files ? req.files.find(file => file.fieldname === `formula-${productId}`) : null;
        let formulaFilename = '';
        if (uploadedFormula) {
            formulaFilename = uploadedFormula.filename;
        } else if (existingFormula) {
            formulaFilename = String(existingFormula);
        }

        const productionQuantity = parseFloat(quantity);

        // Get product formulas
        const productFormulas = await ProductFormula.findAll({
            where: { productId }
        });

        const rawMaterialsData = [];

        // Process raw materials for this product
        for (const formula of productFormulas) {
            const rawMaterial = await RawMaterial.findByPk(formula.rawMaterialId);
            const rawMaterialQuantity = (formula.percentage / 100) * productionQuantity;

            // Log raw material availability for debugging
            console.log(`Raw material ${rawMaterial.name} for ${productName}: needed=${rawMaterialQuantity}, available=${rawMaterial.stock}`);
            
            // Add raw material data regardless of availability
            rawMaterialsData.push({
                rawMaterialId: rawMaterial.id,
                quantity: rawMaterialQuantity,
            });
        }
        
        // Send notification for new production request after validation is successful
        req.app.locals.sendNotification({
            type: 'newProductionRequest',
            productName: productName,
            quantity: quantity,
            prodreqnumber: prodreqnumber,
            status: 'Pending',
            audio: 'production.mp3'
        });

        // Create production request
        const productionRequest = await ProductionRequest.create({
            product: productName,
            quantity: productionQuantity,
            formula: formulaFilename,
            orderId,
            prodreqnumber
        }, { transaction });
        
        // Get the order with SO number for outbound records
        const orderData = await Order.findByPk(orderId, { transaction });
        const soNumber = orderData ? orderData.sonumber : 'Unknown';
        
        // Handle packaging data from the form
        // Check if packaging data is included in the request
        if (req.body.products && req.body.products[productId] && req.body.products[productId].packagings) {
            const packagings = req.body.products[productId].packagings;
            
            // Process each packaging item
            for (const packagingId in packagings) {
                if (packagings.hasOwnProperty(packagingId)) {
                    const packagingQuantity = parseInt(packagings[packagingId].quantity);
                    
                    // Create production request packaging record
                    await ProductionRequestPackaging.create({
                        productionRequestId: productionRequest.id,
                        packagingId: packagingId,
                        quantity: packagingQuantity
                    }, { transaction });
                    
                    // Subtract the quantity from the packaging stock (atomic, locked, never negative)
                    const packagingItem = await Packaging.findByPk(packagingId, { transaction });
                    if (packagingItem) {
                        await adjustStock(Packaging, packagingItem.id, -packagingQuantity, { transaction, integer: true });

                        // Create outbound record for packaging
                        await Outbound.create({
                            date: new Date(),
                            soPrn: soNumber, // Use order SO number instead of production request number
                            batchNumber: 'N/A',
                            customer: 'Internal Production',
                            product: packagingItem.name,
                            item: packagingItem.name,
                            quantity: packagingQuantity,
                            type: 'Packaging',
                            reason: 'Production',
                            notes: `Used for production request ${prodreqnumber} for order SO#${soNumber}`,
                            packagingId: packagingItem.id
                        }, { transaction });
                    }
                }
            }
        } else {
            // Fallback to getting packaging from the order item if not in the form
            const orderItem = await OrderItem.findOne({
                where: { orderId, '$Product.name$': productName },
                include: [Product, Packaging],
                transaction
            });
            
            // If we found the order item with packaging, use that
            if (orderItem && orderItem.Packaging) {
                // Use a standard quantity of 1 per production unit
                const packagingQuantity = Math.ceil(productionQuantity);
                
                // Create production request packaging record
                await ProductionRequestPackaging.create({
                    productionRequestId: productionRequest.id,
                    packagingId: orderItem.Packaging.id,
                    quantity: packagingQuantity
                }, { transaction });
                
                // Subtract the quantity from the packaging stock (atomic, locked, never negative)
                const packagingItem = orderItem.Packaging;
                if (packagingItem) {
                    await adjustStock(Packaging, packagingItem.id, -packagingQuantity, { transaction, integer: true });

                    // Create outbound record for packaging
                    await Outbound.create({
                        date: new Date(),
                        soPrn: soNumber, // Use order SO number instead of production request number
                        batchNumber: 'N/A',
                        customer: 'Internal Production',
                        product: packagingItem.name,
                        item: packagingItem.name,
                        quantity: packagingQuantity,
                        type: 'Packaging',
                        reason: 'Production',
                        notes: `Used for production request ${prodreqnumber} for order SO#${soNumber}`,
                        packagingId: packagingItem.id
                    }, { transaction });
                }
            }
        }

        // Create raw material records and update stock
        for (const rawMaterialData of rawMaterialsData) {
            // Create the production request raw material record
            await ProductionRequestRawMaterial.create({
                productionRequestId: productionRequest.id,
                rawMaterialId: rawMaterialData.rawMaterialId,
                quantity: rawMaterialData.quantity
            }, { transaction });
            
            // Subtract the quantity from the raw material stock (atomic, locked, never negative)
            const rawMaterial = await RawMaterial.findByPk(rawMaterialData.rawMaterialId, { transaction });
            if (rawMaterial) {
                await adjustStock(RawMaterial, rawMaterial.id, -rawMaterialData.quantity, { transaction });

                // Create outbound record for raw material
                await Outbound.create({
                    date: new Date(),
                    soPrn: soNumber, // Use order SO number instead of production request number
                    batchNumber: 'N/A',
                    customer: 'Internal Production',
                    product: rawMaterial.name,
                    item: rawMaterial.name,
                    quantity: rawMaterialData.quantity,
                    type: 'Raw Material',
                    reason: 'Production',
                    notes: `Used for production request ${prodreqnumber} for order SO#${soNumber}`,
                    rawMaterialId: rawMaterial.id
                }, { transaction });
            }
        }

        // Check if all products in the order have production requests
        const orderWithItems = await Order.findByPk(orderId, {
            include: [{
                model: OrderItem,
                include: [Product]
            }]
        });

        // Get all production requests for this order
        const allProductRequests = await ProductionRequest.findAll({
            where: { orderId }
        });

        // Create a set of unique product names that have production requests
        const uniqueProductsInRequests = new Set(allProductRequests.map(pr => pr.product));
        
        // Check if each product in the order has a production request
        // We only update the order status if ALL products have requests
        const allProductsHaveRequests = orderWithItems.OrderItems.every(item => 
            uniqueProductsInRequests.has(item.Product.name)
        );

        // Only update order status if all products have requests
        if (allProductsHaveRequests) {
            await Order.update(
                { status: 'On Production' },
                { where: { id: orderId }, transaction }
            );
        } else {
            console.log(`Order ${orderId} status not updated to 'On Production' yet because not all products have production requests.`);
            console.log(`Products with requests: ${Array.from(uniqueProductsInRequests).join(', ')}`);
            console.log(`All products in order: ${orderWithItems.OrderItems.map(item => item.Product.name).join(', ')}`);
        }

        await transaction.commit();
        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error creating production request:', error);
        await transaction.rollback();
        res.status(500).send('Internal Server Error');
    }
};

exports.viewProductionRequest = async (req, res) => {
    try {
        const productionRequest = await ProductionRequest.findByPk(req.params.id, {
            include: [
                {
                    model: Order,
                    include: [
                        {
                            model: OrderItem,
                            include: [Product, Packaging]
                        },
                        { model: OrderConsumable }
                    ],
                    required: false  // Make the Order association optional
                },
                {
                    model: ProductionRequestPackaging,
                    include: [Packaging]
                }
            ]
        });

        const userRole = req.user.role;
        if (!productionRequest) {
            return res.status(404).send('Production Request not found');
        }

        const order = productionRequest.Order || null;

        let productPackagingMap = new Map();
        if (order) {
            // Aggregate packaging details by product
            order.OrderItems.forEach(item => {
                const productName = item.Product.name;

                if (!productPackagingMap.has(productName)) {
                    productPackagingMap.set(productName, []);
                }

                productPackagingMap.get(productName).push({
                    packaging: item.Packaging.name,
                    volume: item.Packaging.volume,
                    quantity: item.quantity,
                    unit: item.unit
                });
            });
        }

        res.render('production/productionRequest', {
            productionRequest,
            order,
            productPackagingMap,
            userRole,
            path: '/production/productionRequest'
        });
    } catch (error) {
        console.error('Error fetching production request details:', error);
        res.status(500).send('Internal Server Error');
    }
};


exports.clearProductionRequest = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { id } = req.params;
        const productionRequest = await ProductionRequest.findByPk(id, {
            include: [{
                model: ProductionRequestPackaging,
                include: [Packaging]
            }],
            transaction
        });

        if (!productionRequest) {
            await transaction.rollback();
            return res.status(404).send('Production request not found');
        }

        // Update the status of the production request to "Completed"
        productionRequest.status = 'Completed';
        await productionRequest.save({ transaction });

        // If there's no associated order, subtract packaging quantities from stock
        if (!productionRequest.orderId) {
            for (const prp of productionRequest.ProductionRequestPackagings) {
                const packaging = prp.Packaging;
                if (packaging) {
                    // Subtract the used quantity from packaging stock (atomic, locked, never negative)
                    await adjustStock(Packaging, packaging.id, -prp.quantity, { transaction, integer: true });
                }
            }
        }
        // If there is an associated order, update its status
        else {
            const order = await Order.findByPk(productionRequest.orderId, { transaction });
            if (order) {
                order.status = 'Production Completed';
                await order.save({ transaction });
            }
        }

        await transaction.commit();
        res.redirect('/dashboard/ppic');
    } catch (error) {
        await transaction.rollback();
        console.error('Error clearing production request:', error);
        res.status(500).send('Internal Server Error');
    }
};


exports.requestRework = async (req, res) => {
    try {
        const { complainItemId } = req.body;
        
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

        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error requesting rework:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.setRawMaterialChoice = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const { id } = req.params;
    const { choice } = req.body;

    try {
        const production = await Production.findByPk(id);
        if (!production) {
            if (wantsJson) return res.status(404).json({ success: false, message: 'Production not found' });
            return res.status(404).send('Production not found');
        }

        production.rawMaterialChoice = choice;
        await production.save();

        if (wantsJson) return res.json({ success: true });
        res.redirect('/dashboard/production');
    } catch (error) {
        console.error('Error setting raw material choice:', error);
        if (wantsJson) return res.status(500).json({ success: false, message: 'Internal Server Error' });
        res.status(500).send('Internal Server Error');
    }
};

exports.addRawMaterial = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const { id } = req.params;
    const { rawMaterialId, quantity } = req.body;
    const transaction = await sequelize.transaction();

    try {
        // Find the production
        const production = await Production.findByPk(id, {
            include: [{
                model: Product,
                include: [{
                    model: ProductFormula,
                    include: [RawMaterial]
                }]
            }]
        });

        if (!production) {
            await transaction.rollback();
            if (wantsJson) return res.status(404).json({ success: false, message: 'Production not found' });
            return res.status(404).send('Production not found');
        }

        // Find the raw material (locked to keep the check-and-deduct atomic)
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

        // Create production raw material record
        await ProductionRawMaterial.create({
            ProductionId: production.id,
            RawMaterialId: rawMaterialId,
            quantity: quantity
        }, { transaction });

        // Update raw material stock (atomic, locked, never negative)
        await adjustStock(RawMaterial, rawMaterialId, -quantity, { transaction });

        // Set flag that raw material has been added
        await production.update({
            rawMaterialAdded: true
        }, { transaction });

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

exports.getCompletedProductionRequests = async (req, res) => {
    try {
        // Fetch production requests with the status of 'Completed'
        const completedRequests = await ProductionRequest.findAll({
            where: { status: 'Completed' },
            include: [
                {
                    model: Production,
                    as: 'Productions',
                    attributes: ['status', 'quantity'],
                    include: [
                        {
                            model: Product, // Include the Product model to fetch product details
                            attributes: ['name'],
                        },
                    ],
                },
                {
                    model: Order,
                    attributes: ['id', 'customerName', 'createdAt']
                }
            ]
        });
        const userRole = req.user.role;
        // Render the history page with the fetched data
        res.render('ppic/productionRequestHistory', { 
            completedRequests, 
            userRole,
            path: '/production/productionRequest/history'
        });
    } catch (error) {
        console.error('Error fetching completed production requests:', error);
        res.status(500).send('Internal Server Error');
    }
};
