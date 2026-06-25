const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Relational record of a consumable selected on an order. Replaces the fixed 8
// boolean columns on Order so any consumable type Finance adds flows through to
// the order, its detail/history view, and the invoice. Name + fee are snapshotted
// at order time so historical orders are unaffected by later catalog/fee changes.
const OrderConsumable = sequelize.define('OrderConsumable', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    orderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Orders', key: 'id' }
    },
    consumableId: {
        type: DataTypes.INTEGER,
        allowNull: true // reference only; display relies on the snapshot below
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    fee: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    }
});

module.exports = OrderConsumable;
