const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Product = require('./product');

const FormulaRequest = sequelize.define('FormulaRequest', {
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
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Pending'
    }
});

module.exports = FormulaRequest;
