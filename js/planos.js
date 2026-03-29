async function loadComponent(url, targetId) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        const html = await response.text();
        const container = document.getElementById(targetId);
        if (container) container.outerHTML = html;
    } catch (err) {
        console.warn(`Component load failed for ${url}:`, err.message);
    }
}

function initTheme() {
    const saved = localStorage.getItem('finvest-theme');
    const dark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    updateThemeIcons();
}

function updateThemeIcons() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const moon = document.querySelector('.icon-moon');
    const sun  = document.querySelector('.icon-sun');
    if (moon && sun) {
        moon.style.display = isDark ? 'none'  : 'block';
        sun.style.display  = isDark ? 'block' : 'none';
    }
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('finvest-theme', isDark ? 'light' : 'dark');
    updateThemeIcons();
}

// ── Toggle faturamento ────────────────────────────────────────
function setBilling(mode) {
    document.getElementById('optMonthly').classList.toggle('active', mode === 'monthly');
    document.getElementById('optAnnual').classList.toggle('active', mode === 'annual');

    const monthly = 149;
    const annual  = Math.round(monthly * 0.8);

    if (mode === 'annual') {
        document.getElementById('premiumPrice').textContent  = annual;
        document.getElementById('premiumPeriod').textContent = 'por mês, cobrado anualmente';
        document.getElementById('premiumAnnual').textContent =
            `R$ ${annual * 12}/ano — economize R$ ${(monthly - annual) * 12}`;
    } else {
        document.getElementById('premiumPrice').textContent  = monthly;
        document.getElementById('premiumPeriod').textContent = 'por mês, cobrado mensalmente';
        document.getElementById('premiumAnnual').textContent = '';
    }
}

// ── FAQ ───────────────────────────────────────────────────────
function toggleFaq(btn) {
    btn.closest('.faq-item').classList.toggle('open');
}

// ── Modal upgrade ─────────────────────────────────────────────
function showUpgradeContact() {
    window.location.href = 'help.html';
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    await loadComponent('components/sidebar.html', 'sidebarContainer');

    const sidebar       = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));

        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 1024 && sidebar.classList.contains('open')) {
                if (!sidebar.contains(e.target) && e.target !== sidebarToggle && !sidebarToggle.contains(e.target)) {
                    sidebar.classList.remove('open');
                }
            }
        });
    }

    // Marca item ativo no sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.page === 'planos') item.classList.add('active');
    });
});
