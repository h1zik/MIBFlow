/**
 * Konstanta status terpusat.
 *
 * Nilai string SAMA dengan yang sudah dipakai di DB/kode supaya value-preserving
 * (kecuali perbaikan casing yang disengaja, lihat catatan di bawah). Tujuannya
 * menghilangkan typo & "magic string" yang tersebar di banyak controller.
 *
 * Catatan casing: status ComplainItem sebelumnya ditulis 'Ready To Deliver'
 * (huruf T besar), sementara Order memakai 'Ready to Deliver'. Keduanya
 * diseragamkan ke 'Ready to Deliver'.
 */

// Status Order (penjualan)
const ORDER_STATUS = Object.freeze({
    PENDING: 'Pending',
    PROCESSING: 'Processing',
    ON_PRODUCTION: 'On Production',
    PRODUCTION_COMPLETED: 'Production Completed',
    APPROVED: 'Approved',
    PAID: 'Paid',
    READY_TO_DELIVER: 'Ready to Deliver',
    ON_DELIVERY: 'On Delivery',
    PARTIALLY_DELIVERED: 'Partially Delivered',
    DELIVERED: 'Delivered',
    DECLINED: 'Declined',
});

// Status ProductionRequest & Production
const PRODUCTION_STATUS = Object.freeze({
    PENDING: 'Pending',
    SCHEDULED: 'Scheduled',
    IN_PRODUCTION: 'In Production',
    PRINTED: 'Printed',
    COMPLETED: 'Completed',
    APPROVED: 'Approved',
    DECLINED: 'Declined',
});

// Status request raw material / packaging (request & vendor split)
const REQUEST_STATUS = Object.freeze({
    PENDING: 'Pending',
    VENDOR_ASSIGNED: 'Vendor Assigned',
    FORWARDED_TO_FINANCE: 'Forwarded to Finance',
    APPROVED: 'Approved',
    PAID: 'Paid',
    RECEIVED: 'Received',
    QC_TESTING: 'QC Testing',
    COMPLETED: 'Completed',
    QUARANTINED: 'Quarantined',
    RETURNED: 'Returned',
    NO_RETURN: 'No Return',
    DESTROYED: 'Destroyed',
    DECLINED: 'Declined',
});

// Status QC (dipakai di field qcStatus)
const QC_STATUS = Object.freeze({
    PENDING: 'Pending',
    PASS: 'Pass',
    FAIL: 'Fail',
    REJECT_PARTIAL: 'Reject Sebagian',
});

// Status Complain & ComplainItem
const COMPLAIN_STATUS = Object.freeze({
    OPEN: 'Open',
    FORMULA_REQUESTED: 'Formula Requested',
    RAW_MATERIALS_ADDED: 'Raw Materials Added',
    SENT_TO_QC: 'Sent to QC',
    SENT_TO_PRODUCTION: 'Sent to Production',
    SENT_TO_PPIC: 'Sent to PPIC',
    REWORK_APPROVED: 'Rework Approved',
    SCHEDULED: 'Scheduled',
    READY_TO_DELIVER: 'Ready to Deliver',
    REJECTED: 'Rejected',
    COMPLETED: 'Completed',
});

// Order yang masih dalam pipeline produksi (dipakai dashboard PPIC, dll)
const ACTIVE_PRODUCTION_ORDER_STATUSES = Object.freeze([
    ORDER_STATUS.PENDING,
    ORDER_STATUS.ON_PRODUCTION,
    ORDER_STATUS.PRODUCTION_COMPLETED,
]);

module.exports = {
    ORDER_STATUS,
    PRODUCTION_STATUS,
    REQUEST_STATUS,
    QC_STATUS,
    COMPLAIN_STATUS,
    ACTIVE_PRODUCTION_ORDER_STATUSES,
};
