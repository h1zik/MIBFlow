const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Outbound = sequelize.define('Outbound', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    date: {
        type: DataTypes.DATE,
        allowNull: false
    },
    soPrn: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'so_prn'
    },
    batchNumber: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'batch_number'
    },
    customer: {
        type: DataTypes.STRING,
        allowNull: true
    },
    packagingId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'packaging_id'
    },
    product: {
        type: DataTypes.STRING,
        allowNull: true
    },
    item: {
        type: DataTypes.STRING,
        allowNull: true
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    type: {
        type: DataTypes.STRING,
        allowNull: true
    },
    reason: {
        type: DataTypes.STRING,
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    }
});

module.exports = Outbound;
