const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const FormulaRequest = require('./formulaRequest');

const Product = sequelize.define('Product', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    density: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    stock: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0  // Setting a default value of 0
    },
    price: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0  // Setting a default value of 0
    },
    formula: {
        type: DataTypes.STRING,  // This will store the path to the formula file
        allowNull: true
    },
    tds: { // New column for TDS file path
        type: DataTypes.STRING,
        allowNull: true
    },
    msds: { // New column for MSDS file path
        type: DataTypes.STRING,
        allowNull: true
    }

});

Product.hasMany(FormulaRequest, {
    foreignKey: 'productId',
    onDelete: 'CASCADE' // Enables cascade delete
});
FormulaRequest.belongsTo(Product, { foreignKey: 'productId' });

module.exports = Product;
