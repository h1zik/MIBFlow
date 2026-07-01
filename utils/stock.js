/**
 * Helper terpusat untuk mutasi stok.
 *
 * Semua perubahan stok (RawMaterial, Packaging, Product, dll) sebaiknya lewat sini
 * supaya konsisten: selalu di dalam transaksi, pakai pessimistic lock (LOCK.UPDATE)
 * untuk mencegah race condition / lost update, validasi non-negatif, dan pembulatan
 * yang seragam.
 *
 * Pola lock mengikuti complainController.js (satu-satunya tempat yang sebelumnya benar).
 */

/**
 * Bulatkan kuantitas ke 2 desimal untuk menghindari drift floating point.
 * @param {number} n
 * @returns {number}
 */
function roundQty(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Tambah/kurangi stok sebuah record secara atomic dengan lock.
 *
 * WAJIB dipanggil di dalam transaksi (opts.transaction). Record dibaca ulang
 * dengan LOCK.UPDATE sehingga transaksi lain harus menunggu sampai commit/rollback.
 *
 * @param {import('sequelize').ModelStatic<any>} Model  Model Sequelize (RawMaterial, Packaging, ...)
 * @param {number} id  Primary key record
 * @param {number} delta  Perubahan stok (positif = masuk, negatif = keluar)
 * @param {object} opts
 * @param {import('sequelize').Transaction} opts.transaction  Transaksi aktif (wajib)
 * @param {boolean} [opts.allowNegative=false]  Bila true, izinkan hasil < 0
 * @param {string} [opts.field='stock']  Nama kolom stok
 * @param {boolean} [opts.integer=false]  Bila true, bulatkan hasil ke integer (mis. packaging)
 * @returns {Promise<any>}  Record yang sudah diperbarui & disimpan
 */
async function adjustStock(Model, id, delta, opts = {}) {
    const { transaction, allowNegative = false, field = 'stock', integer = false } = opts;

    if (!transaction) {
        throw new Error('adjustStock harus dipanggil di dalam transaksi (opts.transaction wajib diisi)');
    }

    const numericDelta = Number(delta);
    if (!Number.isFinite(numericDelta)) {
        throw new Error(`adjustStock: delta tidak valid (${delta}) untuk ${Model.name} #${id}`);
    }

    const record = await Model.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
    });

    if (!record) {
        throw new Error(`${Model.name} #${id} tidak ditemukan saat update stok`);
    }

    const current = Number(record[field]) || 0;
    let next = current + numericDelta;
    next = integer ? Math.round(next) : roundQty(next);

    if (next < 0 && !allowNegative) {
        throw new Error(
            `Stok tidak cukup untuk ${Model.name} #${id} (${record.name || ''}): ` +
            `tersedia ${current}, diminta ${-delta}`
        );
    }

    record[field] = next;
    await record.save({ transaction });
    return record;
}

module.exports = { adjustStock, roundQty };
