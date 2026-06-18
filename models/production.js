const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Product = require('./product');
const RawMaterial = require('./rawMaterial');
const Tank = require('./tank');
const ProductionRequest = require('./productionRequest');

const Production = sequelize.define('Production', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    batchNumber: {
        type: DataTypes.STRING,
        allowNull: true
    },
    startDate: {
        type: DataTypes.DATE,
        allowNull: false
    },
    deadlineDate: {
        type: DataTypes.DATE,
        allowNull: false
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Products',
            key: 'id'
        }
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    loss: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Scheduled'
    },
    qcStatus: {
        type: DataTypes.STRING,
        allowNull: true
    },
    qcComment: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    stockUpdated: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    stirSequence: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    sampleRetained: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    retainedSampleVolume: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    expiredDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    noRack: {
        type: DataTypes.STRING,
        allowNull: true
    },
    productionRequestId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'ProductionRequests',
            key: 'id'
        }
    },
    formula: {
        type: DataTypes.STRING,
        allowNull: true
    },
    rawMaterialAdded: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    rawMaterialChoice: {
        type: DataTypes.ENUM('pending', 'add', 'skip'),
        defaultValue: 'pending'
    },
    bgscan: {
        type: DataTypes.STRING,
        allowNull: true
    },
    isPrinted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
});

const ProductionRawMaterial = sequelize.define('ProductionRawMaterial', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    ProductionId: {
        type: DataTypes.INTEGER,
        references: {
            model: 'Productions',
            key: 'id'
        }
    },
    RawMaterialId: {
        type: DataTypes.INTEGER,
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

module.exports = { Production, ProductionRawMaterial };
