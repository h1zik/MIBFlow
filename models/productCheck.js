const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Product = require('./product');

const ProductCheck = sequelize.define('ProductCheck', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Products',
            key: 'id'
        }
    },
    productName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    qcStatus: {
        type: DataTypes.STRING,
        allowNull: false
    },
    qcComment: {
        type: DataTypes.TEXT,
        allowNull: true
    }
});

module.exports = ProductCheck;
