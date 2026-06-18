const Tank = require('../models/tank');

exports.addTankForm = (req, res) => {
    const userRole = req.user.role;
    res.render('tank/addTank', {
        userRole,
        path: '/tank/add'
    });
};

exports.addTank = async (req, res) => {
    const { name, volume } = req.body;
    try {
        await Tank.create({ name, volume });
        res.redirect('/dashboard/production');
    } catch (error) {
        console.error('Error adding tank:', error);
        res.status(500).send('Internal Server Error');
    }
};

exports.tankList = async (req, res) => {
    try {
        const tanks = await Tank.findAll();
        const userRole = req.user.role;
        res.status(200).render('tank/tankList', { 
            tanks, 
            userRole,
            path: '/tank/tankList'
        });
    } catch (error) {
        res.status(400).send(error);
    }
};

// Function to render the edit tank form
exports.getEditTankForm = async (req, res) => {
    const { id } = req.params;
    try {
        const tank = await Tank.findByPk(id);
        const userRole = req.user.role;
        if (!tank) {
            return res.status(404).send('Tank not found');
        }
        res.render('tank/editTank', { 
            tank, 
            userRole,
            path: '/tank/edit'
        });
    } catch (error) {
        console.error('Error fetching tank:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Function to handle the form submission for editing a tank
exports.postEditTank = async (req, res) => {
    const { id } = req.params;
    const { name, volume, price } = req.body;
    try {
        const tank = await Tank.findByPk(id);
        if (!tank) {
            return res.status(404).send('Tank not found');
        }
        tank.name = name;
        tank.volume = volume;
        tank.price = parseFloat(price);  // Update the price
        await tank.save();
        res.redirect('/tank/tankList');
    } catch (error) {
        console.error('Error updating tank:', error);
        res.status(500).send('Internal Server Error');
    }
};


// Function to delete a tank
exports.deleteTank = async (req, res) => {
    const { id } = req.params;
    try {
        const tank = await Tank.findByPk(id);
        if (!tank) {
            return res.status(404).json({ success: false, message: 'Tank not found' });
        }
        await tank.destroy();
        res.json({ success: true, message: 'Tank deleted successfully' });
    } catch (error) {
        console.error('Error deleting tank:', error);
        res.status(500).json({ success: false, message: 'Failed to delete tank' });
    }
};
