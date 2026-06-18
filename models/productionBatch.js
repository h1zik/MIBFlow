const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductionBatch = sequelize.define('ProductionBatch', {
    productName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    batchSize: {
        type: DataTypes.FLOAT, // in Kg/L
        allowNull: false
    },
    productionTime: {
        type: DataTypes.FLOAT, // in hours
        allowNull: false
    }
});

module.exports = ProductionBatch;
