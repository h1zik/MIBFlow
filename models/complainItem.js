const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ComplainItem = sequelize.define('ComplainItem', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    complainId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Complains',
            key: 'id'
        }
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Products',
            key: 'id'
        }
    },
    product: {
        type: DataTypes.STRING,
        allowNull: false
    },
    quantityRejected: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1,
            isInt: true
        }
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'Pending',
        allowNull: false
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

module.exports = ComplainItem;
