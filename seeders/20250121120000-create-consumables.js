'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.bulkInsert('Consumables', [
            { name: 'Sticker', fee: 500, createdAt: new Date(), updatedAt: new Date() },
            { name: 'Pallet', fee: 1000, createdAt: new Date(), updatedAt: new Date() },
            { name: 'Wrap', fee: 200, createdAt: new Date(), updatedAt: new Date() },
            { name: 'Handling', fee: 1500, createdAt: new Date(), updatedAt: new Date() },
            { name: 'Logistic', fee: 2500, createdAt: new Date(), updatedAt: new Date() },
            { name: 'Triplek', fee: 300, createdAt: new Date(), updatedAt: new Date() },
            { name: 'Peti', fee: 1200, createdAt: new Date(), updatedAt: new Date() },
            { name: 'Kabel Ties', fee: 100, createdAt: new Date(), updatedAt: new Date() },
        ]);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.bulkDelete('Consumables', null, {});
    },
};
