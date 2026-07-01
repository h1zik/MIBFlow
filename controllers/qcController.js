const { Production, ProductionRawMaterial }= require('../models/production');
const Complain = require('../models/complain');
const ComplainItem = require('../models/complainItem');
const Product = require('../models/product');
const ProductCheck = require('../models/productCheck');
const Tank = require('../models/tank');
const RawMaterialRequest = require('../models/rawMaterialRequest');
const { Op } = require('sequelize');
const RawMaterialRequestVendor = require('../models/rawMaterialRequestVendor');
const PackagingRequestVendor = require('../models/packagingRequestVendor');
const PackagingRequest = require('../models/packagingRequest');
const Packaging = require('../models/packaging');
const Vendor = require('../models/vendor');
const PDFDocument = require('pdfkit');
const Order = require('../models/order');
const ComplainRework = require('../models/complainRework');
const ProductionRequest = require('../models/productionRequest');
const fs = require('fs');
const path = require('path');
const User = require('../models/user');

exports.getQCProductionList = async (req, res) => {
    try {
        // Get ongoing processes
        const ongoingProcesses = await Production.findAll({
            where: {
                batchNumber: { [Op.not]: null },
                stockUpdated: false
            },
            include: [
                {
                    model: Product,
                    attributes: ['name']
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
            ],
            order: [['startDate', 'ASC']]
        });

        // Get upcoming processes
        const upcomingProcesses = await Production.findAll({
            where: {
                batchNumber: null,
                status: 'Scheduled'
            },
            include: [
                {
                    model: Product,
                    attributes: ['name']
                },
                {
                    model: Tank,
                    attributes: ['name', 'volume']
                }
            ],
            order: [['startDate', 'ASC']]
        });

        // Get productions for QC
        const productions = await Production.findAll({
            where: {
                sampleRetained: false,
                qcStatus: {
                    [Op.not]: 'Fail'
                }
            },
            include: [
                {
                    model: Product,
                    attributes: ['name']
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

        const rawMaterialRequestsVendors = await RawMaterialRequestVendor.findAll({
            where: { qcStatus: 'Pending' },
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

        const packagingRequestVendors = await PackagingRequestVendor.findAll({
            where: { qcStatus: 'Pending' },
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

        // Get rework productions for QC
        const reworkProductions = await ComplainRework.findAll({
            where: {
                batchNumber: { [Op.not]: null },
                stockUpdated: false,
                qcStatus: {
                    [Op.or]: [
                        { [Op.is]: null },
                        { [Op.ne]: 'Pass' }
                    ]
                }
            },
            include: [
                {
                    model: ComplainItem,
                    include: [Complain]
                },
                {
                    model: Tank,
                    attributes: ['name', 'volume']
                }
            ]
        });

        // Get complain items sent to QC
        const complainItems = await ComplainItem.findAll({
            where: { status: 'Sent to QC' },
            include: [{
                model: Complain,
                include: [{
                    model: Order,
                    attributes: ['sonumber', 'customerName']
                }]
            }],
            order: [['createdAt', 'DESC']]
        });

        // Get product checks (only pending)
        const productChecks = await ProductCheck.findAll({
            where: {
                qcStatus: 'Pending'
            },
            order: [['createdAt', 'DESC']]
        });

        // Fetch users for chat feature
        const users = await User.findAll({
            attributes: ['id', 'username', 'role']
        });

        const userRole = req.user.role;
        res.status(200).render('dashboards/qc', { 
            complainItems,
            productions, 
            ongoingProcesses,
            upcomingProcesses,
            rawMaterialRequestsVendors,
            packagingRequestVendors,
            reworkProductions,
            productChecks,
            userRole,
            userId: req.user.id,
            users,
            path: '/dashboard/qc'
        });
    } catch (error) {
        console.error('Error fetching QC production list:', error);
        res.status(400).send(error);
    }
};

exports.proceedToRework = async (req, res) => {
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

        if (!complainItem) {
            return res.status(404).send('Complain item not found');
        }

        await ComplainItem.update(
            { status: 'Rework Approved' },
            { where: { id: complainItemId } }
        );

        // Send notification
        req.app.locals.sendNotification({
            type: 'rework',
            sonumber: complainItem.Complain.Order.sonumber,
            customerName: complainItem.Complain.Order.customerName,
            product: complainItem.product,
            audio: 'product.mp3'
        });

        res.redirect('/dashboard/qc');
    } catch (error) {
        console.error('Error updating complain item status:', error);
        res.status(400).send(error);
    }
};

exports.rejectComplainItem = async (req, res) => {
    try {
        const { complainItemId } = req.body;

        await ComplainItem.update(
            { status: 'Quarantined' },
            { where: { id: complainItemId } }
        );

        res.redirect('/dashboard/qc');
    } catch (error) {
        console.error('Error updating complain item status:', error);
        res.status(400).send(error);
    }
};

// Product Check QC status update
exports.updateProductCheckQCStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { qcStatus, qcComment } = req.body;

        const productCheck = await ProductCheck.findByPk(id);
        if (!productCheck) {
            return res.status(404).json({ success: false, message: 'Product check not found' });
        }

        productCheck.qcStatus = qcStatus;
        productCheck.qcComment = qcComment;
        await productCheck.save();

        // Send notification based on QC status
        req.app.locals.sendNotification({
            type: 'productCheckQCStatus',
            productName: productCheck.productName,
            status: qcStatus,
            quantity: productCheck.quantity,
            audio: 'production.mp3'
        });

        res.json({ 
            success: true,
            status: qcStatus,
            comment: qcComment
        });
    } catch (error) {
        console.error('Error updating product check QC status:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateQCStatus = async (req, res) => {
    const { id } = req.params;
    const { qcStatus, qcComment } = req.body;
    const bgscanFile = req.files?.bgscan;

    try {
        // Only Pass/Fail are valid QC outcomes for a production.
        if (!['Pass', 'Fail'].includes(qcStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid QC status.' });
        }

        const production = await Production.findByPk(id);
        if (!production) {
            return res.status(404).json({ success: false, message: 'Production not found' });
        }

        // Don't change the QC result after the production is completed (stock already added).
        if (production.stockUpdated || production.status === 'Completed') {
            return res.status(400).json({ success: false, message: 'This production is already completed; its QC result cannot be changed.' });
        }

        production.qcStatus = qcStatus;
        production.qcComment = qcComment;

        if (qcStatus === 'Fail') {
            production.rawMaterialAdded = false;
            production.rawMaterialChoice = 'pending';
        }
        await production.save();

        // Send notification based on QC status
        if (qcStatus === 'Pass') {
            req.app.locals.sendNotification({
                type: 'qcStatusUpdated',
                batchNumber: production.batchNumber,
                status: qcStatus,
                audio: 'production.mp3'
            });
        } else if (qcStatus === 'Fail') {
            req.app.locals.sendNotification({
                type: 'qcStatusUpdated',
                batchNumber: production.batchNumber,
                status: qcStatus,
                audio: 'production.mp3'
            });
        }

        let newActions = '';
        if (qcStatus === 'Pass') {
            newActions = `
                <form class="retain-sample-form" onsubmit="handleRetainSample(event, '${production.id}')" enctype="multipart/form-data">
                    <div class="form-group">
                        <label for="retainedSampleVolume">Sample Volume (ml)</label>
                        <input type="number" id="retainedSampleVolume" name="retainedSampleVolume" placeholder="Enter volume" required>
                    </div>
                    <div class="form-group">
                        <label for="expiredDate">Expired Date</label>
                        <input type="date" id="expiredDate" name="expiredDate" required>
                    </div>
                    <div class="form-group">
                        <label for="noRack">No Rack</label>
                        <input type="text" id="noRack" name="noRack" placeholder="Enter rack number" required>
                    </div>
                    <div class="form-group">
                        <label for="bgscan">BG Scan</label>
                        <input type="file" class="form-control" name="bgscan" accept=".pdf,.jpg,.jpeg,.png" required>
                    </div>
                    <button type="submit" class="btn btn-primary">
                        <i class="bi bi-flask"></i>
                        Retain Sample & Print Label
                    </button>
                </form>
            `;
        }

        res.json({ 
            success: true,
            status: qcStatus,
            comment: qcComment,
            newActions
        });
    } catch (error) {
        console.error('Error updating QC status:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateQCStatusPackaging = async (req, res) => {
    const { id } = req.params;
    const { qcStatus, qcComment, rejectComment } = req.body;

    try {
        const requestVendor = await PackagingRequestVendor.findByPk(id, {
            include: [{
                model: PackagingRequest,
                include: [{ model: Packaging }]
            }]
        });
        if (!requestVendor) {
            return res.status(404).json({ success: false, message: 'Packaging Request Vendor not found' });
        }

        requestVendor.qcStatus = qcStatus;
        requestVendor.qcComment = qcComment;

        // Handle reject flow
        if (qcStatus === 'Reject Sebagian') {
            requestVendor.rejectComment = rejectComment;
            // Don't reset rejectQuantity here - let warehouse handle it
        } else if (qcStatus === 'Pass') {
            // If passed QC, maintain the reject quantity for warehouse to handle
            requestVendor.rejectQuantity = requestVendor.rejectQuantity;
        } else if (qcStatus === 'Fail') {
            // If failed QC, maintain the reject quantity
            requestVendor.rejectQuantity = requestVendor.rejectQuantity;
        }

        await requestVendor.save();

        // Prepare new actions based on status
        let newActions = '';
        if (qcStatus === 'Reject Sebagian') {
            newActions = `
                <div class="alert alert-warning">
                    <strong>Partially Rejected!</strong> This item has been sent to Warehouse for quantity assessment.
                </div>
            `;
        }

        // Send notification if status is Fail
        if (qcStatus === 'Fail') {
                req.app.locals.sendNotification({
                    type: 'qcFailPackaging',
                    packagingName: requestVendor.PackagingRequest.Packaging.name,
                    status: qcStatus,
                    audio: 'purchase.mp3'
                });
        } else if (qcStatus === 'Pass') {
                req.app.locals.sendNotification({
                    type: 'qcPassPackaging',
                    packagingName: requestVendor.PackagingRequest.Packaging.name,
                    status: qcStatus,
                    audio: 'raw.mp3'
                });

        } else if (qcStatus === 'Reject Sebagian') {
                req.app.locals.sendNotification({
                    type: 'qcRejectSebagianPackaging',
                    packagingName: requestVendor.PackagingRequest.Packaging.name,
                    status: qcStatus,
                    audio: 'raw.mp3'
                });
            }

        res.json({ 
            success: true,
            status: qcStatus,
            comment: qcComment,
            rejectComment: rejectComment,
            newActions
        });
    } catch (error) {
        console.error('Error updating QC status:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.updateQCStatusRawMaterial = async (req, res) => {
    const { id } = req.params;
    const { qcStatus, qcComment, rejectComment, batchNumber, expiredDate } = req.body;

    try {
        const requestVendor = await RawMaterialRequestVendor.findByPk(id);
        if (!requestVendor) {
            return res.status(404).json({ success: false, message: 'Raw Material Request Vendor not found' });
        }

        requestVendor.qcStatus = qcStatus;
        requestVendor.qcComment = qcComment;

        // Only update batch number and expiry date if QC status is Pass
        if (qcStatus === 'Pass') {
            requestVendor.batchNumber = batchNumber;
            requestVendor.expiredDate = expiredDate;
            requestVendor.rejectQuantity = requestVendor.rejectQuantity;
        } else if (qcStatus === 'Reject Sebagian') {
            requestVendor.rejectComment = rejectComment;
        } else if (qcStatus === 'Fail') {
            requestVendor.rejectQuantity = requestVendor.rejectQuantity;
        }

        await requestVendor.save();

        // Send notification if status is Fail
        if (qcStatus === 'Fail') {
            const rawMaterialRequest = await RawMaterialRequest.findByPk(requestVendor.rawMaterialRequestId);
            if (rawMaterialRequest) {
                req.app.locals.sendNotification({
                    type: 'qcFailRawMaterial',
                    materialName: rawMaterialRequest.materialName,
                    status: qcStatus,
                    audio: 'purchase.mp3'
                });
            }
        } else if (qcStatus === 'Pass') {
            const rawMaterialRequest = await RawMaterialRequest.findByPk(requestVendor.rawMaterialRequestId);
            if (rawMaterialRequest) {
                req.app.locals.sendNotification({
                    type: 'qcPassRawMaterial',
                    materialName: rawMaterialRequest.materialName,
                    status: qcStatus,
                    audio: 'raw.mp3'
                });
            }

        } else if (qcStatus === 'Reject Sebagian') {
            const rawMaterialRequest = await RawMaterialRequest.findByPk(requestVendor.rawMaterialRequestId);
            if (rawMaterialRequest) {
                req.app.locals.sendNotification({
                    type: 'qcRejectSebagianRawMaterial',
                    materialName: rawMaterialRequest.materialName,
                    status: qcStatus,
                    audio: 'raw.mp3'
                });
            }

        }

        // Prepare new actions based on status
        let newActions = '';
        if (qcStatus === 'Reject Sebagian') {
            newActions = `
                <div class="alert alert-warning">
                    <strong>Partially Rejected!</strong> This item has been sent to Raw Material Warehouse for quantity assessment.
                </div>
            `;
        }

        res.json({ 
            success: true,
            status: qcStatus,
            comment: qcComment,
            rejectComment: rejectComment,
            batchNumber,
            expiredDate,
            newActions
        });
    } catch (error) {
        console.error('Error updating QC status:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.getSampleRetainedProductions = async (req, res) => {
    try {
        // Get query parameters for date filter
        const startDate = req.query.startDate || '';
        const endDate = req.query.endDate || '';

        // Set default dates if not provided
        const today = new Date();
        const defaultEndDate = today.toISOString().split('T')[0];
        const defaultStartDate = new Date(today.setMonth(today.getMonth() - 1)).toISOString().split('T')[0];

        // Build where clause
        const whereClause = {
            sampleRetained: true
        };

        // Add date range to where clause if provided
        if (startDate && endDate) {
            whereClause.startDate = {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            };
        }

        // Get active (non-expired) productions
        const productions = await Production.findAll({
            where: {
                ...whereClause,
                expiredDate: {
                    [Op.gt]: new Date() // Greater than current date
                }
            },
            include: [
                {
                    model: Product,
                    attributes: ['name']
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
            ],
            order: [['updatedAt', 'DESC']] // Show newest retained samples first
        });

        // Get expired productions
        const expiredProductions = await Production.findAll({
            where: {
                ...whereClause,
                expiredDate: {
                    [Op.lte]: new Date() // Less than or equal to current date
                }
            },
            include: [
                {
                    model: Product,
                    attributes: ['name']
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
            ],
            order: [['expiredDate', 'DESC']] // Show most recently expired first
        });

        const userRole = req.user.role;
        res.render('production/sampleRetainedProductions', { 
            productions,
            expiredProductions,
            userRole,
            path: '/qc/sampleRetainedProductions',
            startDate,
            endDate,
            defaultStartDate,
            defaultEndDate
        });
    } catch (error) {
        console.error('Error fetching retained samples:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.retainSample = async (req, res) => {
    try {
        const productionId = req.params.id;
        const { retainedSampleVolume, expiredDate, noRack } = req.body;
        const bgscanFile = req.file;

        // Validate required fields
        if (!retainedSampleVolume || !expiredDate || !noRack || !bgscanFile) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide all required fields: retainedSampleVolume, expiredDate, noRack, and bgscan file' 
            });
        }

        const production = await Production.findByPk(productionId);
        if (!production) {
            return res.status(404).json({ success: false, message: 'Production not found' });
        }

        // Save the sample data
        production.sampleRetained = true;
        production.retainedSampleVolume = retainedSampleVolume;
        production.expiredDate = expiredDate;
        production.noRack = noRack;
        production.bgscan = bgscanFile.filename;

        await production.save();

        // Generate and send PDF
        try {
            const pdfPath = await generateSamplePDF(productionId);
            
            // Create new actions HTML for the retained sample info
            const newActions = `
                <div class="retain-sample-form">
                    <div class="form-group">
                        <label>Sample Volume</label>
                        <div class="form-control-plaintext">${retainedSampleVolume} ml</div>
                    </div>
                    <div class="form-group">
                        <label>Expired Date</label>
                        <div class="form-control-plaintext">${new Date(expiredDate).toLocaleDateString()}</div>
                    </div>
                    <div class="form-group">
                        <label>No Rack</label>
                        <div class="form-control-plaintext">${noRack}</div>
                    </div>
                    <a href="/qc/generatePDF/${productionId}" class="btn print-label-btn" target="_blank">
                        <i class="bi bi-printer"></i>
                        Print Label
                    </a>
                </div>
            `;

            res.json({ 
                success: true,
                pdfUrl: `/qc/generatePDF/${productionId}`,
                newActions
            });
        } catch (pdfError) {
            console.error('Error generating PDF:', pdfError);
            res.status(500).json({ success: false, message: 'Error generating PDF' });
        }
    } catch (error) {
        console.error('Error retaining sample:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

exports.getRawMaterialHistory = async (req, res) => {
    try {
        // Get active (non-expired) raw materials
        const rawMaterialRequests = await RawMaterialRequestVendor.findAll({
            where: {
                expiredDate: {
                    [Op.gt]: new Date() // Greater than current date
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
            ],
            order: [['updatedAt', 'DESC']]
        });

        // Get expired raw materials
        const expiredRawMaterials = await RawMaterialRequestVendor.findAll({
            where: {
                expiredDate: {
                    [Op.lte]: new Date() // Less than or equal to current date
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
            ],
            order: [['expiredDate', 'DESC']] // Show most recently expired first
        });

        const userRole = req.user.role;
        res.render('qc/raw-material-history', { 
            rawMaterialRequests,
            expiredRawMaterials,
            userRole,
            path: '/qc/raw-material-history'
        });
    } catch (error) {
        console.error('Error fetching raw material QC history:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.getPackagingHistory = async (req, res) => {
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
            order: [['updatedAt', 'DESC']]
        });

        const userRole = req.user.role;
        res.render('qc/packaging-history', { 
            packagingRequests,
            userRole,
            path: '/qc/packaging-history'
        });
    } catch (error) {
        console.error('Error fetching packaging QC history:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.getProductionHistory = async (req, res) => {
    try {
        const productions = await Production.findAll({
            include: [
                {
                    model: Product,
                    attributes: ['name']
                },
                {
                    model: ProductionRequest,
                    include: [{
                        model: Order,
                        attributes: ['sonumber']
                    }]
                }
            ],
            order: [['updatedAt', 'DESC']]
        });

        const userRole = req.user.role;
        res.render('qc/production-history', { 
            productions,
            userRole,
            path: '/qc/production-history'
        });
    } catch (error) {
        console.error('Error fetching production QC history:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.generateSamplePDF = async (req, res) => {
    try {
        const productionId = req.params.id;
        const pdfPath = await generateSamplePDF(productionId);
        
        res.download(pdfPath, `sample-label-${productionId}.pdf`, (err) => {
            // Delete the temporary file after sending
            if (fs.existsSync(pdfPath)) {
                fs.unlinkSync(pdfPath);
            }
            if (err) {
                console.error('Error sending PDF:', err);
                res.status(500).send('Error downloading PDF');
            }
        });
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).send('Error generating PDF');
    }
};

exports.updateReworkStatus = async (req, res) => {
    const { id } = req.params;
    const { qcStatus, qcComment } = req.body;

    try {
        // Only Pass/Fail are valid QC outcomes for a rework.
        if (!['Pass', 'Fail'].includes(qcStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid QC status.' });
        }

        const rework = await ComplainRework.findByPk(id);
        if (!rework) {
            return res.status(404).json({ success: false, message: 'Rework not found' });
        }

        // Don't change the QC result after the rework is completed (stock already added).
        if (rework.stockUpdated || rework.status === 'Completed') {
            return res.status(400).json({ success: false, message: 'This rework is already completed; its QC result cannot be changed.' });
        }

        rework.qcStatus = qcStatus;
        rework.qcComment = qcComment;
        if (qcStatus === 'Fail') {
            rework.rawMaterialAdded = false;
            rework.rawMaterialChoice = 'pending';
        }
        await rework.save();

        // Send notification based on QC status
        if (qcStatus === 'Pass' || qcStatus === 'Fail') {
            req.app.locals.sendNotification({
                type: 'reworkQcStatus',
                batchNumber: rework.batchNumber,
                status: qcStatus,
                audio: 'production.mp3'
            });
        }

        let newActions = '';
        if (qcStatus === 'Pass') {
            newActions = `
                <form class="retain-sample-form" onsubmit="handleRetainReworkSample(event, '${rework.id}')">
                    <div class="form-group">
                        <label for="retainedSampleVolume">Sample Volume (ml)</label>
                        <input type="number" id="retainedSampleVolume" name="retainedSampleVolume" placeholder="Enter volume" required>
                    </div>
                    <div class="form-group">
                        <label for="expiredDate">Expired Date</label>
                        <input type="date" id="expiredDate" name="expiredDate" required>
                    </div>
                    <div class="form-group">
                        <label for="rackNumber">No Rack</label>
                        <input type="text" id="rackNumber" name="rackNumber" placeholder="Enter rack number" required>
                    </div>
                    <button type="submit" class="btn btn-primary">
                        <i class="bi bi-flask"></i>
                        Retain Sample & Print Label
                    </button>
                </form>
            `;
        }

        res.json({ 
            success: true,
            status: qcStatus,
            comment: qcComment,
            newActions
        });
    } catch (error) {
        console.error('Error updating rework QC status:', error);
        res.status(400).json({ success: false, message: error.message });
    }
};

exports.retainReworkSample = async (req, res) => {
    try {
        const reworkId = req.params.id;
        const { retainedSampleVolume, expiredDate, rackNumber } = req.body;

        const rework = await ComplainRework.findByPk(reworkId, {
            include: [ComplainItem]
        });
        if (!rework) {
            return res.status(404).json({ success: false, message: 'Rework not found' });
        }

        // Save the sample data
        rework.sampleRetained = true;
        rework.retainedSampleVolume = retainedSampleVolume;
        rework.expiryDate = expiredDate;
        rework.rackNumber = rackNumber;
        await rework.save();

        // Generate and send PDF
        try {
            const pdfPath = await generateReworkSamplePDF(reworkId);
            
            // Create new actions HTML for the retained sample info
            const newActions = `
                <div class="retain-sample-form">
                    <div class="form-group">
                        <label>Sample Volume</label>
                        <div class="form-control-plaintext">${retainedSampleVolume} ml</div>
                    </div>
                    <div class="form-group">
                        <label>Expired Date</label>
                        <div class="form-control-plaintext">${new Date(expiredDate).toLocaleDateString()}</div>
                    </div>
                    <div class="form-group">
                        <label>No Rack</label>
                        <div class="form-control-plaintext">${rackNumber}</div>
                    </div>
                    <a href="/qc/generateReworkPDF/${reworkId}" class="btn print-label-btn" target="_blank">
                        <i class="bi bi-printer"></i>
                        Print Label
                    </a>
                </div>
            `;

            res.json({ 
                success: true,
                pdfUrl: `/qc/generateReworkPDF/${reworkId}`,
                newActions
            });
        } catch (pdfError) {
            console.error('Error generating PDF:', pdfError);
            res.status(500).json({ success: false, message: 'Error generating PDF' });
        }
    } catch (error) {
        console.error('Error retaining rework sample:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

exports.generateReworkPDF = async (req, res) => {
    try {
        const reworkId = req.params.id;
        const pdfPath = await generateReworkSamplePDF(reworkId);
        
        res.download(pdfPath, `rework-sample-label-${reworkId}.pdf`, (err) => {
            // Delete the temporary file after sending
            if (fs.existsSync(pdfPath)) {
                fs.unlinkSync(pdfPath);
            }
            if (err) {
                console.error('Error sending PDF:', err);
                res.status(500).send('Error downloading PDF');
            }
        });
    } catch (error) {
        console.error('Error generating rework PDF:', error);
        res.status(500).send('Error generating PDF');
    }
};

async function generateReworkSamplePDF(reworkId) {
    const rework = await ComplainRework.findByPk(reworkId, {
        include: [ComplainItem]
    });

    if (!rework) {
        throw new Error('Rework not found');
    }

    // Create temp directory if it doesn't exist
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create a temporary file path
    const pdfPath = path.join(tempDir, `rework-sample-label-${reworkId}.pdf`);

    return new Promise((resolve, reject) => {
        try {
            // Create a new PDF document with custom size (60x40mm)
            const doc = new PDFDocument({
                size: [170.078740, 113.385827], // Convert 60x40mm to points (1mm = 2.834646 points)
                margins: {
                    top: 5,
                    bottom: 5,
                    left: 5,
                    right: 5
                }
            });

            // Create write stream
            const writeStream = fs.createWriteStream(pdfPath);
            
            // Handle stream errors
            writeStream.on('error', (err) => {
                console.error('Error writing PDF:', err);
                reject(err);
            });

            // When PDF is finished
            writeStream.on('finish', () => {
                resolve(pdfPath);
            });

            // Pipe the PDF to the write stream
            doc.pipe(writeStream);

            // Calculate proportional font sizes based on label dimensions
            const labelWidth = 170.078740;
            const labelHeight = 113.385827;
            const titleFontSize = Math.min(labelWidth * 0.06, labelHeight * 0.09); // ~10pt for 60x40mm
            const contentFontSize = Math.min(labelWidth * 0.045, labelHeight * 0.07); // ~7.5pt for 60x40mm

            // Add content to the small label
            doc.font('Helvetica-Bold')
                .fontSize(titleFontSize)
                .text('Rework Retain Sample', { align: 'center' })
                .moveDown(0.3);

            doc.font('Helvetica')
                .fontSize(contentFontSize)
                .text(`Product: ${rework.ComplainItem.product}`, { align: 'left' })
                .moveDown(0.2)
                .text(`Batch: ${rework.batchNumber}`)
                .moveDown(0.2)
                .text(`Prod Date: ${rework.startDate.toLocaleDateString()}`)
                .moveDown(0.2)
                .text(`Volume: ${rework.retainedSampleVolume} ml`)
                .moveDown(0.2)
                .text(`Exp Date: ${new Date(rework.expiryDate).toLocaleDateString()}`)
                .moveDown(0.2)
                .text(`Rack: ${rework.rackNumber}`);

            // Finalize the PDF
            doc.end();
        } catch (error) {
            console.error('Error generating PDF:', error);
            reject(error);
        }
    });
}

async function generateSamplePDF(productionId) {
    const production = await Production.findByPk(productionId, {
        include: [
            {
                model: Product,
                attributes: ['name']
            }
        ]
    });

    if (!production) {
        throw new Error('Production not found');
    }

    // Create temp directory if it doesn't exist
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create a temporary file path
    const pdfPath = path.join(tempDir, `sample-label-${productionId}.pdf`);

    return new Promise((resolve, reject) => {
        try {
            // Create a new PDF document with custom size (60x40mm)
            const doc = new PDFDocument({
                size: [170.078740, 113.385827], // Convert 60x40mm to points (1mm = 2.834646 points)
                margins: {
                    top: 5,
                    bottom: 5,
                    left: 5,
                    right: 5
                }
            });

            // Create write stream
            const writeStream = fs.createWriteStream(pdfPath);
            
            // Handle stream errors
            writeStream.on('error', (err) => {
                console.error('Error writing PDF:', err);
                reject(err);
            });

            // When PDF is finished
            writeStream.on('finish', () => {
                resolve(pdfPath);
            });

            // Pipe the PDF to the write stream
            doc.pipe(writeStream);

            // Calculate proportional font sizes based on label dimensions
            const labelWidth = 170.078740;
            const labelHeight = 113.385827;
            const titleFontSize = Math.min(labelWidth * 0.06, labelHeight * 0.09); // ~10pt for 60x40mm
            const contentFontSize = Math.min(labelWidth * 0.045, labelHeight * 0.07); // ~7.5pt for 60x40mm

            // Add content to the small label
            doc.font('Helvetica-Bold')
                .fontSize(titleFontSize)
                .text('Retain Sample', { align: 'center' })
                .moveDown(0.3);

            doc.font('Helvetica')
                .fontSize(contentFontSize)
                .text(`Product: ${production.Product.name}`, { align: 'left' })
                .moveDown(0.2)
                .text(`Batch: ${production.batchNumber}`)
                .moveDown(0.2)
                .text(`Prod Date: ${production.startDate.toLocaleDateString()}`)
                .moveDown(0.2)
                .text(`Volume: ${production.retainedSampleVolume} ml`)
                .moveDown(0.2)
                .text(`Exp Date: ${new Date(production.expiredDate).toLocaleDateString()}`)
                .moveDown(0.2)
                .text(`Rack: ${production.noRack}`);

            // Finalize the PDF
            doc.end();
        } catch (error) {
            console.error('Error generating PDF:', error);
            reject(error);
        }
    });
}
