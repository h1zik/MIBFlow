const PackagingRequest = require('../models/packagingRequest');
const PackagingRequestVendor = require('../models/packagingRequestVendor');
const Packaging = require('../models/packaging');
const Vendor = require('../models/vendor');
const Order = require('../models/order');
const Inbound = require('../models/inbound');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { adjustStock, roundQty } = require('../utils/stock');

exports.getPackagingRequests = async (req, res) => {
    try {
        const { inboundStartDate, inboundEndDate } = req.query;

        const today = new Date();
        const defaultInboundStartDate = new Date(today);
        defaultInboundStartDate.setDate(today.getDate() - 7); // 7 days ago
        const defaultInboundEndDate = today.toISOString().split('T')[0];

        // Where clause for filtering PackagingRequestVendor with statuses that are not 'Completed' or 'Quarantined'
        const pendingPackagingWhereClause = {
            status: {
                [Op.notIn]: ['Completed', 'Quarantined']
            }
        };

        // Fetch PackagingRequestVendor entries that are in a pending state
        const pendingPackagingRequests = await PackagingRequestVendor.findAll({
            where: pendingPackagingWhereClause,
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

        // Set the start and end times to the beginning and end of the day for inbound date filtering
        const inboundPackagingWhereClause = {
            status: 'Completed',
            updatedAt: {}
        };

        if (inboundStartDate) {
            const inboundStart = new Date(inboundStartDate);
            inboundStart.setHours(0, 0, 0, 0); // Set to start of the day
            inboundPackagingWhereClause.updatedAt[Op.gte] = inboundStart;
        } else {
            const defaultInboundStart = new Date(defaultInboundStartDate);
            defaultInboundStart.setHours(0, 0, 0, 0); // Set to start of the day
            inboundPackagingWhereClause.updatedAt[Op.gte] = defaultInboundStart;
        }

        if (inboundEndDate) {
            const inboundEnd = new Date(inboundEndDate);
            inboundEnd.setHours(23, 59, 59, 999); // Set to end of the day
            inboundPackagingWhereClause.updatedAt[Op.lte] = inboundEnd;
        } else {
            const defaultInboundEnd = new Date(today);
            defaultInboundEnd.setHours(23, 59, 59, 999); // Set to end of the day
            inboundPackagingWhereClause.updatedAt[Op.lte] = defaultInboundEnd;
        }

        const inboundPackagingRequests = await PackagingRequestVendor.findAll({
            where: inboundPackagingWhereClause,
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

        const userRole = req.user.role;
        const packagings = await Packaging.findAll();

        res.render('dashboards/raw-material-warehouse', {
            pendingPackagingRequests,
            inboundPackagingRequests,
            packagings,
            userRole,
            inboundStartDate,
            inboundEndDate,
            defaultInboundStartDate: defaultInboundStartDate.toISOString().split('T')[0],
            defaultInboundEndDate,
            path: '/dashboard/raw-material-warehouse'
        });
    } catch (error) {
        console.error('Error fetching packaging requests:', error);
        res.status(400).send(error);
    }
};

exports.requestPackagingForm = async (req, res) => {
    try {
        const packagings = await Packaging.findAll();
        const userRole = req.user.role;
        res.render('production/requestPackaging', { 
            packagings, 
            userRole,
            path: '/packaging/requestPackaging'
        });
    } catch (error) {
        console.error('Error fetching packagings:', error);
        res.status(400).send(error);
    }
};

exports.requestPackaging = async (req, res) => {
    const { packagingId, quantity } = req.body;
    const orderId = req.body.orderId || null;

    try {
        const packaging = await Packaging.findByPk(packagingId);

        if (!packaging) {
            return res.status(400).send('Packaging not found');
        }

        const newRequest = await PackagingRequest.create({
            packagingName: packaging.name,
            quantity,
            packagingId: packaging.id,
            orderId
        });

        // Send SSE notification for new packaging request
        req.app.locals.sendNotification({
            type: 'newIndividualPackagingRequest',
            packagingName: packaging.name,
            quantity: quantity,
            audio: 'purchase.mp3'
        });

        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error requesting packaging:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.getPackagingRequestsForPpic = async (req, res) => {
    try {
        const packagingRequests = await PackagingRequest.findAll({
            where: {
                status: {
                    [Op.notIn]: ['Completed']
                }
            },
            include: [
                { model: Order },
                { model: Packaging }
            ]
        });
        
        res.render('dashboards/ppic', { 
            packagingRequests,
            userRole: req.user.role,
            path: '/dashboard/ppic'
        });
    } catch (error) {
        console.error('Error fetching packaging requests:', error);
        res.status(400).send(error);
    }
};

exports.viewPackagingRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const request = await PackagingRequest.findByPk(id, {
            include: [
                { model: Order },
                { model: Packaging }
            ]
        });

        if (!request) {
            return res.status(404).send('Packaging request not found');
        }

        res.render('packaging/viewRequest', {
            request,
            userRole: req.user.role,
            path: '/packaging/view'
        });
    } catch (error) {
        console.error('Error viewing packaging request:', error);
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

const formatPoNumber = (orderNumber, infix) => {
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const romanMonth = ROMAN_MONTHS[currentMonth - 1];
    return `${orderNumber.toString().padStart(3, '0')}/${infix}/MIB/${romanMonth}/${currentYear}`;
};

const generatePackagingPoNumber = async (transaction) => {
    const orderNumber = await getNextPoNumber(PackagingRequest, transaction);
    return formatPoNumber(orderNumber, 'POPK');
};

exports.submitSplitQuantities = async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);
    const transaction = await sequelize.transaction();
    try {
        const { vendorIds, splitQuantities, taxes, paymentTypes } = req.body;
        const requestId = req.params.id;

        // Validate that the total split quantities equal the real quantity
        const request = await PackagingRequest.findOne({
            where: { id: requestId },
            include: [{ model: Packaging }],
            transaction
        });

        const totalSplitQuantity = splitQuantities.reduce((acc, qty) => acc + parseInt(qty, 10), 0);
        if (totalSplitQuantity !== request.realQuantity) {
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
        const poNumber = await generatePackagingPoNumber(transaction);
        await PackagingRequest.update(
            { ponumber: poNumber },
            { where: { id: requestId }, transaction }
        );

        // Clear existing splits
        await PackagingRequestVendor.destroy({ where: { packagingRequestId: requestId }, transaction });

        // Hitung nomor vendor sekali (locked) lalu increment lokal supaya unik per submit.
        let vendorPoSeq = await getNextPoNumber(PackagingRequestVendor, transaction);

        // Create PackagingRequestVendor records for each split
        for (let i = 0; i < vendorIds.length; i++) {
            let paymentDueDate = null;
            if (paymentTypes[i].startsWith('TOP')) {
                const days = parseInt(paymentTypes[i].replace('TOP', ''));
                paymentDueDate = new Date();
                paymentDueDate.setDate(paymentDueDate.getDate() + days);
            }

            const vendorPoNumber = formatPoNumber(vendorPoSeq++, 'PO');
            await PackagingRequestVendor.create({
                packagingRequestId: requestId,
                vendorId: vendorIds[i],
                splitQuantity: splitQuantities[i],
                tax: taxes[i],
                paymentType: paymentTypes[i],
                paymentDueDate,
                ponumber: vendorPoNumber,
                status: 'Pending'
            }, { transaction });
        }

        // Update original request status
        await PackagingRequest.update(
            { status: 'Vendor Assigned' },
            { where: { id: requestId }, transaction }
        );

        await transaction.commit();

        // Send SSE notification for finance
        const packagingRequest = await PackagingRequest.findByPk(requestId);
        req.app.locals.sendNotification({
            type: 'newFinancePackaging',
            packagingName: packagingRequest.packagingName,
            quantity: packagingRequest.realQuantity,
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

exports.updatePackagingStock = async (req, res) => {
    const { id } = req.params;
    const { rejectQuantity, realQuantity } = req.body;

    const transaction = await sequelize.transaction();

    try {
        const requestVendor = await PackagingRequestVendor.findByPk(id, {
            include: [
                {
                    model: PackagingRequest,
                    include: [{ model: Packaging }]
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

        const packaging = await Packaging.findByPk(requestVendor.PackagingRequest.packagingId, { transaction });
        if (!packaging) {
            await transaction.rollback();
            return res.status(404).send({ error: 'Packaging not found' });
        }

        const parsedRejectQty = parseInt(rejectQuantity);

        // Tentukan berapa banyak unit yang benar-benar masuk stok (stockDelta).
        let stockDelta = 0;

        if (requestVendor.qcStatus === 'Pass') {
            if (requestVendor.rejectQuantity > 0) {
                stockDelta = requestVendor.rejectQuantity;
                requestVendor.splitQuantity += requestVendor.rejectQuantity;
                requestVendor.rejectQuantity = 0;
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

        // Update stok packaging (integer unit) secara atomic dengan lock.
        if (stockDelta !== 0) {
            await adjustStock(Packaging, packaging.id, stockDelta, { transaction, integer: true });
        }

        requestVendor.status = 'Completed';
        await requestVendor.save({ transaction });

        // Create inbound record — kuantitas = jumlah unit yang benar-benar masuk stok.
        await Inbound.create({
            date: new Date(),
            poSoNumber: requestVendor.ponumber || 'N/A',
            batchNumber: 'N/A',
            item: requestVendor.PackagingRequest.packagingName,
            vendor: requestVendor.Vendor?.name || 'Unknown',
            quantity: Math.round(stockDelta),
            expiredDate: requestVendor.expiredDate,
            type: 'Packaging',
            reason: requestVendor.qcStatus === 'Pass' ? 'Lolos QC' : 'Tolak Beberapa',
            notes: `QC Status: ${requestVendor.qcStatus}`
        }, { transaction });

        await transaction.commit();
        res.json({ success: true, status: 'Completed' });
    } catch (error) {
        await transaction.rollback();
        console.error('Error updating packaging stock:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.testToQC = async (req, res) => {
    const { id } = req.params;

    try {
        const requestVendor = await PackagingRequestVendor.findByPk(id, {
            include: [
                {
                    model: PackagingRequest,
                    include: [{ model: Packaging }]
                }
            ]
        });
        
        if (!requestVendor) {
            return res.status(404).send({ error: 'Packaging Request Vendor not found' });
        }

        requestVendor.qcStatus = 'Pending';
        requestVendor.status = 'QC Testing';
        await requestVendor.save();

        // Send notification to QC
        req.app.locals.sendNotification({
            type: 'newQCRequest',
            packagingName: requestVendor.PackagingRequest.packagingName,
            source: 'Packaging',
            status: 'Pending',
            audio: 'qc.mp3'
        });

        res.json({ success: true, status: 'QC Testing' });
    } catch (error) {
        console.error('Error updating QC status:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

exports.markAsReceived = async (req, res) => {
    const { id } = req.params;

    try {
        const requestVendor = await PackagingRequestVendor.findByPk(id);
        if (!requestVendor) {
            return res.status(404).send({ error: 'Packaging Request Vendor not found' });
        }

        requestVendor.status = 'Received';
        await requestVendor.save();

        res.json({ success: true, status: 'Received' });
    } catch (error) {
        console.error('Error marking as received:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

exports.setRealQuantity = async (req, res) => {
    const { id } = req.params;
    const { realQuantity } = req.body;

    try {
        const request = await PackagingRequest.findByPk(id);
        if (!request) {
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Request not found'
                });
            }
            return res.status(404).send({ error: 'Request not found' });
        }

        request.realQuantity = realQuantity;
        await request.save();

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({
                success: true,
                message: 'Real quantity updated successfully'
            });
        }
        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error setting real quantity:', error);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({
                success: false,
                message: 'Error setting real quantity'
            });
        }
        res.status(500).send('Internal Server Error');
    }
};

    exports.forwardToFinance = async (req, res) => {
        const { id } = req.params;

        try {
            // Find the PackagingRequestVendor and its associated PackagingRequest
            const requestVendor = await PackagingRequestVendor.findByPk(id);
            if (!requestVendor) {
                if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                    return res.status(404).json({
                        success: false,
                        message: 'Request vendor not found'
                    });
                }
                return res.status(404).send('Request vendor not found');
            }

            // Find the parent PackagingRequest
            const packagingRequest = await PackagingRequest.findByPk(requestVendor.packagingRequestId);
            if (!packagingRequest) {
                if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                    return res.status(404).json({
                        success: false,
                        message: 'Parent request not found'
                    });
                }
                return res.status(404).send('Parent request not found');
            }

            // Start a transaction
            const transaction = await sequelize.transaction();

            try {
                // Update both the vendor request and parent request status
                await Promise.all([
                    requestVendor.update(
                        { status: 'Pending' },
                        { transaction }
                    ),
                    packagingRequest.update(
                        { status: 'Forwarded to Finance' },
                        { transaction }
                    )
                ]);

                await transaction.commit();

                if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                    return res.json({
                        success: true,
                        message: 'Successfully forwarded to finance'
                    });
                }
                return res.redirect('/dashboard/purchase');
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } catch (error) {
            console.error('Error forwarding to finance:', error);
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(500).json({
                    success: false,
                    message: 'Error forwarding to finance'
                });
            }
            res.status(500).send('Internal Server Error');
        }
    };

exports.returnPackagingVendor = async (req, res) => {
    const { id } = req.params;

    try {
        const requestVendor = await PackagingRequestVendor.findByPk(id, {
            include: [{
                model: PackagingRequest,
                include: [{ model: Packaging }]
            }]
        });
        if (!requestVendor) {
            return res.status(404).send({ error: 'Packaging Request Vendor not found' });
        }

        requestVendor.status = 'Returned';
        await requestVendor.save();

        req.app.locals.sendNotification({
            type: 'returnPackaging',
            packagingName: requestVendor.PackagingRequest.Packaging.name,
            status: 'Returned',
            quantity: requestVendor.rejectQuantity,
            audio: 'raw.mp3'
        });

        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error returning packaging:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.noReturnPackagingVendor = async (req, res) => {
    const { id } = req.params;

    try {
        const requestVendor = await PackagingRequestVendor.findByPk(id, {
            include: [{
                model: PackagingRequest,
                include: [{ model: Packaging }]
            }]
        });
        if (!requestVendor) {
            return res.status(404).send({ error: 'Packaging Request Vendor not found' });
        }

        requestVendor.status = 'No Return';
        await requestVendor.save();

        req.app.locals.sendNotification({
            type: 'noReturnPackaging',
            packagingName: requestVendor.PackagingRequest.Packaging.name,
            status: 'No Return',
            quantity: requestVendor.rejectQuantity,
            audio: 'raw.mp3'
        });

        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error marking packaging as no return:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.receivedFailedPackaging = async (req, res) => {
    const { id } = req.params;

    try {
        const requestVendor = await PackagingRequestVendor.findByPk(id);
        if (!requestVendor) {
            return res.status(404).send({ error: 'Packaging Request Vendor not found' });
        }

        requestVendor.status = 'Quarantined';
        await requestVendor.save();

        res.json({ success: true, status: 'Quarantined' });
    } catch (error) {
        console.error('Error marking packaging as quarantined:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

exports.updatePoNumber = async (req, res) => {
    const { id } = req.params;
    const { ponumber } = req.body;

    try {
        const requestVendor = await PackagingRequestVendor.findByPk(id);
        if (!requestVendor) {
            return res.status(404).send({ error: 'Packaging Request Vendor not found' });
        }

        requestVendor.ponumber = ponumber;
        await requestVendor.save();

        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error updating PO number:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.completePackagingRequest = async (req, res) => {
    const { id } = req.params;
    const wantsJson = req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1);

    try {
        const request = await PackagingRequest.findByPk(id);
        if (!request) {
            if (wantsJson) return res.status(404).json({ success: false, message: 'Packaging request not found' });
            return res.status(404).send('Packaging request not found');
        }

        request.status = 'Completed';
        await request.save();

        if (wantsJson) { return res.json({ success: true }); }
        res.redirect('/dashboard/ppic');
    } catch (error) {
        console.error('Error completing packaging request:', error);
        if (wantsJson) return res.status(500).json({ success: false, message: 'Internal Server Error' });
        res.status(500).send('Internal Server Error');
    }
};

exports.createPackagingRequest = async (req, res) => {
    const { orderId, packagingName, quantity } = req.body;

    try {
        const packaging = await Packaging.findOne({ where: { name: packagingName } });

        if (!packaging) {
            return res.status(404).json({ success: false, message: 'Packaging not found.' });
        }

        const requestQuantity = parseInt(quantity);
        if (requestQuantity <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid quantity requested.' });
        }

        // Guard against duplicate requests: if this order already has an active
        // (non-terminal) request for this packaging, don't create another one.
        if (orderId) {
            const existingRequest = await PackagingRequest.findOne({
                where: {
                    orderId,
                    packagingId: packaging.id,
                    status: { [Op.notIn]: ['Completed', 'Declined', 'Rejected'] }
                }
            });
            if (existingRequest) {
                return res.status(200).json({ success: true, skipped: true, message: 'A packaging request already exists for this order.' });
            }
        }

        const packagingRequest = await PackagingRequest.create({
            packagingName,
            quantity: requestQuantity,
            orderId,
            packagingId: packaging.id,
        });

        // Send SSE notification for new packaging request
        req.app.locals.sendNotification({
            type: 'newPackagingRequest',
            packagingName: packagingName,
            quantity: requestQuantity,
            audio: 'purchase.mp3'
        });

        res.status(200).json({ success: true, message: 'Packaging request created successfully!' });
    } catch (error) {
        console.error('Error handling packaging request:', error);
        res.status(500).json({ success: false, message: 'Failed to handle packaging request.' });
    }
};

exports.getPackagingRequestHistory = async (req, res) => {
    try {
        const packagingRequests = await PackagingRequestVendor.findAll({
            include: [
                {
                    model: PackagingRequest,
                    include: [{ model: Packaging }]
                },
                {
                    model: Vendor,
                    attributes: ['name']
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        const userRole = req.user.role;
        res.render('products/packagingRequestHistory', { 
            packagingRequests,
            userRole,
            path: '/packaging/history'
        });
    } catch (error) {
        console.error('Error fetching packaging request history:', error);
        res.status(500).send('Internal Server Error');
    }
};
