/**
 * js/sidebar.js
 * Lógica para o Sidebar Colapsável, injeção de dados do usuário autenticado,
 * e menu dropdown do usuário.
 */

export function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('sidebarCollapseBtn');
    const appContainer = document.querySelector('.app-container');

    if (!sidebar || !collapseBtn) {
        setTimeout(initSidebar, 100);
        return;
    }

    // ── Estado de colapso ────────────────────────────────────────
    const setSidebarState = (isCollapsed) => {
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
            if (appContainer) appContainer.classList.add('sidebar-is-collapsed');
        } else {
            sidebar.classList.remove('collapsed');
            if (appContainer) appContainer.classList.remove('sidebar-is-collapsed');
        }
        localStorage.setItem('finvest-sidebar-collapsed', isCollapsed);
        window.dispatchEvent(new Event('resize'));
    };

    const savedState = localStorage.getItem('finvest-sidebar-collapsed') === 'true';
    setSidebarState(savedState);

    // ── Link ativo ───────────────────────────────────────────────
    const currentPath = window.location.pathname;
    sidebar.querySelectorAll('.nav-item').forEach(item => {
        const href = item.getAttribute('href');
        if (href && (
            currentPath.endsWith(href.replace('./', '')) ||
            (currentPath === '/' && href.includes('index.html'))
        )) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // ── Toggle colapso ───────────────────────────────────────────
    collapseBtn.addEventListener('click', () => {
        setSidebarState(!sidebar.classList.contains('collapsed'));
    });

    const headerToggle = document.getElementById('sidebarToggle');
    if (headerToggle) {
        headerToggle.addEventListener('click', () => {
            setSidebarState(!sidebar.classList.contains('collapsed'));
        });
    }

    // ── Dados do usuário ─────────────────────────────────────────
    // Aguarda window.__authProfile ser populado pelo auth-guard
    if (window.__authProfile) {
        injectSidebarUser();
    } else {
        const waitProfile = setInterval(() => {
            if (window.__authProfile) {
                clearInterval(waitProfile);
                injectSidebarUser();
            }
        }, 80);
        setTimeout(() => clearInterval(waitProfile), 5000);
    }

    // ── Dropdown do usuário ──────────────────────────────────────
    initUserDropdown();
}

function injectSidebarUser() {
    const profile = window.__authProfile;
    if (!profile) return;

    const name     = profile.full_name || profile.email?.split('@')[0] || '';
    const role     = profile.role || 'FREE';
    const roleLabels = { FREE: 'Gratuito', PREMIUM: 'Premium', ADMIN: 'Admin' };
    const initials = name.split(' ').map(p => p[0]).filter(Boolean).join('').substring(0, 2).toUpperCase() || '?';

    const nameEl   = document.querySelector('[data-auth-name]');
    const avatarEl = document.querySelector('[data-auth-avatar]');
    const roleEl   = document.querySelector('[data-auth-role]');

    if (nameEl)   nameEl.textContent = name;
    if (avatarEl) {
        if (profile.avatar_url) {
            avatarEl.style.backgroundImage = `url(${profile.avatar_url})`;
            avatarEl.style.backgroundSize  = 'cover';
            avatarEl.style.backgroundPosition = 'center';
            avatarEl.textContent = '';
        } else {
            avatarEl.textContent = initials;
        }
    }
    if (roleEl) {
        roleEl.textContent  = roleLabels[role] || role;
        roleEl.className    = `user-role-badge plan-badge ${role.toLowerCase()}`;
    }
}

function initUserDropdown() {
    const menuBtn  = document.getElementById('userMenuBtn');
    const dropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!menuBtn || !dropdown) return;
    if (menuBtn._dropdownInit) return;
    menuBtn._dropdownInit = true;

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== menuBtn) {
            dropdown.classList.remove('open');
        }
    });

    logoutBtn?.addEventListener('click', async () => {
        dropdown.classList.remove('open');
        if (window.AuthModule) {
            await window.AuthModule.logout('/auth/login.html');
        } else {
            window.location.href = '/auth/login.html';
        }
    });
}
