const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Packaging = require('./packaging');
const Product = require('./product');

const OrderItem = sequelize.define('OrderItem', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    total: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    unit: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    satuan: { // New column to store the unit of measurement
        type: DataTypes.ENUM('L', 'KG'), // Liters or Kilograms
        allowNull: false
    },
    sentQuantity: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0
    },
    packagingId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Packaging,
            key: 'id'
        }
    },
    invoicedQuantity: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0
    },
    shippedQuantity: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0
    }
});

module.exports = OrderItem;
