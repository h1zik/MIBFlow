const RawMaterialRequestVendor = require('../models/rawMaterialRequestVendor');
const RawMaterialRequest = require('../models/rawMaterialRequest');
const RawMaterial = require('../models/rawMaterial');
const Inbound = require('../models/inbound');
const Vendor = require('../models/vendor');
const sequelize = require('../config/database');

exports.listQuarantinedRawMaterials = async (req, res) => {
    try {
        // Fetch raw material requests that are in quarantine
        const quarantinedRawMaterials = await RawMaterialRequestVendor.findAll({
            where: { status: 'Quarantined' },
            include: [
                { 
                    model: RawMaterialRequest,
                    include: [{ model: RawMaterial }]
                },
                { model: Vendor }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.render('rawMaterialQuarantine/list', {
            quarantinedRawMaterials,
            userRole: req.user.role,
            path: '/raw-material-quarantine/list'
        });
    } catch (error) {
        console.error('Error fetching quarantined raw materials:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Handle destroy action
exports.destroy = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const material = await RawMaterialRequestVendor.findByPk(id, {
            include: [{ 
                model: RawMaterialRequest,
                include: [{ model: RawMaterial }]
            }],
            transaction
        });

        if (!material) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Material not found' });
        }

        // Update status to Destroyed
        await material.update({ status: 'Destroyed' }, { transaction });
        
        await transaction.commit();
        res.json({ message: 'Material marked as destroyed successfully' });
    } catch (error) {
        await transaction.rollback();
        console.error('Error destroying material:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// Handle reuse action
exports.reuse = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const material = await RawMaterialRequestVendor.findByPk(id, {
            include: [{ 
                model: RawMaterialRequest,
                include: [{ model: RawMaterial }]
            }],
            transaction
        });

        if (!material) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Material not found' });
        }

        const rawMaterial = material.RawMaterialRequest.RawMaterial;

        // Only add rejectQuantity to stock if it's greater than 0
        if (material.rejectQuantity > 0) {
            await rawMaterial.update({
                stock: rawMaterial.stock + material.rejectQuantity
            }, { transaction });

            // Create inbound record for reused raw material
            await Inbound.create({
                date: new Date(),
                poSoNumber: material.RawMaterialRequestVendor.ponumber,
                batchNumber: 'N/A',
                item: rawMaterial.name,
                vendor: 'Internal Reuse',
                quantity: material.rejectQuantity,
                expiredDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
                type: 'Raw Material',
                reason: 'Reuse from Quarantine',
                notes: `Reused from quarantined material PO ${material.RawMaterialRequest.ponumber}`
            }, { transaction });
            
            await material.update({ rejectQuantity: 0 }, { transaction });
        }

        // Update status to Completed
        await material.update({ 
            status: 'Completed'
        }, { transaction });

        await transaction.commit();
        res.json({ message: 'Material reused successfully' });
    } catch (error) {
        await transaction.rollback();
        console.error('Error reusing material:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
