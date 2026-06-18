const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PackagingRequest = sequelize.define('PackagingRequest', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    orderId: {
        type: DataTypes.INTEGER,
        references: {
            model: 'Orders',
            key: 'id'
        },
        allowNull: true
    },
    packagingId: {
        type: DataTypes.INTEGER,
        references: {
            model: 'Packagings',
            key: 'id'
        },
        allowNull: false
    },
    packagingName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    realQuantity: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Pending'
    },
    qcStatus: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Pending'
    },
    qcComment: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    vendorId: {
        type: DataTypes.INTEGER,
        references: {
            model: 'Vendors',
            key: 'id'
        },
        allowNull: true
    }
});

module.exports = PackagingRequest;
