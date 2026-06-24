/**
 * Seeder akun: membuat satu user untuk tiap role di MIBFlow.
 * Idempotent — aman dijalankan berulang (akun yang sudah ada di-skip,
 * password tidak ditimpa). Jalankan: `node seeders/seedUsers.js`
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const { ROLE_DASHBOARDS } = require('../utils/roleRoutes');
const User = require('../models/user');

// username (tanpa spasi) per role + password dev seragam.
const DEV_PASSWORD = 'password123';
const ACCOUNTS = [
    { role: 'Marketing',              username: 'marketing' },
    { role: 'PPIC',                   username: 'ppic' },
    { role: 'Finance',                username: 'finance' },
    { role: 'Production',             username: 'production' },
    { role: 'R&D',                    username: 'rnd' },
    { role: 'Raw Material Warehouse', username: 'rawmaterial' },
    { role: 'QC',                     username: 'qc' },
    { role: 'Product Warehouse',      username: 'productwarehouse' },
    { role: 'Purchase',              username: 'purchase' },
];

(async () => {
    try {
        await sequelize.authenticate();
        await User.sync(); // pastikan tabel ada

        const hashed = await bcrypt.hash(DEV_PASSWORD, 10);

        for (const acc of ACCOUNTS) {
            // Validasi role memang dikenal aplikasi
            if (!ROLE_DASHBOARDS[acc.role]) {
                console.warn(`SKIP (role tak dikenal): ${acc.role}`);
                continue;
            }
            const [user, created] = await User.findOrCreate({
                where: { username: acc.username },
                defaults: { role: acc.role, password: hashed },
            });
            console.log(`${created ? 'CREATED' : 'EXISTS '}  ${acc.username.padEnd(18)} role="${acc.role}"`);
        }

        console.log(`\nSemua akun memakai password: ${DEV_PASSWORD}`);
        await sequelize.close();
        process.exit(0);
    } catch (err) {
        console.error('Seed error:', err.message);
        process.exit(1);
    }
})();
