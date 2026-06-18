const Consumable = require('../models/consumable');

exports.renderConsumablesPage = async (req, res) => {
    try {
        const consumables = await Consumable.findAll();
        const userRole = req.user.role;
        res.render('consumable/consumables', { 
            consumables, 
            userRole,
            path: '/finance/consumables'
        });
    } catch (error) {
        console.error('Error fetching consumables:', error.message);
        res.status(500).send('An error occurred while fetching consumables.');
    }
};

exports.updateConsumablePrice = async (req, res) => {
    try {
        const { id } = req.params;
        const { newFee } = req.body;

        // Validate the fee
        if (!newFee || isNaN(parseFloat(newFee)) || parseFloat(newFee) < 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid fee value'
            });
        }

        // Update the consumable in the database
        await Consumable.update({ fee: parseFloat(newFee) }, { where: { id } });

        res.json({
            success: true,
            message: 'Price updated successfully',
            newFee: parseFloat(newFee)
        });
    } catch (error) {
        console.error('Error updating consumable price:', error.message);
        res.status(500).json({
            success: false,
            message: `An error occurred while updating the price: ${error.message}`
        });
    }
};
