const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const ProductionBatch = require('./productionBatch');

const OverheadCalculation = sequelize.define('OverheadCalculation', {
    batchId: {
        type: DataTypes.INTEGER,
        references: {
            model: ProductionBatch,
            key: 'id'
        },
        allowNull: false
    },
    totalOverheadCost: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    overheadCostPerUnit: {
        type: DataTypes.FLOAT, // cost per Kg/L
        allowNull: false
    }
});

module.exports = OverheadCalculation;