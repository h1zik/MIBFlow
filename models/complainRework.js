const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ComplainRework = sequelize.define('ComplainRework', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    complainItemId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'ComplainItems',
            key: 'id'
        }
    },
    startDate: {
        type: DataTypes.DATE,
        allowNull: false
    },
    deadlineDate: {
        type: DataTypes.DATE,
        allowNull: false
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 0
        }
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Scheduled'
    },
    batchNumber: {
        type: DataTypes.STRING,
        allowNull: true
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
        allowNull: false,
        defaultValue: 1
    },
    sampleRetained: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    retainedSampleVolume: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    rackNumber: {
        type: DataTypes.STRING,
        allowNull: true
    },
    expiryDate: {
        type: DataTypes.DATE,
        allowNull: true
    },
    rawMaterialAdded: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    rawMaterialChoice: {
        type: DataTypes.ENUM('pending', 'add', 'skip'),
        defaultValue: 'pending',
    },
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

module.exports = ComplainRework;
