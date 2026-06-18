// models/productCustomer.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Product = require('./product');
const Customer = require('./customer');

const ProductCustomer = sequelize.define('ProductCustomer', {
    ProductId: {
        type: DataTypes.INTEGER,
        field: 'ProductId',
        references: {
            model: Product,
            key: 'id'
        }
    },
    CustomerId: {
        type: DataTypes.INTEGER,
        field: 'CustomerId',
        references: {
            model: Customer,
            key: 'id'
        }
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
    }
}, {
    timestamps: true,
    tableName: 'ProductCustomer',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
});

module.exports = ProductCustomer;
