const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductionRequestPackaging = sequelize.define('ProductionRequestPackaging', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    productionRequestId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    packagingId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
});

module.exports = ProductionRequestPackaging;
