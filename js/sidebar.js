/**
 * js/sidebar.js
 * Lógica para o Sidebar Colapsável e persistência de estado.
 */

export function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('sidebarCollapseBtn');
    const appContainer = document.querySelector('.app-container');

    if (!sidebar || !collapseBtn) {
        // Se o sidebar ainda não foi carregado, tenta novamente em breve
        setTimeout(initSidebar, 100);
        return;
    }

    // Função para aplicar o estado
    const setSidebarState = (isCollapsed) => {
        if (isCollapsed) {
            sidebar.classList.add('collapsed');
            if (appContainer) appContainer.classList.add('sidebar-is-collapsed');
        } else {
            sidebar.classList.remove('collapsed');
            if (appContainer) appContainer.classList.remove('sidebar-is-collapsed');
        }
        localStorage.setItem('finvest-sidebar-collapsed', isCollapsed);
        
        // Trigger resize para gráficos (Chart.js) se houver
        window.dispatchEvent(new Event('resize'));
    };

    // Carregar estado inicial
    const savedState = localStorage.getItem('finvest-sidebar-collapsed') === 'true';
    setSidebarState(savedState);

    // Highlight active link
    const currentPath = window.location.pathname;
    const navItems = sidebar.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const href = item.getAttribute('href');
        if (href && (currentPath.endsWith(href.replace('./', '')) || (currentPath === '/' && href.includes('index.html')))) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Toggle no clique
    collapseBtn.addEventListener('click', () => {
        const currentState = sidebar.classList.contains('collapsed');
        setSidebarState(!currentState);
    });

    // Toggle adicional pelo botão do header (se existir e for desktop)
    const headerToggle = document.getElementById('sidebarToggle');
    if (headerToggle) {
        headerToggle.addEventListener('click', () => {
            const currentState = sidebar.classList.contains('collapsed');
            setSidebarState(!currentState);
        });
    }
}
