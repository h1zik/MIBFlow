const ROLE_DASHBOARDS = {
    Marketing: '/dashboard/marketing',
    PPIC: '/dashboard/ppic',
    Finance: '/dashboard/finance',
    Production: '/dashboard/production',
    'R&D': '/dashboard/rd',
    'Raw Material Warehouse': '/dashboard/raw-material-warehouse',
    QC: '/dashboard/qc',
    'Product Warehouse': '/dashboard/productWarehouse',
    Purchase: '/dashboard/purchase'
};

function getDashboardForRole(role) {
    return ROLE_DASHBOARDS[role] || '/auth/login';
}

module.exports = { ROLE_DASHBOARDS, getDashboardForRole };
