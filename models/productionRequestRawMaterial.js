const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const ProductionRequest = require('../models/productionRequest');
const RawMaterial = require('../models/rawMaterial');

const ProductionRequestRawMaterial = sequelize.define('ProductionRequestRawMaterial', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    productionRequestId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'ProductionRequests',
            key: 'id'
        }
    },
    rawMaterialId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'RawMaterials',
            key: 'id'
        }
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: false
    }
});

ProductionRequestRawMaterial.belongsTo(RawMaterial, { foreignKey: 'rawMaterialId' });

module.exports = ProductionRequestRawMaterial;
