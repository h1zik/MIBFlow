const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const {Production, ProductionRawMaterial} = require('./production');
const Tank = require('./tank');

const ProductionTank = sequelize.define('ProductionTank', {
    ProductionId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: {
            model: Production,
            key: 'id'
        }
    },
    TankId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: {
            model: Tank,
            key: 'id'
        }
    }
}, {
    timestamps: true
});

Production.belongsToMany(Tank, { through: ProductionTank });
Tank.belongsToMany(Production, { through: ProductionTank });

module.exports = ProductionTank;
