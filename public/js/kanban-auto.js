/**
 * Generic List/Kanban toggle for dashboards built from .dashboard-section blocks.
 * Collects every .dashboard-section into a single .kb-board wrapper (moving the
 * nodes, so all existing event handlers stay intact), then toggles .kb-mode for
 * the Kanban layout. The choice is remembered per page in localStorage.
 *
 * Requires a .kb-viewbar with two buttons: [data-kbview="list"] and
 * [data-kbview="kanban"]. Loaded via partials/kanban-toggle.ejs.
 */
(function () {
    document.addEventListener('DOMContentLoaded', function () {
        const viewbar = document.querySelector('.kb-viewbar');
        if (!viewbar) return;

        // The main content column — the board must live here (full width), NOT inside
        // a Bootstrap row/col (which would squeeze it and leave a big right gap).
        const content = document.querySelector('.main-content, .content');
        if (!content) return;

        // Prefer top-level list sections (leave chart sections nested in rows/cols alone).
        let sections = Array.prototype.filter.call(content.children, function (el) {
            return el.classList && el.classList.contains('dashboard-section');
        });
        if (!sections.length) {
            sections = Array.prototype.slice.call(content.querySelectorAll('.dashboard-section'));
        }
        if (!sections.length) return;

        // Build the board as a direct child of the content column.
        const board = document.createElement('div');
        board.className = 'kb-board';
        const firstDirect = sections.filter(function (s) { return s.parentNode === content; })[0];
        if (firstDirect) content.insertBefore(board, firstDirect);
        else content.appendChild(board);

        // Keep the toggle bar right above the board, also as a direct child of content
        // (the include may have landed inside a row/col).
        content.insertBefore(viewbar, board);

        // Move sections into the board (DOM move preserves their event handlers)
        // and tag each column with a colour accent derived from its title, so the
        // board reads as grouped stages: failed = danger, vendor = info, else primary.
        sections.forEach(function (s) {
            var titleEl = s.querySelector('.section-title');
            var title = (titleEl ? titleEl.textContent : '').toLowerCase();
            var accent = 'primary';
            if (title.indexOf('failed') > -1 || title.indexOf('reject') > -1) accent = 'danger';
            else if (title.indexOf('vendor') > -1) accent = 'info';
            s.setAttribute('data-kbaccent', accent);
            board.appendChild(s);
        });

        const btns = viewbar.querySelectorAll('[data-kbview]');
        const KEY = 'kbview:' + location.pathname;

        function setView(v) {
            if (v === 'kanban') board.classList.add('kb-mode');
            else board.classList.remove('kb-mode');
            btns.forEach(function (b) {
                b.classList.toggle('active', b.getAttribute('data-kbview') === v);
            });
            try { localStorage.setItem(KEY, v); } catch (e) {}
        }

        btns.forEach(function (b) {
            b.addEventListener('click', function () {
                setView(b.getAttribute('data-kbview'));
            });
        });

        let saved = null;
        try { saved = localStorage.getItem(KEY); } catch (e) {}
        setView(saved === 'kanban' ? 'kanban' : 'list');
    });
})();
