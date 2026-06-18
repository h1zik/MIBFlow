const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Inbound = sequelize.define('Inbound', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    date: {
        type: DataTypes.DATE,
        allowNull: false
    },
    poSoNumber: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'po_so_number'
    },
    batchNumber: {
        type: DataTypes.STRING,
        allowNull: true,
        field: 'batch_number'
    },
    item: {
        type: DataTypes.STRING,
        allowNull: true
    },
    vendor: {
        type: DataTypes.STRING,
        allowNull: true
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    expiredDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'expired_date'
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

module.exports = Inbound;
