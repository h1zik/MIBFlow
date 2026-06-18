const RawMaterial = require('../models/rawMaterial');
const Vendor = require('../models/vendor');
const RawMaterialVendor = require('../models/rawMaterialVendor');


exports.getRawMaterialStock = async (req, res) => {
    try {
        const rawMaterials = await RawMaterial.findAll({
            include: [{
                model: Vendor,
                through: {
                    model: RawMaterialVendor,
                    attributes: ['price']
                },
                required: false
            }]
        });
        
        // Debug vendor pricing data in more detail
        console.log('Raw material vendor data:', rawMaterials.map(m => ({
            id: m.id,
            name: m.name,
            vendors: m.Vendors ? m.Vendors.map(v => ({
                name: v.name,
                vendorData: v.RawMaterialVendor ? {
                    price: v.RawMaterialVendor.price,
                    dataValues: v.RawMaterialVendor.dataValues
                } : 'No join data'
            })) : 'No vendors'
        })));
        
        // Process the data to ensure vendor prices are accessible
        rawMaterials.forEach(material => {
            if (material.Vendors && material.Vendors.length > 0) {
                material.Vendors.forEach(vendor => {
                    if (vendor.RawMaterialVendor && vendor.RawMaterialVendor.dataValues) {
                        // Ensure price is accessible
                        vendor.vendorPrice = vendor.RawMaterialVendor.dataValues.price;
                    }
                });
            }
        });
        
        const userRole = req.user.role;
        res.status(200).render('products/listRawMaterial', { 
            rawMaterials,
            userRole,
            path: '/rawMaterials/rawMaterialStock'
        });
    } catch (error) {
        res.status(400).send(error);
    }
};

// Render the edit page
exports.editRawMaterial = async (req, res) => {
    const { id } = req.params;
    try {
        const rawMaterial = await RawMaterial.findByPk(id);
        const userRole = req.user.role;
        if (!rawMaterial) {
            return res.status(404).send('Raw Material not found');
        }
        res.render('products/editRawMaterial', { 
            rawMaterial, 
            userRole,
            path: '/rawMaterials/edit'
        });
    } catch (error) {
        console.error('Error fetching raw material:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Handle the update
exports.updateRawMaterial = async (req, res) => {
    const { id } = req.params;
    const { stock, price, density } = req.body;

    try {
        const rawMaterial = await RawMaterial.findByPk(id);
        if (!rawMaterial) {
            return res.status(404).send('Raw Material not found');
        }

        // Update based on user role
        if (req.user.role === 'Raw Material Warehouse') {
            // Validate stock and density for Raw Material Warehouse role
            if (stock < 0) {
                return res.status(400).send('Stock cannot be negative');
            }
            if (density <= 0) {
                return res.status(400).send('Density must be greater than 0');
            }
            rawMaterial.stock = stock;
            rawMaterial.density = density;
        } else if (req.user.role === 'Purchase') {
            // Validate price for Purchase role
            if (price < 0) {
                return res.status(400).send('Price cannot be negative');
            }
            rawMaterial.price = price;
        }

        await rawMaterial.save();
        res.redirect('/rawMaterials/rawMaterialStock');
    } catch (error) {
        console.error('Error updating raw material:', error);
        res.status(500).send('Internal Server Error');
    }
};


exports.deleteRawMaterial = async (req, res) => {
    const { id } = req.params;
    const userRole = req.user.role;

    try {
        const rawMaterial = await RawMaterial.findByPk(id);
        if (!rawMaterial) {
            return res.status(404).send('Raw Material not found');
        }

        await rawMaterial.destroy();
        res.redirect('/rawMaterials/rawMaterialStock');
    } catch (error) {
        console.error('Error deleting raw material:', error);
        
        // Check if it's a foreign key constraint error
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            const rawMaterials = await RawMaterial.findAll();
            return res.render('products/listRawMaterial', {
                rawMaterials,
                userRole,
                error: 'Cannot delete this raw material because it is being used in product formulas or has pending requests.',
                path: '/rawMaterials/rawMaterialStock'
            });
        }
        
        // For other errors
        const rawMaterials = await RawMaterial.findAll();
        res.render('products/listRawMaterial', {
            rawMaterials,
            userRole,
            error: 'An error occurred while deleting the raw material.',
            path: '/rawMaterials/rawMaterialStock'
        });
    }
};

exports.assignVendorPage = async (req, res) => {
    try {
        // Include the RawMaterialVendor join table to get the price information
        const rawMaterial = await RawMaterial.findByPk(req.params.id, {
            include: [{
                model: Vendor,
                through: {
                    model: RawMaterialVendor,
                    attributes: ['price']
                }
            }]
        });
        
        if (!rawMaterial) {
            return res.status(404).send('Raw Material not found');
        }
        
        const vendors = await Vendor.findAll();
        
        res.render('products/assignVendor', { 
            rawMaterial, 
            vendors,
            userRole: req.user.role,
            path: '/rawMaterials/assignVendor'
        });
    } catch (error) {
        console.error('Error loading assign vendor page:', error);
        res.status(500).send('Error loading assign vendor page. Please try again.');
    }
};

exports.assignVendor = async (req, res) => {
    const { vendorId, price } = req.body;
    const rawMaterialId = req.params.id;

    try {
        // Check if vendor is already assigned
        const existingAssignment = await RawMaterialVendor.findOne({
            where: {
                rawMaterialId: rawMaterialId,
                vendorId: vendorId
            }
        });

        if (existingAssignment) {
            // Get raw material and vendor data for re-rendering the page
            const rawMaterial = await RawMaterial.findByPk(rawMaterialId, {
                include: Vendor
            });
            const vendors = await Vendor.findAll();

            // Re-render the page with error message
            return res.render('products/assignVendor', {
                rawMaterial,
                vendors,
                userRole: req.user.role,
                path: '/rawMaterials/assignVendor',
                error: 'This vendor is already assigned to this raw material.'
            });
        }

        // If no existing assignment, create new one with price
        await RawMaterialVendor.create({
            rawMaterialId: rawMaterialId,
            vendorId,
            price: price || 0
        });

        res.redirect(`/rawMaterials/assignVendor/${rawMaterialId}`);
    } catch (error) {
        console.error('Error assigning vendor:', error);
        res.status(500).send('Error assigning vendor. Please try again.');
    }
};

exports.removeVendor = async (req, res) => {
    await RawMaterialVendor.destroy({
        where: {
            rawMaterialId: req.params.rawMaterialId,
            vendorId: req.params.vendorId
        }
    });
    res.redirect(`/rawMaterials/assignVendor/${req.params.rawMaterialId}`);
};

exports.testUpdateVendorPrice = async (req, res) => {
    const { rawMaterialId, vendorId } = req.params;
    const { price } = req.body;
    
    console.log('Test route called:', { rawMaterialId, vendorId, price, body: req.body });
    
    // Just return a success message without doing any database operations
    res.send('Test route successful');
};

exports.updateVendorPrice = async (req, res) => {
    try {
        const { rawMaterialId, vendorId } = req.params;
        const { price } = req.body;
        
        console.log('Updating price:', { rawMaterialId, vendorId, price, body: req.body });

        // Find the existing assignment
        const assignment = await RawMaterialVendor.findOne({
            where: {
                rawMaterialId,
                vendorId
            }
        });

        if (!assignment) {
            console.log('Assignment not found');
            return res.status(404).send('Vendor assignment not found');
        }

        // Update the price
        assignment.price = price;
        await assignment.save();
        console.log('Price updated successfully');

        // Redirect back to the assign vendor page
        res.redirect(`/rawMaterials/assignVendor/${rawMaterialId}`);
    } catch (error) {
        console.error('Error updating vendor price:', error);
        res.status(500).send('Error updating vendor price. Please try again.');
    }
};
