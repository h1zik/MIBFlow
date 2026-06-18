const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ComplainItemRawMaterial = sequelize.define('ComplainItemRawMaterial', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    complainItemId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'ComplainItems',
            key: 'id'
        }
    },
    rawMaterialName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    unit: {
        type: DataTypes.STRING,
        allowNull: false
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
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

module.exports = ComplainItemRawMaterial;
