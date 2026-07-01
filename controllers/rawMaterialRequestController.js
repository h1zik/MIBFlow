const RawMaterialRequest = require('../models/rawMaterialRequest');
const RawMaterial = require('../models/rawMaterial');
const Vendor = require('../models/vendor');
const Inbound = require('../models/inbound');
const sequelize = require('../config/database');
const { Production, ProductionRawMaterial } = require('../models/production');
const Product = require('../models/product');
const ProductFormula = require('../models/productFormula');
const { Op } = require('sequelize');
const RawMaterialRequestVendor = require('../models/rawMaterialRequestVendor');
const PackagingRequestVendor = require('../models/packagingRequestVendor');
const PackagingRequest = require('../models/packagingRequest');
const Packaging = require('../models/packaging');
const ProductionRequest = require('../models/productionRequest');
const Order = require('../models/order');
const OrderItem = require('../models/orderItem');
const Outbound = require('../models/outbound'); // Added Outbound model
const User = require('../models/user'); // Add User model import
const { adjustStock, roundQty } = require('../utils/stock');

exports.getRawMaterialRequests = async (req, res) => {
    try {
        const requests = await RawMaterialRequest.findAll();
        res.status(200).render('dashboards/raw-material-warehouse', { 
            requests,
            userRole: req.user.role,
            path: '/dashboard/raw-material-warehouse'
        });
    } catch (error) {
        res.status(400).send(error);
    }
};

exports.requestRawMaterialForm = async (req, res) => {
    try {
        const rawmaterial = await RawMaterial.findAll(); // Fetch products from the database
        const userRole = req.user.role;
        res.render('production/requestRawMaterial', { 
            rawmaterial, 
            userRole,
            path: '/rawMaterial/requestRawMaterial'
        });
    } catch (error) {
        console.error('Error fetching raw material:', error);
        res.status(400).send(error);
    }
};

exports.requestRawMaterial = async (req, res) => {
    const { materialName, quantity, unit } = req.body;
    const orderId = req.body.orderId || null;
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);

    try {
        // Find the raw material by name
        const rawMaterial = await RawMaterial.findOne({ where: { name: materialName } });

        if (!rawMaterial) {
            return res.status(400).send('Raw material not found');
        }

        // Convert quantity to KG if unit is L and material is liquid
        let finalQuantity = parseFloat(quantity);
        if (unit === 'L' && rawMaterial.form === 'Liquid') {
            if (!rawMaterial.density) {
                return res.status(400).send('Cannot convert to KG: density not found for liquid material');
            }

            // Ensure density is correctly interpreted as kg/L
            finalQuantity = finalQuantity * rawMaterial.density; 

            console.log(`Converting ${quantity}L to KG using density ${rawMaterial.density}kg/L: ${quantity}L × ${rawMaterial.density}kg/L = ${finalQuantity}KG`);
        }

        // Validate the final quantity
        if (isNaN(finalQuantity) || finalQuantity <= 0) {
            return res.status(400).send('Invalid quantity value');
        }

        // Round to 2 decimal places
        finalQuantity = Math.round(finalQuantity * 100) / 100;

        // Guard against duplicate requests: if this order already has an active
        // (non-terminal) request for this material, don't create another one.
        if (orderId) {
            const existingRequest = await RawMaterialRequest.findOne({
                where: {
                    orderId,
                    rawMaterialId: rawMaterial.id,
                    status: { [Op.notIn]: ['Completed', 'Declined', 'Rejected'] }
                }
            });
            if (existingRequest) {
                if (wantsJson) return res.json({ success: true, skipped: true, message: 'A request for this material already exists for this order.' });
                return res.redirect('/dashboard/ppic');
            }
        }

        // Create the raw material request using the found rawMaterialId
        const newRequest = await RawMaterialRequest.create({
            materialName,
            quantity: finalQuantity,
            rawMaterialId: rawMaterial.id,
            orderId
        });

        // Send SSE notification for new raw material request
        req.app.locals.sendNotification({
            type: 'newRawMaterialRequest',
            materialName: materialName,
            quantity: finalQuantity,
            audio: 'purchase.mp3'
        });

        if (wantsJson) { return res.json({ success: true }); }
        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error requesting raw material:', error);
        if (wantsJson) return res.status(500).json({ success: false, message: 'Internal Server Error' });
        res.status(500).send('Internal Server Error');
    }
};

exports.getRawMaterialRequestsForPpic = async (req, res) => {
    console.log('getRawMaterialRequestsForPpic called');
    try {
        const rawMaterialRequests = await RawMaterialRequest.findAll({ include: Vendor });
        const vendors = await Vendor.findAll();
        console.log('rawMaterialRequests:', rawMaterialRequests);
        console.log('vendors:', vendors);
        res.render('dashboards/ppic', { 
            rawMaterialRequests, 
            vendors,
            userRole: req.user.role,
            path: '/dashboard/ppic'
        });
    } catch (error) {
        console.error('Error fetching raw material requests:', error);
        res.status(400).send(error);
    }
};

exports.assignVendor = async (req, res) => {
    const { id } = req.params;
    const { vendorId } = req.body;
    console.log('assignVendor called', id, vendorId);

    try {
        const request = await RawMaterialRequest.findByPk(id);
        if (!request) {
            console.log('Request not found');
            return res.status(404).send({ error: 'Request not found' });
        }

        request.vendorId = vendorId;
        request.status = 'Vendor Assigned';
        await request.save();
        console.log('Vendor assigned');
        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error assigning vendor:', error);
        res.status(400).send(error);
    }
};

exports.forwardRawMaterialRequestToFinance = async (req, res) => {
    const { id } = req.params;
    console.log('forwardRawMaterialRequestToFinance called', id);

    try {
        const request = await RawMaterialRequest.findByPk(id);
        if (!request) {
            console.log('Request not found');
            return res.status(404).json({ error: 'Request not found' });
        }

        request.status = 'Forwarded to Finance';
        await request.save();
        console.log('Request forwarded to finance');
        res.status(200).json({ success: true, message: 'Successfully forwarded to finance' });
    } catch (error) {
        console.error('Error forwarding request to finance:', error);
        res.status(400).json({ error: error.message });
    }
};

exports.getPaidRawMaterialRequests = async (req, res) => {
    try {
        // Parse date ranges and name filter from query parameters
        const parseDateRange = (rangeStr) => {
            if (!rangeStr) return null;
            const [start, end] = rangeStr.split(' to ');
            return { start, end };
        };

        // Get yesterday's date and today's date for default date range
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayFormatted = yesterday.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        
        const today = new Date();
        const todayFormatted = today.toISOString().split('T')[0]; // Format as YYYY-MM-DD

        const nameFilter = req.query.nameFilter;
        
        // Use provided date ranges or default to yesterday-to-today
        const inboundDateRange = parseDateRange(req.query.inboundDateRange) || 
            { start: yesterdayFormatted, end: todayFormatted };
        
        const inboundPackagingDateRange = parseDateRange(req.query.inboundPackagingDateRange) || 
            { start: yesterdayFormatted, end: todayFormatted };
        
        const outboundDateRange = parseDateRange(req.query.outboundDateRange) || 
            { start: yesterdayFormatted, end: todayFormatted };
        
        const outboundPackagingDateRange = parseDateRange(req.query.outboundPackagingDateRange) || 
            { start: yesterdayFormatted, end: todayFormatted };

        // Extract start and end dates
        const inboundStartDate = inboundDateRange.start;
        const inboundEndDate = inboundDateRange.end;
        const outboundStartDate = outboundDateRange.start;
        const outboundEndDate = outboundDateRange.end;
        const inboundPackagingStartDate = inboundPackagingDateRange.start;
        const inboundPackagingEndDate = inboundPackagingDateRange.end;
        const outboundPackagingStartDate = outboundPackagingDateRange.start;
        const outboundPackagingEndDate = outboundPackagingDateRange.end;

        // Check if it's an AJAX request
        const isAjax = req.headers.accept && req.headers.accept.includes('application/json');

        // Helper function to create date range where clause
        const createDateRangeWhereClause = (startDate, endDate) => ({
            [Op.gte]: new Date(startDate).setHours(0, 0, 0, 0),
            [Op.lte]: new Date(endDate).setHours(23, 59, 59, 999)
        });

        // If it's an AJAX request, return JSON data
        if (isAjax) {
            const response = {};

            // Get inbound raw materials
            if (inboundStartDate || inboundEndDate) {
                const inboundRawMaterialWhereClause = {
                    type: 'Raw Material',
                    date: createDateRangeWhereClause(inboundStartDate, inboundEndDate)
                };

                if (nameFilter) {
                    inboundRawMaterialWhereClause.item = {
                        [Op.like]: `%${nameFilter}%`
                    };
                }

                response.inboundRawMaterialRequests = await Inbound.findAll({
                    where: inboundRawMaterialWhereClause,
                    order: [['date', 'DESC']]
                });
            }

            // Get inbound packaging
            if (inboundPackagingStartDate || inboundPackagingEndDate) {
                const inboundPackagingWhereClause = {
                    type: 'Packaging',
                    date: createDateRangeWhereClause(inboundPackagingStartDate, inboundPackagingEndDate)
                };

                if (nameFilter) {
                    inboundPackagingWhereClause.item = {
                        [Op.like]: `%${nameFilter}%`
                    };
                }

                response.inboundPackagingRequests = await Inbound.findAll({
                    where: inboundPackagingWhereClause,
                    order: [['date', 'DESC']]
                });
            }

            // Get outbound raw materials
            if (outboundStartDate || outboundEndDate) {
                const outboundRawMaterialWhereClause = {
                    type: 'Raw Material',
                    date: createDateRangeWhereClause(outboundStartDate, outboundEndDate)
                };

                if (nameFilter) {
                    outboundRawMaterialWhereClause.item = {
                        [Op.like]: `%${nameFilter}%`
                    };
                }

                response.productions = await Outbound.findAll({
                    where: outboundRawMaterialWhereClause,
                    order: [['date', 'DESC']]
                });
            }

            // Get outbound packaging (including product packaging usage)
            if (outboundPackagingStartDate || outboundPackagingEndDate) {
                const outboundPackagingWhereClause = {
                    [Op.or]: [
                        { type: 'Packaging' },
                        {
                            type: 'Product',
                            packagingId: { [Op.not]: null }
                        }
                    ],
                    date: createDateRangeWhereClause(outboundPackagingStartDate, outboundPackagingEndDate)
                };

                if (nameFilter) {
                    outboundPackagingWhereClause.item = {
                        [Op.like]: `%${nameFilter}%`
                    };
                }

                response.outboundPackaging = await Outbound.findAll({
                    where: outboundPackagingWhereClause,
                    include: [
                        {
                            model: Packaging,
                            attributes: ['name'],
                            required: false
                        }
                    ],
                    order: [['date', 'DESC']]
                });
            }

            return res.json(response);
        }

        // Fetch RawMaterialRequestVendor entries that are in a pending state
        const pendingRawMaterialRequests = await RawMaterialRequestVendor.findAll({
            where: {
                status: {
                    [Op.notIn]: ['Completed', 'Quarantined']
                }
            },
            include: [
                {
                    model: RawMaterialRequest,
                    attributes: ['materialName', 'realQuantity', 'ponumber']
                },
                {
                    model: Vendor,
                    attributes: ['name']
                }
            ]
        });

        // Get packaging requests
        const pendingPackagingRequests = await PackagingRequestVendor.findAll({
            where: {
                status: {
                    [Op.notIn]: ['Completed', 'Quarantined']
                }
            },
            include: [
                {
                    model: PackagingRequest,
                    include: [{ model: Packaging }]
                },
                {
                    model: Vendor,
                    attributes: ['name']
                }
            ]
        });

        // Get inbound raw materials
        const inboundRawMaterialRequests = await Inbound.findAll({
            where: {
                type: 'Raw Material',
                date: createDateRangeWhereClause(inboundStartDate, inboundEndDate)
            },
            order: [['date', 'DESC']]
        });

        // Get inbound packaging
        const inboundPackagingRequests = await Inbound.findAll({
            where: {
                type: 'Packaging',
                date: createDateRangeWhereClause(inboundPackagingStartDate, inboundPackagingEndDate)
            },
            order: [['date', 'DESC']]
        });

        // Get outbound raw materials
        const productions = await Outbound.findAll({
            where: {
                type: 'Raw Material',
                date: createDateRangeWhereClause(outboundStartDate, outboundEndDate)
            },
            order: [['date', 'DESC']]
        });

        // Get outbound packaging (including product packaging usage)
        const outboundPackaging = await Outbound.findAll({
            where: {
                [Op.or]: [
                    { type: 'Packaging' },
                    {
                        type: 'Product',
                        packagingId: { [Op.not]: null }
                    }
                ],
                date: createDateRangeWhereClause(outboundPackagingStartDate, outboundPackagingEndDate)
            },
            include: [
                {
                    model: Packaging,
                    attributes: ['name'],
                    required: false
                }
            ],
            order: [['date', 'DESC']]
        });

        const userRole = req.user.role;
        const rawMaterials = await RawMaterial.findAll();
        const packagings = await Packaging.findAll();

        // Fetch users for chat feature
        const users = await User.findAll({
            attributes: ['id', 'username', 'role']
        });

        res.render('dashboards/raw-material-warehouse', {
            pendingRawMaterialRequests,
            inboundRawMaterialRequests,
            pendingPackagingRequests,
            inboundPackagingRequests,
            productions,
            rawMaterials,
            packagings,
            userRole,
            userId: req.user.id,
            users, // Add users data
            inboundStartDate,
            inboundEndDate,
            outboundStartDate,
            outboundEndDate,
            defaultStartDate: yesterdayFormatted,
            defaultEndDate: todayFormatted,
            path: '/dashboard/raw-material-warehouse',
            outboundPackaging
        });
    } catch (error) {
        console.error('Error fetching raw material requests:', error);
        res.status(400).send(error);
    }
};


exports.updateRawMaterialStock = async (req, res) => {
    const { id } = req.params;
    const { rejectQuantity, realQuantity } = req.body;

    const transaction = await sequelize.transaction();

    try {
        const requestVendor = await RawMaterialRequestVendor.findByPk(id, {
            include: [
                {
                    model: RawMaterialRequest,
                    attributes: ['materialName']
                },
                {
                    model: Vendor,
                    attributes: ['name']
                }
            ],
            transaction
        });

        if (!requestVendor) {
            await transaction.rollback();
            return res.status(404).send({ error: 'Request vendor not found' });
        }

        const rawMaterial = await RawMaterial.findOne({
            where: { name: requestVendor.RawMaterialRequest.materialName },
            transaction
        });

        if (!rawMaterial) {
            await transaction.rollback();
            return res.status(404).send({ error: 'Raw material not found' });
        }

        const parsedRejectQty = parseFloat(rejectQuantity);
        const parsedRealQty = parseFloat(realQuantity);

        // Tentukan berapa banyak yang benar-benar masuk stok (stockDelta).
        let stockDelta = 0;

        if (requestVendor.qcStatus === 'Pass') {
            if (requestVendor.rejectQuantity > 0) {
                stockDelta = requestVendor.rejectQuantity;
                requestVendor.splitQuantity += requestVendor.rejectQuantity;
                requestVendor.rejectQuantity = 0;
            } else if (realQuantity) {
                stockDelta = parsedRealQty;
                requestVendor.splitQuantity = parsedRealQty;
            } else {
                stockDelta = requestVendor.splitQuantity;
            }
        } else if (requestVendor.qcStatus === 'Reject Sebagian') {
            if (!rejectQuantity) {
                await transaction.rollback();
                return res.status(400).send({ error: 'Reject quantity is required for partially rejected items' });
            }

            if (requestVendor.rejectQuantity > 0) {
                // Penyesuaian rejection kedua atau lebih.
                const amountToAddBack = requestVendor.rejectQuantity - parsedRejectQty;
                stockDelta = amountToAddBack;
                requestVendor.splitQuantity += amountToAddBack;
                requestVendor.rejectQuantity = parsedRejectQty;
            } else {
                // Rejection pertama: hanya bagian yang lolos masuk stok.
                const nonRejectedQty = requestVendor.splitQuantity - parsedRejectQty;
                stockDelta = nonRejectedQty;
                requestVendor.rejectQuantity = parsedRejectQty;
                requestVendor.splitQuantity -= parsedRejectQty;
            }
        } else if (requestVendor.status === 'No Return') {
            stockDelta = requestVendor.splitQuantity;
        }

        // Update stok secara atomic dengan lock (lewat helper terpusat).
        if (stockDelta !== 0) {
            await adjustStock(RawMaterial, rawMaterial.id, stockDelta, { transaction });
        }

        requestVendor.status = 'Completed';
        await requestVendor.save({ transaction });

        // Create inbound record — kuantitas = jumlah yang benar-benar masuk stok.
        await Inbound.create({
            date: new Date(),
            poSoNumber: requestVendor.ponumber || 'N/A',
            batchNumber: requestVendor.batchNumber || 'N/A',
            item: requestVendor.RawMaterialRequest.materialName,
            vendor: requestVendor.Vendor?.name || 'Unknown',
            quantity: roundQty(stockDelta),
            expiredDate: requestVendor.expiredDate,
            type: 'Raw Material',
            reason: requestVendor.qcStatus === 'Pass' ? 'Lolos QC' : 'Tolak Beberapa',
            notes: `QC Status: ${requestVendor.qcStatus}`
        }, { transaction });

        await transaction.commit();

        // Send notification if status is Fail
        if (requestVendor.qcStatus === 'Reject Sebagian') {
            const rawMaterialRequest = await RawMaterialRequest.findByPk(requestVendor.rawMaterialRequestId);
            if (rawMaterialRequest) {
                req.app.locals.sendNotification({
                    type: 'qcRejectSebagianRawMaterial',
                    materialName: rawMaterialRequest.materialName,
                    status: requestVendor.qcStatus,
                    audio: 'purchase.mp3'
                });
            }
        }

        res.json({ success: true, status: 'Completed' });
    } catch (error) {
        await transaction.rollback();
        console.error('Error updating raw material stock:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.testToQC = async (req, res) => {
    const { id } = req.params;

    try {
        const rawMaterialRequestVendor = await RawMaterialRequestVendor.findByPk(id, {
            include: [RawMaterialRequest]
        });
        
        if (!rawMaterialRequestVendor) {
            return res.status(404).send({ error: 'Raw Material Request Vendor not found' });
        }

        // Update the QC status to 'Pending' and status to 'QC Testing'
        rawMaterialRequestVendor.qcStatus = 'Pending';
        rawMaterialRequestVendor.status = 'QC Testing';
        await rawMaterialRequestVendor.save();

        // Send notification to QC
        req.app.locals.sendNotification({
            type: 'newQCRequest',
            materialName: rawMaterialRequestVendor.RawMaterialRequest.materialName,
            source: 'Raw Material',
            status: 'Pending',
            audio: 'qc.mp3'
        });

        res.json({ success: true, status: 'QC Testing' });
    } catch (error) {
        console.error('Error updating QC status:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};



exports.receivedFailedMaterial = async (req, res) => {
    const { id } = req.params;

    try {
        const rawMaterialRequestVendor = await RawMaterialRequestVendor.findByPk(id);

        if (!rawMaterialRequestVendor) {
            return res.status(404).send({ error: 'Raw Material Request Vendor not found' });
        }

        rawMaterialRequestVendor.status = 'Quarantined';
        await rawMaterialRequestVendor.save();

        res.json({ success: true, status: 'Quarantined' });
    } catch (error) {
        console.error('Error marking as quarantined:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

exports.markAsReceived = async (req, res) => {
    const { id } = req.params;

    try {
        const rawMaterialRequestVendor = await RawMaterialRequestVendor.findByPk(id);

        if (!rawMaterialRequestVendor) {
            return res.status(404).send({ error: 'Raw Material Request Vendor not found' });
        }

        rawMaterialRequestVendor.status = 'Received';
        await rawMaterialRequestVendor.save();

        res.json({ success: true, status: 'Received' });
    } catch (error) {
        console.error('Error marking as received:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};


exports.getCompletedRawMaterialRequests = async (req, res) => {
    try {
        // Fetch all completed raw material requests
        const completedRawMaterialRequests = await RawMaterialRequest.findAll({
            where: { status: 'Completed' },
            include: [Vendor] // Include vendor details if needed
        });

        const userRole = req.user.role;

        res.status(200).render('products/completedRequests', { 
            completedRawMaterialRequests, 
            userRole,
            path: '/rawMaterial/completed'
        });
    } catch (error) {
        res.status(400).send(error);
    }
};

exports.createRawMaterialRequest = async (req, res) => {
    const { orderId, materialName, quantity } = req.body;

    const transaction = await sequelize.transaction();

    try {
        // Find the raw material by name (lock so concurrent requests can't double-allocate stock)
        const rawMaterial = await RawMaterial.findOne({
            where: { name: materialName },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!rawMaterial) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: 'Raw material not found.' });
        }

        const neededQuantity = parseFloat(quantity);
        if (!Number.isFinite(neededQuantity) || neededQuantity <= 0) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: 'Invalid quantity.' });
        }

        const currentStock = Number(rawMaterial.stock) || 0;

        // Use only as much existing stock as we actually need; keep the rest intact.
        const usedFromStock = Math.min(currentStock, neededQuantity);
        const requestQuantity = roundQty(neededQuantity - usedFromStock);

        if (usedFromStock > 0) {
            await adjustStock(RawMaterial, rawMaterial.id, -usedFromStock, { transaction });
        }

        // Only create a request if we still need additional material
        if (requestQuantity > 0) {
            await RawMaterialRequest.create({
                materialName,
                quantity: requestQuantity, // Request only what we need after using stock
                orderId,
                rawMaterialId: rawMaterial.id,
            }, { transaction });
        }

        await transaction.commit();

        // Send SSE notification for new raw material request
        req.app.locals.sendNotification({
            type: 'newIndividualRawMaterialRequest',
            materialName: materialName,
            quantity: requestQuantity,
            audio: 'purchase.mp3'
        });

        res.status(200).json({ success: true, message: 'Raw material request processed successfully!' });
    } catch (error) {
        await transaction.rollback();
        console.error('Error creating raw material request:', error);
        res.status(500).json({ success: false, message: 'Failed to create raw material request.' });
    }
};

exports.createAutoRawMaterialRequest = async (req, res) => {
    const { productId, quantity } = req.body;

    try {
        const product = await Product.findByPk(productId);
        if (!product) {
            return res.status(404).send('Product not found');
        }

        const productFormulas = await ProductFormula.findAll({
            where: { productId: product.id },
            include: [RawMaterial]
        });

        const rawMaterialsToRequest = [];

        for (const formula of productFormulas) {
            const rawMaterial = await RawMaterial.findByPk(formula.rawMaterialId);
            const rawMaterialQuantityNeeded = (formula.percentage / 100) * quantity;

            // Only request if we need more than what's in stock
            if (rawMaterialQuantityNeeded > rawMaterial.stock) {
                // Calculate the quantity to request (what we need minus what's in stock)
                const quantityToRequest = rawMaterialQuantityNeeded - rawMaterial.stock;
                
                // Always round up the request quantity to ensure we have enough materials
                // Using Math.ceil to round up to the next whole number
                const roundedQuantityToRequest = Math.ceil(quantityToRequest * 100) / 100;
                
                // Make sure we're actually rounding up even with floating point precision issues
                const finalRequestQuantity = Math.ceil(roundedQuantityToRequest);
                
                console.log(`Raw Material: ${rawMaterial.name}`);
                console.log(`  Needed: ${rawMaterialQuantityNeeded.toFixed(2)} Kg`);
                console.log(`  Stock: ${rawMaterial.stock} Kg`);
                console.log(`  To Request (before rounding): ${quantityToRequest.toFixed(2)} Kg`);
                console.log(`  To Request (after rounding): ${finalRequestQuantity} Kg`);
                
                rawMaterialsToRequest.push({
                    rawMaterialId: rawMaterial.id,
                    materialName: rawMaterial.name,
                    quantity: finalRequestQuantity,
                    originalRequestQuantity: quantityToRequest.toFixed(2) // Store original request quantity for display
                });
            }
        }

        // Only create requests for materials that need more than current stock
        for (const material of rawMaterialsToRequest) {
            await RawMaterialRequest.create({
                rawMaterialId: material.rawMaterialId,
                materialName: material.materialName,
                quantity: material.quantity,
            });
        }

        res.status(200).json({ 
            message: 'Raw Material Request created successfully',
            materials: rawMaterialsToRequest
        });
    } catch (error) {
        console.error('Error creating raw material request:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.markRequestAsCompleted = async (req, res) => {
    const { id } = req.params;
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);

    try {
        // Find the raw material request and include its vendors
        const request = await RawMaterialRequest.findByPk(id, {
            include: [RawMaterialRequestVendor]
        });

        if (!request) {
            if (wantsJson) return res.status(404).json({ success: false, error: 'Raw material request not found' });
            return res.status(404).send({ error: 'Raw material request not found' });
        }

        // Check if all vendors are either Completed or Quarantined
        const allVendorsCompleted = request.RawMaterialRequestVendors.every(vendor =>
            vendor.status === 'Completed' || vendor.status === 'Quarantined'
        );

        if (!allVendorsCompleted) {
            if (wantsJson) return res.status(400).json({ success: false, error: 'Cannot mark as completed. Some vendors are still pending.' });
            return res.status(400).send({
                error: 'Cannot mark as completed. Some vendors are still pending.'
            });
        }

        // Update the request status to Completed
        request.status = 'Completed';
        await request.save();

        if (wantsJson) { return res.json({ success: true }); }
        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error marking request as completed:', error);
        res.status(500).send('Internal Server Error');
    }
};

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Cari nomor urut berikutnya untuk bulan ini. Dibaca di dalam transaksi dengan
// lock agar dua submit konkuren tidak menghasilkan nomor yang sama.
const getNextPoNumber = async (Model, transaction) => {
    const currentMonth = new Date().getMonth() + 1;
    const last = await Model.findOne({
        where: sequelize.where(
            sequelize.fn('MONTH', sequelize.col('createdAt')),
            currentMonth
        ),
        order: [['createdAt', 'DESC']],
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });

    if (last && last.ponumber) {
        return parseInt(last.ponumber.split('/')[0], 10) + 1;
    }
    return 1;
};

const formatPoNumber = (orderNumber) => {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const romanMonth = ROMAN_MONTHS[currentMonth - 1];
    return `${orderNumber.toString().padStart(3, '0')}/PO/MIB/${romanMonth}/${currentYear}`;
};

const generatePoNumber = async (transaction) => {
    const orderNumber = await getNextPoNumber(RawMaterialRequest, transaction);
    return formatPoNumber(orderNumber);
};

exports.markRawMaterialPaid = async (req, res) => {
    const { id } = req.params;

    try {
        const requestVendor = await RawMaterialRequestVendor.findByPk(id, {
            include: [RawMaterialRequest]
        });

        if (!requestVendor) {
            return res.status(404).send('Raw Material Request Vendor not found');
        }

        // Update the isPaid status on the RawMaterialRequest
        await requestVendor.RawMaterialRequest.update({ isPaid: true });

        res.redirect('/finance/rawMaterialRequestHistory');
    } catch (error) {
        console.error('Error marking raw material as paid:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.updatePoNumber = async (req, res) => {
    const { id } = req.params;
    const { ponumber } = req.body;

    try {
        const requestVendor = await RawMaterialRequestVendor.findByPk(id);
        if (!requestVendor) {
            return res.status(404).send({ error: 'Raw Material Request Vendor not found' });
        }

        requestVendor.ponumber = ponumber;
        await requestVendor.save();

        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error updating PO number:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.submitSplitQuantities = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const transaction = await sequelize.transaction();
    try {
        const { vendorIds, splitQuantities, taxes, paymentTypes } = req.body;
        const requestId = req.params.id;

        // Validate that the total split quantities equal the real quantity
        const realQuantity = await RawMaterialRequest.findOne({
            where: { id: requestId },
            attributes: ['realQuantity'],
            transaction
        });

        const totalSplitQuantity = splitQuantities.reduce((acc, qty) => acc + parseInt(qty, 10), 0);
        if (totalSplitQuantity !== realQuantity.realQuantity) {
            await transaction.rollback();
            if (wantsJson) {
                return res.status(400).json({
                    success: false,
                    message: 'Total split quantities must equal the real quantity.'
                });
            }
            return res.status(400).send('Total split quantities must equal the real quantity.');
        }

        // Generate PO number for the main request (serial, locked)
        const poNumber = await generatePoNumber(transaction);
        await RawMaterialRequest.update(
            { ponumber: poNumber },
            { where: { id: requestId }, transaction }
        );

        // Clear existing splits
        await RawMaterialRequestVendor.destroy({ where: { rawMaterialRequestId: requestId }, transaction });

        // Hitung nomor vendor sekali (locked) lalu increment lokal supaya unik per submit.
        let vendorPoSeq = await getNextPoNumber(RawMaterialRequestVendor, transaction);

        // Create new splits with individual PO numbers
        for (let i = 0; i < vendorIds.length; i++) {
            const vendorPoNumber = formatPoNumber(vendorPoSeq++);
            await RawMaterialRequestVendor.create({
                rawMaterialRequestId: requestId,
                vendorId: vendorIds[i],
                splitQuantity: splitQuantities[i],
                tax: taxes[i],
                paymentType: paymentTypes[i],
                ponumber: vendorPoNumber
            }, { transaction });
        }

        // Update the status to "Vendor Assigned"
        await RawMaterialRequest.update({ status: 'Vendor Assigned' }, { where: { id: requestId }, transaction });

        await transaction.commit();

        // Send SSE notification for finance
        const rawMaterialRequest = await RawMaterialRequest.findByPk(requestId);
        req.app.locals.sendNotification({
            type: 'newFinanceRawMaterial',
            materialName: rawMaterialRequest.materialName,
            quantity: rawMaterialRequest.realQuantity,
            audio: 'finance.mp3'
        });

        if (wantsJson) {
            return res.json({ success: true, status: 'Vendor Assigned', message: 'Vendor splits submitted successfully.' });
        }
        res.redirect('/dashboard/purchase');
    } catch (error) {
        await transaction.rollback();
        console.error('Error submitting split quantities:', error);
        if (wantsJson) {
            return res.status(500).json({
                success: false,
                message: 'Error submitting vendor splits'
            });
        }
        res.status(500).send('Internal Server Error');
    }
};
