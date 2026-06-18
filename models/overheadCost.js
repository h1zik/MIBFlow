const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OverheadCost = sequelize.define('OverheadCost', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    totalEquipmentCost: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    rentCostPerHour: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    indirectLaborCostPerHour: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    directLaborCostPerHour: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    insuranceCostMonthly: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    utilitiesCostMonthly: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    handlingPerBatch: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
    transportPerBatch: {
        type: DataTypes.FLOAT,
        allowNull: false,
    },
});

module.exports = OverheadCost;
