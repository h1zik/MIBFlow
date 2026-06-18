const Packaging = require('../models/packaging');
const Vendor = require('../models/vendor');
const PackagingVendor = require('../models/packagingVendor');
const { Op } = require('sequelize');

exports.addPackagingForm = (req, res) => {
    const successMessage = req.session.successMessage || null;
    delete req.session.successMessage;
    const userRole = req.user.role;
    res.render('packaging/addPackaging', {
        userRole,
        successMessage,
        path: '/packaging/add'
    });
};

exports.addPackaging = async (req, res) => {
    const { name, volume, stock } = req.body;

    try {
        // Input validation
        if (!name || !volume || !stock) {
            return res.status(400).render('packaging/addPackaging', {
                error: 'Please fill in all required fields',
                formData: { name, volume, stock },
                successMessage: null,
                userRole: req.user.role,
                path: '/packaging/add'
            });
        }

        // Check if packaging with same name already exists
        const existingPackaging = await Packaging.findOne({ where: { name } });
        if (existingPackaging) {
            return res.status(400).render('packaging/addPackaging', {
                error: 'A packaging with this name already exists',
                formData: { name, volume, stock },
                successMessage: null,
                userRole: req.user.role,
                path: '/packaging/add'
            });
        }

        await Packaging.create({ name, volume, stock });
        req.session.successMessage = `Packaging "${name}" has been created successfully!`;
        res.redirect('/packaging/add');
    } catch (error) {
        console.error('Error adding packaging:', error);
        res.status(400).render('packaging/addPackaging', {
            error: 'An error occurred while adding the packaging. Please try again.',
            formData: { name, volume, stock },
            successMessage: null,
            userRole: req.user.role,
            path: '/packaging/add'
        });
    }
};

exports.listPackagings = async (req, res) => {
    try {
        // Get all packagings with vendor associations
        const packagings = await Packaging.findAll({
            include: [{
                model: Vendor,
                through: {
                    model: PackagingVendor,
                    attributes: ['price']
                },
                required: false
            }]
        });
        
        // Debug vendor pricing data in more detail
        console.log('Packaging vendor data:', packagings.map(p => ({
            id: p.id,
            name: p.name,
            vendors: p.Vendors ? p.Vendors.map(v => ({
                name: v.name,
                vendorData: v.PackagingVendor ? {
                    price: v.PackagingVendor.price,
                    dataValues: v.PackagingVendor.dataValues
                } : 'No join data'
            })) : 'No vendors'
        })));
        
        // Process the data to ensure vendor prices are accessible
        packagings.forEach(packaging => {
            if (packaging.Vendors && packaging.Vendors.length > 0) {
                packaging.Vendors.forEach(vendor => {
                    if (vendor.PackagingVendor && vendor.PackagingVendor.dataValues) {
                        // Ensure price is accessible
                        vendor.vendorPrice = vendor.PackagingVendor.dataValues.price;
                    }
                });
            }
        });
        
        const userRole = req.user.role;
        const successMessage = req.session.successMessage;
        delete req.session.successMessage;
        
        res.render('packaging/listPackagings', { 
            packagings, 
            userRole,
            path: '/packaging/list',
            successMessage,
            error: null
        });
    } catch (error) {
        console.error('Error fetching packagings:', error);
        res.render('packaging/listPackagings', {
            packagings: [],
            userRole: req.user.role,
            path: '/packaging/list',
            successMessage: null,
            error: 'Error loading packagings. Please try again.'
        });
    }
};

exports.renderEditPackagingPage = async (req, res) => {
    const { id } = req.params;

    try {
        const packaging = await Packaging.findByPk(id);
        const userRole = req.user.role;
        if (!packaging) {
            req.session.successMessage = 'Packaging not found. The requested packaging could not be found in the system.';
            return res.redirect('/packaging/list');
        }

        const successMessage = req.session.successMessage || null;
        delete req.session.successMessage;

        res.render('packaging/editPackaging', { 
            packaging, 
            userRole,
            path: '/packaging/edit',
            successMessage
        });
    } catch (error) {
        console.error('Error fetching packaging details:', error);
        req.session.successMessage = 'Error loading packaging details. Please try again.';
        res.redirect('/packaging/list');
    }
};

exports.updatePackaging = async (req, res) => {
    const { id } = req.params;
    const { name, volume, stock, price } = req.body;

    try {
        // Input validation
        if (!name || !volume || !stock) {
            return res.status(400).render('packaging/editPackaging', {
                packaging: { id, name, volume, stock, price },
                error: 'Please fill in all required fields',
                userRole: req.user.role,
                path: '/packaging/edit'
            });
        }

        const packaging = await Packaging.findByPk(id);
        if (!packaging) {
        req.session.successMessage = 'Packaging not found. The requested packaging could not be found in the system.';
            return res.redirect('/packaging/list');
        }

        // Check if another packaging with same name exists (excluding current packaging)
        const existingPackaging = await Packaging.findOne({
            where: {
                name,
                id: { [Op.ne]: id }
            }
        });

        if (existingPackaging) {
            return res.render('packaging/editPackaging', {
                packaging: { id, name, volume, stock, price },
                error: 'A packaging with this name already exists',
                userRole: req.user.role,
                path: '/packaging/edit'
            });
        }

        // Update packaging
        packaging.name = name;
        packaging.volume = volume;
        packaging.stock = stock;
        packaging.price = price;
        
        await packaging.save();

        req.session.successMessage = `Packaging "${name}" has been updated successfully!`;
        res.redirect('/packaging/list');
    } catch (error) {
        console.error('Error updating packaging:', error);
        res.render('packaging/editPackaging', {
            packaging: { id, name, volume, stock, price },
            error: 'An error occurred while updating the packaging. Please try again.',
            userRole: req.user.role,
            path: '/packaging/edit'
        });
    }
};

exports.deletePackaging = async (req, res) => {
    const { id } = req.params;

    try {
        const packaging = await Packaging.findByPk(id);

        if (!packaging) {
        req.session.successMessage = 'Packaging not found. The requested packaging could not be found in the system.';
            return res.redirect('/packaging/list');
        }

        const packagingName = packaging.name;
        await packaging.destroy();
        
        req.session.successMessage = `Packaging "${packagingName}" has been deleted successfully!`;
        res.redirect('/packaging/list');
    } catch (error) {
        console.error('Error deleting packaging:', error);
        req.session.successMessage = 'Error deleting packaging. Please try again.';
        res.redirect('/packaging/list');
    }
};

exports.showAssignVendor = async (req, res) => {
    const { id } = req.params;

    try {
        const packaging = await Packaging.findByPk(id, {
            include: [{
                model: Vendor,
                through: {
                    model: PackagingVendor,
                    attributes: ['price']
                }
            }]
        });

        if (!packaging) {
            req.session.successMessage = 'Packaging not found. The requested packaging could not be found in the system.';
            return res.redirect('/packaging/list');
        }

        const vendors = await Vendor.findAll();
        const successMessage = req.session.successMessage || null;
        delete req.session.successMessage;

        res.render('packaging/assignVendor', {
            packaging,
            vendors,
            userRole: req.user.role,
            path: '/packaging/assignVendor',
            successMessage
        });
    } catch (error) {
        console.error('Error showing assign vendor page:', error);
        req.session.successMessage = 'Error loading assign vendor page. Please try again.';
        res.redirect('/packaging/list');
    }
};

exports.assignVendor = async (req, res) => {
    const { id } = req.params;
    const { vendorId, price } = req.body;

    try {
        if (!vendorId) {
            req.session.successMessage = 'Please select a vendor to assign.';
            return res.redirect(`/packaging/assignVendor/${id}`);
        }

        // Validate price
        const validPrice = price !== undefined && !isNaN(parseFloat(price)) && parseFloat(price) >= 0;
        if (!validPrice) {
            req.session.successMessage = 'Please enter a valid price (must be a non-negative number).';
            return res.redirect(`/packaging/assignVendor/${id}`);
        }

        const packaging = await Packaging.findByPk(id, {
            include: [{ 
                model: Vendor,
                through: {
                    model: PackagingVendor,
                    attributes: ['price']
                }
            }]
        });
        if (!packaging) {
            req.session.successMessage = 'Packaging not found. The requested packaging could not be found in the system.';
            return res.redirect('/packaging/list');
        }

        const vendor = await Vendor.findByPk(vendorId);
        if (!vendor) {
            req.session.successMessage = 'Vendor not found. The selected vendor could not be found in the system.';
            return res.redirect(`/packaging/assignVendor/${id}`);
        }

        // Check if vendor is already assigned
        const isVendorAssigned = packaging.Vendors.some(v => v.id === parseInt(vendorId));
        if (isVendorAssigned) {
            const vendors = await Vendor.findAll();
            return res.render('packaging/assignVendor', {
                packaging,
                vendors,
                userRole: req.user.role,
                path: '/packaging/assignVendor',
                successMessage: null,
                error: 'This vendor is already assigned to this packaging.'
            });
        }

        // Add vendor with price
        await packaging.addVendor(vendor, { 
            through: { 
                price: parseFloat(price) 
            } 
        });
        
        req.session.successMessage = `Vendor "${vendor.name}" has been assigned to packaging "${packaging.name}" successfully!`;
        res.redirect(`/packaging/assignVendor/${id}`);
    } catch (error) {
        console.error('Error assigning vendor:', error);
        req.session.successMessage = 'Error assigning vendor. Please try again.';
        res.redirect(`/packaging/assignVendor/${id}`);
    }
};

exports.removeVendor = async (req, res) => {
    const { packagingId, vendorId } = req.params;

    try {
        const packaging = await Packaging.findByPk(packagingId);
        if (!packaging) {
            req.session.successMessage = 'Packaging not found. The requested packaging could not be found in the system.';
            return res.redirect('/packaging/list');
        }

        const vendor = await Vendor.findByPk(vendorId);
        if (!vendor) {
            req.session.successMessage = 'Vendor not found. The selected vendor could not be found in the system.';
            return res.redirect(`/packaging/assignVendor/${packagingId}`);
        }

        await packaging.removeVendor(vendor, { through: 'packagingvendor' });
        req.session.successMessage = `Vendor "${vendor.name}" has been removed from packaging "${packaging.name}" successfully!`;
        res.redirect(`/packaging/assignVendor/${packagingId}`);
    } catch (error) {
        console.error('Error removing vendor:', error);
        req.session.successMessage = 'Error removing vendor. Please try again.';
        res.redirect(`/packaging/assignVendor/${packagingId}`);
    }
};

exports.updateVendorPrice = async (req, res) => {
    const { packagingId, vendorId } = req.params;
    const { price } = req.body;

    try {
        // Input validation
        if (!price || isNaN(price) || parseFloat(price) < 0) {
            req.session.successMessage = 'Please enter a valid price (must be a non-negative number).';
            return res.redirect(`/packaging/assignVendor/${packagingId}`);
        }

        const packaging = await Packaging.findByPk(packagingId);
        if (!packaging) {
            req.session.successMessage = 'Packaging not found. The requested packaging could not be found in the system.';
            return res.redirect('/packaging/list');
        }

        const vendor = await Vendor.findByPk(vendorId);
        if (!vendor) {
            req.session.successMessage = 'Vendor not found. The selected vendor could not be found in the system.';
            return res.redirect(`/packaging/assignVendor/${packagingId}`);
        }

        // Find the association record
        const packagingVendor = await PackagingVendor.findOne({
            where: {
                PackagingId: packagingId,
                VendorId: vendorId
            }
        });

        if (!packagingVendor) {
            req.session.successMessage = 'Vendor is not assigned to this packaging.';
            return res.redirect(`/packaging/assignVendor/${packagingId}`);
        }

        // Update the price
        packagingVendor.price = parseFloat(price);
        await packagingVendor.save();

        req.session.successMessage = `Price for vendor "${vendor.name}" has been updated successfully!`;
        res.redirect(`/packaging/assignVendor/${packagingId}`);
    } catch (error) {
        console.error('Error updating vendor price:', error);
        req.session.successMessage = 'Error updating vendor price. Please try again.';
        res.redirect(`/packaging/assignVendor/${packagingId}`);
    }
};
