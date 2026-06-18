const Vendor = require('../models/vendor');

exports.getAddVendorForm = (req, res) => {
    const userRole = req.user.role;
    res.render('ppic/addVendor', {
        userRole,
        path: '/ppic/addVendor'
    });
};

exports.addVendor = async (req, res) => {
    const { name, address, contact } = req.body;

    try {
        const newVendor = await Vendor.create({ name, address, contact });
        res.redirect('/dashboard/purchase');
    } catch (error) {
        console.error('Error adding vendor:', error);
        res.status(400).send(error);
    }
};

// Function to render the vendor list
exports.getVendorList = async (req, res) => {
    try {
        const vendors = await Vendor.findAll();
        const userRole = req.user.role;
        res.render('ppic/vendorList', { 
            vendors, 
            userRole,
            path: '/vendorList'
        });
    } catch (error) {
        console.error('Error fetching vendors:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Function to render the edit vendor form
exports.getEditVendorForm = async (req, res) => {
    const { id } = req.params;
    try {
        const vendor = await Vendor.findByPk(id);
        const userRole = req.user.role;
        if (!vendor) {
            return res.status(404).send('Vendor not found');
        }
        res.render('ppic/editVendor', { 
            vendor, 
            userRole,
            path: '/ppic/editVendor'
        });
    } catch (error) {
        console.error('Error fetching vendor:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Function to handle the form submission for editing a vendor
exports.postEditVendor = async (req, res) => {
    const { id } = req.params;
    const { name, address, contact } = req.body;
    try {
        const vendor = await Vendor.findByPk(id);
        if (!vendor) {
            return res.status(404).send('Vendor not found');
        }
        vendor.name = name;
        vendor.address = address;
        vendor.contact = contact;
        await vendor.save();
        res.redirect('/vendorList');
    } catch (error) {
        console.error('Error updating vendor:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Function to delete a vendor
exports.deleteVendor = async (req, res) => {
    const { id } = req.params;
    const userRole = req.user.role;
    try {
        const vendor = await Vendor.findByPk(id);
        if (!vendor) {
            return res.status(404).send('Vendor not found');
        }
        await vendor.destroy();
        res.redirect('/vendorList');
    } catch (error) {
        console.error('Error deleting vendor:', error);
        
        // Check if it's a foreign key constraint error
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            // Re-fetch vendors for the list view
            const vendors = await Vendor.findAll();
            return res.render('ppic/vendorList', {
                vendors,
                userRole,
                error: 'Cannot delete this vendor because they are associated with existing raw material requests.',
                path: '/vendorList'
            });
        }
        
        // For other errors
        const vendors = await Vendor.findAll();
        res.render('ppic/vendorList', {
            vendors,
            userRole,
            error: 'An error occurred while deleting the vendor.',
            path: '/vendorList'
        });
    }
};
