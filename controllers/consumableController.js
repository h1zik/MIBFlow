const Consumable = require('../models/consumable');

// Canonical consumable types — these mirror the order flags shown in Order History
// (Order Details: Pallet, Sticker, Wrap, Handling, Logistic, Triplek, Peti, Kabel Ties).
// A consumable's name must normalize to one of these so it links to the matching order
// flag when consumable totals are computed.
const CONSUMABLE_TYPES = ['Pallet', 'Sticker', 'Wrap', 'Handling', 'Logistic', 'Triplek', 'Peti', 'Kabel Ties'];
const normalizeName = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

exports.renderConsumablesPage = async (req, res) => {
    try {
        const consumables = await Consumable.findAll();
        const existing = new Set(consumables.map(c => normalizeName(c.name)));
        const availableTypes = CONSUMABLE_TYPES.filter(t => !existing.has(normalizeName(t)));
        res.render('consumable/consumables', {
            consumables,
            availableTypes,
            userRole: req.user.role,
            path: '/finance/consumables'
        });
    } catch (error) {
        console.error('Error fetching consumables:', error.message);
        res.status(500).send('An error occurred while fetching consumables.');
    }
};

exports.addConsumable = async (req, res) => {
    try {
        const { name, fee } = req.body;
        const parsedFee = parseFloat(fee);

        // Only allow the known Order-History consumable types.
        if (!name || !CONSUMABLE_TYPES.includes(name)) {
            req.flash('error', 'Please choose a valid consumable type.');
            return res.redirect('/finance/consumables');
        }
        if (isNaN(parsedFee) || parsedFee < 0) {
            req.flash('error', 'Please enter a valid fee (0 or greater).');
            return res.redirect('/finance/consumables');
        }

        // Prevent duplicates (match by normalized name).
        const existing = await Consumable.findAll();
        if (existing.some(c => normalizeName(c.name) === normalizeName(name))) {
            req.flash('error', `Consumable "${name}" already exists.`);
            return res.redirect('/finance/consumables');
        }

        await Consumable.create({ name, fee: parsedFee });
        req.flash('success', `Consumable "${name}" added successfully.`);
        res.redirect('/finance/consumables');
    } catch (error) {
        console.error('Error adding consumable:', error.message);
        req.flash('error', 'An error occurred while adding the consumable.');
        res.redirect('/finance/consumables');
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
