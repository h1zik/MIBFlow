const Customer = require('../models/customer');

exports.getCustomerList = async (req, res) => {
    try {
        const customers = await Customer.findAll();
        const userRole = req.user.role;
        res.render('customers/customerList', { 
            customers, 
            userRole,
            path: '/customers/list'
        });
    } catch (error) {
        console.error('Error fetching customers:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Function to render the edit customer form
exports.getEditCustomerForm = async (req, res) => {
    const { id } = req.params;
    try {
        const customer = await Customer.findByPk(id);
        if (!customer) {
            return res.status(404).send('Customer not found');
        }
        const userRole = req.user.role;
        res.render('customers/editCustomer', { 
            customer, 
            userRole,
            path: '/customers/edit'
        });
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Function to handle the form submission for editing a customer
exports.postEditCustomer = async (req, res) => {
    const { id } = req.params;
    const { name, phone, email, alamat, perusahaan, cp } = req.body;
    try {
        const customer = await Customer.findByPk(id);
        if (!customer) {
            return res.status(404).send('Customer not found');
        }
        customer.name = name;
        customer.phone = phone;
        customer.email = email;
        customer.alamat = alamat;
        customer.perusahaan = perusahaan;
        customer.cp = cp;
        await customer.save();
        res.redirect('/customers/list');
    } catch (error) {
        console.error('Error updating customer:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Function to delete a customer
exports.deleteCustomer = async (req, res) => {
    const { id } = req.params;
    try {
        const customer = await Customer.findByPk(id);
        if (!customer) {
            return res.status(404).send('Customer not found');
        }
        await customer.destroy();
        res.redirect('/customers/list');
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).send('Internal Server Error');
    }
};
