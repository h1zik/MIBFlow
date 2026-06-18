document.addEventListener('DOMContentLoaded', function () {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const mobileToggle = document.getElementById('mobileToggle');
    const overlay = document.querySelector('.sidebar-overlay');

    if (!sidebar) return;

    const isMobile = () => window.innerWidth <= 768;

    function toggleMobileMenu(event) {
        if (event) event.preventDefault();
        sidebar.classList.toggle('show');
        overlay?.classList.toggle('show');
        document.body.style.overflow = sidebar.classList.contains('show') ? 'hidden' : '';
    }

    function toggleDesktopMenu(event) {
        if (event) event.preventDefault();
        sidebar.classList.toggle('collapsed');
        document.body.classList.toggle('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    }

    function handleToggleClick(event) {
        if (isMobile()) {
            toggleMobileMenu(event);
        } else {
            toggleDesktopMenu(event);
        }
    }

    // Restore collapsed state on desktop
    if (!isMobile() && localStorage.getItem('sidebarCollapsed') === 'true') {
        sidebar.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
    }

    mobileToggle?.addEventListener('click', toggleMobileMenu);
    sidebarToggle?.addEventListener('click', handleToggleClick);
    overlay?.addEventListener('click', toggleMobileMenu);

    window.addEventListener('resize', function () {
        if (!isMobile()) {
            sidebar.classList.remove('show');
            overlay?.classList.remove('show');
            document.body.style.overflow = '';
        }
    });
});
