'use strict';

/**
 * Enforce unique Sales Order numbers.
 *
 * The SO number used to be derived from the order with the most-recent `createdAt`,
 * so editing an order's date (or its SO number) could make the counter repeat a
 * number already in use — producing duplicate sonumbers. Before adding the unique
 * index we renumber any existing duplicates to the next free sequence for their
 * month/year so the constraint can be applied without failing on legacy data.
 */
module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      'SELECT id, sonumber FROM `Orders` ORDER BY id ASC'
    );

    const parse = (so) => {
      const m = /^(\d+)(\/SO\/MIB\/.+)$/.exec(so || '');
      return m ? { seq: parseInt(m[1], 10), suffix: m[2] } : null;
    };

    // Highest sequence already used per "/SO/MIB/<month>/<yy>" suffix.
    const maxBySuffix = {};
    for (const { sonumber } of rows) {
      const p = parse(sonumber);
      if (p) maxBySuffix[p.suffix] = Math.max(maxBySuffix[p.suffix] || 0, p.seq);
    }

    const seen = new Set();
    for (const { id, sonumber } of rows) {
      const p = parse(sonumber);
      if (p && !seen.has(sonumber)) {
        seen.add(sonumber); // first (canonical) occurrence — keep it
        continue;
      }
      if (!p) continue; // non-conforming value — leave it untouched
      // Duplicate → assign the next free number for its suffix.
      const next = (maxBySuffix[p.suffix] || 0) + 1;
      maxBySuffix[p.suffix] = next;
      const newSo = `${String(next).padStart(3, '0')}${p.suffix}`;
      seen.add(newSo);
      await queryInterface.sequelize.query(
        'UPDATE `Orders` SET sonumber = ? WHERE id = ?',
        { replacements: [newSo, id] }
      );
    }

    // Idempotent: skip if the unique index already exists. This dev DB was built via
    // sequelize.sync() (empty SequelizeMeta), so the constraint may have been applied
    // out-of-band; guarding here keeps a later `sequelize-cli db:migrate` from failing.
    const [existing] = await queryInterface.sequelize.query(
      "SELECT 1 FROM information_schema.STATISTICS " +
      "WHERE table_schema = DATABASE() AND table_name = 'Orders' " +
      "AND index_name = 'orders_sonumber_unique' LIMIT 1"
    );
    if (existing.length === 0) {
      await queryInterface.addConstraint('Orders', {
        fields: ['sonumber'],
        type: 'unique',
        name: 'orders_sonumber_unique',
      });
    }
  },

  async down(queryInterface) {
    const [existing] = await queryInterface.sequelize.query(
      "SELECT 1 FROM information_schema.STATISTICS " +
      "WHERE table_schema = DATABASE() AND table_name = 'Orders' " +
      "AND index_name = 'orders_sonumber_unique' LIMIT 1"
    );
    if (existing.length > 0) {
      await queryInterface.removeConstraint('Orders', 'orders_sonumber_unique');
    }
  },
};
