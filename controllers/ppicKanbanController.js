// PPIC Kanban — permanent delete of a card's underlying record (+ owned children).
// All deletions run inside a transaction; child rows are removed bottom-up so
// foreign-key constraints are respected.
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

// Maps the short card-key prefix used in the Kanban to a delete routine.
// Each routine receives (id, transaction) and performs the cascade.
const DELETERS = {
    // Orders: detach nullable children (keep their work), remove owned order items.
    async order(id, t) {
        const [complains] = await sequelize.query(
            'SELECT COUNT(*) AS n FROM Complains WHERE orderId = :id',
            { replacements: { id }, type: QueryTypes.SELECT, transaction: t }
        );
        if (complains && Number(complains.n) > 0) {
            throw new Error('Order ini punya complaint terkait — selesaikan/hapus complaint dulu.');
        }
        await sequelize.query('DELETE FROM OrderItems WHERE orderId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('UPDATE ProductionRequests SET orderId = NULL WHERE orderId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('UPDATE RawMaterialRequests SET orderId = NULL WHERE orderId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('UPDATE PackagingRequests SET orderId = NULL WHERE orderId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('DELETE FROM Orders WHERE id = :id', { replacements: { id }, transaction: t });
    },

    // Single production batch + its raw-material/tank links.
    async production(id, t) {
        await sequelize.query('DELETE FROM ProductionRawMaterials WHERE ProductionId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('DELETE FROM ProductionTanks WHERE ProductionId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('DELETE FROM Productions WHERE id = :id', { replacements: { id }, transaction: t });
    },

    // Production request + its productions (and their children) + material/packaging lines.
    async ['production-request'](id, t) {
        await sequelize.query('DELETE FROM ProductionRawMaterials WHERE ProductionId IN (SELECT id FROM Productions WHERE productionRequestId = :id)', { replacements: { id }, transaction: t });
        await sequelize.query('DELETE FROM ProductionTanks WHERE ProductionId IN (SELECT id FROM Productions WHERE productionRequestId = :id)', { replacements: { id }, transaction: t });
        await sequelize.query('DELETE FROM Productions WHERE productionRequestId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('DELETE FROM ProductionRequestPackagings WHERE productionRequestId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('DELETE FROM ProductionRequestRawMaterials WHERE productionRequestId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('DELETE FROM ProductionRequests WHERE id = :id', { replacements: { id }, transaction: t });
    },

    async ['raw-material-request'](id, t) {
        await sequelize.query('DELETE FROM RawMaterialRequestVendors WHERE rawMaterialRequestId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('DELETE FROM RawMaterialReturnNoReturns WHERE rawMaterialRequestId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('DELETE FROM RawMaterialRequests WHERE id = :id', { replacements: { id }, transaction: t });
    },

    async ['packaging-request'](id, t) {
        await sequelize.query('DELETE FROM PackagingRequestVendors WHERE packagingRequestId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('DELETE FROM PackagingReturnNoReturns WHERE packagingRequestId = :id', { replacements: { id }, transaction: t });
        await sequelize.query('DELETE FROM PackagingRequests WHERE id = :id', { replacements: { id }, transaction: t });
    },

    async ['formula-request'](id, t) {
        await sequelize.query('DELETE FROM FormulaRequests WHERE id = :id', { replacements: { id }, transaction: t });
    },

    async ['product-check'](id, t) {
        await sequelize.query('DELETE FROM ProductChecks WHERE id = :id', { replacements: { id }, transaction: t });
    },
};

exports.deleteKanbanCard = async (req, res) => {
    const { type, id } = req.params;
    const numericId = parseInt(id, 10);

    if (!DELETERS[type]) {
        return res.status(400).json({ success: false, message: 'Tipe kartu tidak dikenal.' });
    }
    if (!Number.isInteger(numericId) || numericId <= 0) {
        return res.status(400).json({ success: false, message: 'ID tidak valid.' });
    }

    const t = await sequelize.transaction();
    try {
        await DELETERS[type](numericId, t);
        await t.commit();
        return res.json({ success: true });
    } catch (error) {
        await t.rollback();
        console.error(`Error deleting kanban card (${type} #${id}):`, error.message);
        return res.status(500).json({ success: false, message: error.message || 'Gagal menghapus.' });
    }
};
