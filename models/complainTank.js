const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Tank = require('./tank');
const Complain = require('./complain');

const ComplainTank = sequelize.define('ComplainTank', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    complainId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Complains',
            key: 'id'
        }
    },
    tankId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Tanks',
            key: 'id'
        }
    }
});


module.exports = ComplainTank;
