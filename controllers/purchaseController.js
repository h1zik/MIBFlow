const RawMaterialRequest = require('../models/rawMaterialRequest');
const Vendor = require('../models/vendor');
const RawMaterial = require('../models/rawMaterial');
const RawMaterialVendor = require('../models/rawMaterialVendor');
const RawMaterialRequestVendor = require('../models/rawMaterialRequestVendor');
const PackagingRequest = require('../models/packagingRequest');
const PackagingRequestVendor = require('../models/packagingRequestVendor');
const Packaging = require('../models/packaging');
const RawMaterialReturnNoReturn = require('../models/rawMaterialReturnNoReturn');
const PackagingReturnNoReturn = require('../models/packagingReturnNoReturn');
const User = require('../models/user');
const { Op, Sequelize } = require('sequelize');

const getRawMaterialPurchaseData = async () => {
    try {
        const rawMaterialPurchases = await RawMaterialRequestVendor.findAll({
            include: [{
                model: RawMaterialRequest,
                include: [RawMaterial],
                attributes: []
            }],
            where: {
                status: {
                    [Op.notIn]: ['Returned', 'No Return']
                }
            },
            attributes: [
                [Sequelize.col('RawMaterialRequest.RawMaterial.name'), 'name'],
                [Sequelize.fn('SUM', Sequelize.col('splitQuantity')), 'total']
            ],
            group: [
                'RawMaterialRequest.RawMaterial.name',
                'RawMaterialRequest.RawMaterial.id',
                'RawMaterialRequest.id'
            ],
            raw: true
        });

        const labels = rawMaterialPurchases.map(p => p.name);
        const data = rawMaterialPurchases.map(p => parseFloat(p.total));

        return { labels, data };
    } catch (error) {
        console.error('Error getting raw material purchase data:', error);
        return { labels: [], data: [] };
    }
};

const getTopVendors = async () => {
    try {
        const vendorStats = await RawMaterialRequestVendor.findAll({
            include: [{ 
                model: Vendor,
                attributes: ['name']
            }],
            where: {
                status: {
                    [Op.notIn]: ['Returned', 'No Return']
                }
            },
            attributes: [
                'vendorId',
                [Sequelize.fn('COUNT', Sequelize.col('RawMaterialRequestVendor.id')), 'totalOrders'],
                [Sequelize.fn('SUM', Sequelize.col('splitQuantity')), 'totalAmount']
            ],
            group: ['vendorId', 'Vendor.id', 'Vendor.name'],
            order: [[Sequelize.fn('SUM', Sequelize.col('splitQuantity')), 'DESC']],
            limit: 5,
            raw: true,
            nest: true
        });

        return vendorStats.map(stat => ({
            name: stat.Vendor.name,
            totalOrders: parseInt(stat.totalOrders),
            totalAmount: parseFloat(stat.totalAmount)
        }));
    } catch (error) {
        console.error('Error getting top vendors:', error);
        return [];
    }
};

exports.getPurchaseDashboard = async (req, res) => {
    try {
        // Fetch raw material requests for table display
        const rawMaterialRequests = await RawMaterialRequest.findAll({
            where: {
                status: {
                    [Op.notIn]: ['Vendor Assigned','Completed']
                }
            },
            include: [
                {
                    model: RawMaterial,
                    include: [
                        {
                            model: Vendor,
                            through: { attributes: [] }
                        }
                    ]
                }
            ]
        });

        // Fetch raw material request vendors for table display
        const rawMaterialRequestVendors = await RawMaterialRequestVendor.findAll({
            where: {
                status: {
                    [Op.notIn]: ['Returned', 'No Return', 'Quarantined', 'Completed']
                }
            },
            include: [
                { 
                    model: Vendor,
                    attributes: ['name']
                },
                {
                    model: RawMaterialRequest,
                    include: [RawMaterial]
                }
            ]
        });

        // Fetch failed and rejected raw material requests
        const failedRawMaterialRequestsVendors = await RawMaterialRequestVendor.findAll({
            where: { 
                [Op.or]: [
                    { qcStatus: 'Fail' },
                    { qcStatus: 'Reject Sebagian' }
                ],
                status: {
                    [Op.notIn]: ['Returned', 'No Return', 'Quarantined']
                }
            },
            include: [Vendor, RawMaterialRequest]
        });

        // Fetch packaging requests for table display
        const packagingRequests = await PackagingRequest.findAll({
            where: { status: ['Pending']},
            include: [
                { 
                    model: Packaging,
                    include: [{
                        model: Vendor,
                        through: 'packagingvendor'
                    }]
                },
                {
                    model: PackagingRequestVendor,
                    include: [{ model: Vendor }],
                    where: { status: { [Op.ne]: 'Returned' } },
                    required: false
                }
            ]
        });

        // Transform the data to include vendor info directly
        const transformedPackagingRequests = packagingRequests.map(request => {
            const plainRequest = request.get({ plain: true });
            if (plainRequest.PackagingRequestVendors && plainRequest.PackagingRequestVendors.length > 0) {
                plainRequest.vendor = plainRequest.PackagingRequestVendors[0].Vendor;
            }
            return plainRequest;
        });

        // Fetch packaging request vendors for table display
        const packagingRequestVendors = await PackagingRequestVendor.findAll({
            where: {
                status: {
                    [Op.notIn]: ['Returned', 'No Return', 'Quarantined', 'Completed']
                }
            },
            include: [
                { 
                    model: Vendor,
                    attributes: ['name']
                },
                {
                    model: PackagingRequest,
                    include: [Packaging]
                }
            ]
        });

        // Fetch failed packaging requests
        const failedPackagingRequests = await PackagingRequestVendor.findAll({
            where: { 
                [Op.or]: [
                    { qcStatus: 'Fail' },
                    { qcStatus: 'Reject Sebagian' }
                ],
                status: {
                    [Op.notIn]: ['Returned', 'No Return', 'Quarantined']
                }
            },
            include: [
                { 
                    model: PackagingRequest,
                    include: [{ model: Packaging }]
                },
                { model: Vendor }
            ]
        });

        // Fetch all vendors for packaging request splits
        const vendors = await Vendor.findAll();

        const userRole = req.user.role;

        // Get ALL raw material purchase data for pie chart (no date filter)
        const rawMaterialPurchases = await RawMaterialRequestVendor.findAll({
            include: [{
                model: RawMaterialRequest,
                include: [RawMaterial],
                attributes: []
            }],
            where: {
                status: {
                    [Op.notIn]: ['Returned', 'No Return', 'Declined']
                }
            },
            attributes: [
                [Sequelize.col('RawMaterialRequest.RawMaterial.name'), 'name'],
                [Sequelize.fn('SUM', Sequelize.col('splitQuantity')), 'total']
            ],
            group: [
                'RawMaterialRequest.RawMaterial.name',
                'RawMaterialRequest.RawMaterial.id',
                'RawMaterialRequest.id'
            ],
            raw: true
        });

        const rawMaterialLabels = rawMaterialPurchases.map(p => p.name);
        const rawMaterialData = rawMaterialPurchases.map(p => parseFloat(p.total));

        // Get ALL vendor statistics for top vendors list (no date filter)
        const vendorStats = await RawMaterialRequestVendor.findAll({
            include: [{ 
                model: Vendor,
                attributes: ['name']
            }],
            where: {
                status: {
                    [Op.notIn]: ['Returned', 'No Return', 'Declined']
                }
            },
            attributes: [
                'vendorId',
                [Sequelize.fn('COUNT', Sequelize.col('RawMaterialRequestVendor.id')), 'totalOrders'],
                [Sequelize.fn('SUM', Sequelize.col('splitQuantity')), 'totalAmount']
            ],
            group: ['vendorId', 'Vendor.id', 'Vendor.name'],
            order: [[Sequelize.fn('SUM', Sequelize.col('splitQuantity')), 'DESC']],
            limit: 5,
            raw: true,
            nest: true
        });

        const topVendors = vendorStats.map(stat => ({
            name: stat.Vendor.name,
            totalOrders: parseInt(stat.totalOrders),
            totalAmount: parseFloat(stat.totalAmount)
        }));

        // Fetch users for chat feature
        const users = await User.findAll({
            attributes: ['id', 'username', 'role']
        });

        res.status(200).render('dashboards/purchase', { 
            rawMaterialRequests, 
            rawMaterialRequestVendors,
            failedRawMaterialRequestsVendors,
            packagingRequests: transformedPackagingRequests,
            packagingRequestVendors,
            failedPackagingRequests,
            vendors,
            userRole,
            userId: req.user.id,
            users,
            path: '/dashboard/purchase',
            rawMaterialLabels,
            rawMaterialData,
            topVendors
        });
    } catch (error) {
        console.error(error);
        res.status(400).send('An error occurred while fetching the purchase dashboard.');
    }
};

exports.returnMaterial = async (req, res) => {
    const { id } = req.params;

    try {
        const requestVendor = await RawMaterialRequestVendor.findByPk(id, {
            include: [RawMaterialRequest, Vendor]
        });
        if (!requestVendor) {
            return res.status(404).send('Raw material request vendor not found');
        }

        // Create record in RawMaterialReturnNoReturn
        await RawMaterialReturnNoReturn.create({
            rawMaterialRequestId: requestVendor.rawMaterialRequestId,
            vendorId: requestVendor.vendorId,
            splitQuantity: requestVendor.splitQuantity,
            tax: requestVendor.tax,
            paymentType: requestVendor.paymentType,
            status: 'Returned',
            qcStatus: requestVendor.qcStatus,
            qcComment: requestVendor.qcComment,
            rejectQuantity: requestVendor.rejectQuantity,
            rejectComment: requestVendor.rejectComment,
            ponumber: requestVendor.ponumber
        });

        requestVendor.status = 'Returned';
        await requestVendor.save();

        const rawMaterialRequest = await RawMaterialRequest.findByPk(requestVendor.rawMaterialRequestId);
        if (rawMaterialRequest) {
            req.app.locals.sendNotification({
                type: 'returnRawMaterial',
                materialName: rawMaterialRequest.materialName,
                status: 'Returned',
                quantity: requestVendor.rejectQuantity,
                audio: 'purchase.mp3'
            });
        }

        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error returning material:', error);
        res.status(500).send('Internal Server Error');
    }
};


// Packaging request functions
exports.returnPackaging = async (req, res) => {
    const { id } = req.params;

    try {
        const requestVendor = await PackagingRequestVendor.findByPk(id, {
            include: [PackagingRequest, Vendor]
        });
        if (!requestVendor) {
            return res.status(404).send('Packaging request vendor not found');
        }

        // Create record in PackagingReturnNoReturn
        await PackagingReturnNoReturn.create({
            packagingRequestId: requestVendor.packagingRequestId,
            vendorId: requestVendor.vendorId,
            splitQuantity: requestVendor.splitQuantity,
            tax: requestVendor.tax,
            paymentType: requestVendor.paymentType,
            status: 'Returned',
            qcStatus: requestVendor.qcStatus,
            qcComment: requestVendor.qcComment,
            rejectQuantity: requestVendor.rejectQuantity,
            rejectComment: requestVendor.rejectComment,
            ponumber: requestVendor.ponumber
        });

        requestVendor.status = 'Returned';
        await requestVendor.save();

        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error returning packaging:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.noReturnPackaging = async (req, res) => {
    const { id } = req.params;

    try {
        const requestVendor = await PackagingRequestVendor.findByPk(id, {
            include: [PackagingRequest, Vendor]
        });
        if (!requestVendor) {
            return res.status(404).send('Packaging request vendor not found');
        }

        // Create record in PackagingReturnNoReturn
        await PackagingReturnNoReturn.create({
            packagingRequestId: requestVendor.packagingRequestId,
            vendorId: requestVendor.vendorId,
            splitQuantity: requestVendor.splitQuantity,
            tax: requestVendor.tax,
            paymentType: requestVendor.paymentType,
            status: 'No Return',
            qcStatus: requestVendor.qcStatus,
            qcComment: requestVendor.qcComment,
            rejectQuantity: requestVendor.rejectQuantity,
            rejectComment: requestVendor.rejectComment,
            ponumber: requestVendor.ponumber
        });

        requestVendor.status = 'No Return';
        await requestVendor.save();

        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error marking packaging as no return:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.setPackagingRealQuantity = async (req, res) => {
    const { id } = req.params;
    const { realQuantity } = req.body;

    try {
        await PackagingRequest.update({ realQuantity }, { where: { id } });
        
        // Return JSON response for AJAX requests
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({ 
                success: true, 
                message: 'Real quantity updated successfully'
            });
        }
        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error setting real quantity for packaging:', error);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({ 
                success: false, 
                message: 'Error setting real quantity for packaging'
            });
        }
        res.status(500).send('Internal Server Error');
    }
};

exports.submitSplitQuantities = async (req, res) => {
    const { id } = req.params;
    const { vendorIds, splitQuantities, taxes, paymentTypes } = req.body;

    try {
        const packagingRequest = await PackagingRequest.findByPk(id);
        if (!packagingRequest) {
            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.status(404).json({
                    success: false,
                    message: 'Packaging request not found'
                });
            }
            return res.status(404).send('Packaging request not found');
        }

        // Create PackagingRequestVendor records for each split
        for (let i = 0; i < vendorIds.length; i++) {
            let paymentDueDate = null;
            if (paymentTypes[i].startsWith('TOP')) {
                const days = parseInt(paymentTypes[i].replace('TOP', ''));
                paymentDueDate = new Date();
                paymentDueDate.setDate(paymentDueDate.getDate() + days);
            }

            await PackagingRequestVendor.create({
                packagingRequestId: id,
                vendorId: vendorIds[i],
                splitQuantity: splitQuantities[i],
                tax: taxes[i],
                paymentType: paymentTypes[i],
                paymentDueDate,
                status: 'Pending'
            });
        }

        // Update the packaging request status
        packagingRequest.status = 'Vendor Assigned';
        await packagingRequest.save();

        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({
                success: true,
                message: 'Vendor splits submitted successfully'
            });
        }
        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error submitting split quantities:', error);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({
                success: false,
                message: 'Error submitting vendor splits'
            });
        }
        res.status(500).send('Internal Server Error');
    }
};

exports.noReturnMaterial = async (req, res) => {
    const { id } = req.params;

    try {
        const requestVendor = await RawMaterialRequestVendor.findByPk(id, {
            include: [RawMaterialRequest, Vendor]
        });
        if (!requestVendor) {
            return res.status(404).send('Raw material request vendor not found');
        }

        // Create record in RawMaterialReturnNoReturn
        await RawMaterialReturnNoReturn.create({
            rawMaterialRequestId: requestVendor.rawMaterialRequestId,
            vendorId: requestVendor.vendorId,
            splitQuantity: requestVendor.splitQuantity,
            tax: requestVendor.tax,
            paymentType: requestVendor.paymentType,
            status: 'No Return',
            qcStatus: requestVendor.qcStatus,
            qcComment: requestVendor.qcComment,
            rejectQuantity: requestVendor.rejectQuantity,
            rejectComment: requestVendor.rejectComment,
            ponumber: requestVendor.ponumber
        });

        requestVendor.status = 'No Return';
        await requestVendor.save();

        const rawMaterialRequest = await RawMaterialRequest.findByPk(requestVendor.rawMaterialRequestId);
        if (rawMaterialRequest) {
            req.app.locals.sendNotification({
                type: 'noReturnRawMaterial',
                materialName: rawMaterialRequest.materialName,
                status: 'No Return',
                quantity: requestVendor.rejectQuantity,
                audio: 'purchase.mp3'
            });
        }

        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error marking as no return:', error);
        res.status(500).send('Internal Server Error');
    }
};


exports.setPaymentType = async (req, res) => {
    const { id } = req.params;
    const { paymentType } = req.body;

    try {
        const rawMaterialRequest = await RawMaterialRequest.findByPk(id);

        if (!rawMaterialRequest) {
            return res.status(404).send({ error: 'Raw material request not found' });
        }

        let paymentDueDate = null;

        // Calculate payment due date if it's a TOP payment type
        if (paymentType.startsWith('TOP')) {
            const days = parseInt(paymentType.replace('TOP', ''));
            paymentDueDate = new Date();
            paymentDueDate.setDate(paymentDueDate.getDate() + days);
        }

        rawMaterialRequest.paymentType = paymentType;
        rawMaterialRequest.paymentDueDate = paymentDueDate;

        await rawMaterialRequest.save();

        res.redirect('/dashboard/purchase'); // or wherever you want to redirect after setting the payment type
    } catch (error) {
        console.error('Error setting payment type:', error);
        res.status(400).send(error);
    }
};

// Controller for setting the real quantity
exports.setRealQuantity = async (req, res) => {
    const { id } = req.params;
    const { realQuantity } = req.body;

    try {
        await RawMaterialRequest.update({ realQuantity }, { where: { id } });
        
        // Return JSON response for AJAX requests
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

// Controller for setting the tax
exports.setTax = async (req, res) => {
    const { id } = req.params;
    const { tax } = req.body;

    try {
        await RawMaterialRequest.update({ tax }, { where: { id } });
        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error setting tax:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Return History Controllers
exports.getReturnedPackagingHistory = async (req, res) => {
    try {
        const returnedPackaging = await PackagingReturnNoReturn.findAll({
            where: { status: 'Returned' },
            include: [
                {
                    model: PackagingRequest,
                    attributes: ['packagingName']
                },
                {
                    model: Vendor,
                    attributes: ['name']
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        const noReturnPackaging = await PackagingReturnNoReturn.findAll({
            where: { status: 'No Return' },
            include: [
                {
                    model: PackagingRequest,
                    attributes: ['packagingName']
                },
                {
                    model: Vendor,
                    attributes: ['name']
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.render('purchase/returnedPackagingHistory', {
            returnedPackaging,
            noReturnPackaging,
            userRole: req.user.role,
            path: '/purchase/returned-packaging-history'
        });
    } catch (error) {
        console.error('Error fetching returned packaging history:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.getReturnedRawMaterialHistory = async (req, res) => {
    try {
        const returnedRawMaterials = await RawMaterialReturnNoReturn.findAll({
            where: { status: 'Returned' },
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
            order: [['createdAt', 'DESC']]
        });

        const noReturnRawMaterials = await RawMaterialReturnNoReturn.findAll({
            where: { status: 'No Return' },
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
            order: [['createdAt', 'DESC']]
        });

        res.render('purchase/returnedRawMaterialHistory', {
            returnedRawMaterials,
            noReturnRawMaterials,
            userRole: req.user.role,
            path: '/purchase/returned-raw-material-history'
        });
    } catch (error) {
        console.error('Error fetching returned raw material history:', error);
        res.status(500).send('Internal Server Error');
    }
};
