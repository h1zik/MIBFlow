/**
 * Seeder opsi kemasan (Packaging) untuk MIBFlow.
 * Idempotent — aman dijalankan berulang (nama yang sudah ada di-skip).
 * Jalankan: `node seeders/seedPackaging.js`
 *
 * Catatan: stock & price sengaja 0 — ini hanya definisi "opsi" kemasan.
 * Stok diisi lewat Raw Material Warehouse, harga lewat Purchase.
 */
require('dotenv').config();
const sequelize = require('../config/database');
const Packaging = require('../models/packaging');

// name, volume (liter)
const PACKAGINGS = [
    { name: 'Botol 1 L',        volume: 1 },
    { name: 'Jerigen 5 L',      volume: 5 },
    { name: 'Pail 10 L',        volume: 10 },
    { name: 'Pail 18 L',        volume: 18 },
    { name: 'Jerigen 20 L',     volume: 20 },
    { name: 'Jerigen 25 L',     volume: 25 },
    { name: 'Jerigen 30 L',     volume: 30 },
    { name: 'Drum Plastik 200 L', volume: 200 },
    { name: 'Drum Besi 200 L',  volume: 200 },
    { name: 'IBC Tank 1000 L',  volume: 1000 },
];

(async () => {
    try {
        await sequelize.authenticate();
        await Packaging.sync(); // pastikan tabel ada

        for (const pkg of PACKAGINGS) {
            const [record, created] = await Packaging.findOrCreate({
                where: { name: pkg.name },
                defaults: { volume: pkg.volume, stock: 0, price: 0 },
            });
            console.log(`${created ? 'CREATED' : 'EXISTS '}  ${pkg.name.padEnd(22)} ${pkg.volume} L`);
        }

        console.log(`\nSelesai. Total opsi kemasan: ${PACKAGINGS.length}.`);
        await sequelize.close();
        process.exit(0);
    } catch (err) {
        console.error('Seed error:', err.message);
        process.exit(1);
    }
})();
