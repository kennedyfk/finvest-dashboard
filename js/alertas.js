import { initSidebar } from './sidebar.js?v=14';
import { openOperatorModal } from './components/operator_modal.js?v=14';
import { loadComponent, showToast, formatNumber, escapeHTML } from './utils/ui.js?v=14';
import { smartSearch, normalizeText } from './utils/search.js?v=14';
import { store } from './services/store.js?v=14';

// State
let allOperators = {};
let beneficiaryData = {};
let alerts = [];
let currentFilter = 'all';
let showFavoritesOnly = false;
let sortCol = 'lives';
let sortAsc = false;

/**
 * Lógica de Detecção de Alertas
 */
function detectAlerts() {
    alerts = [];
    const ansCodes = Object.keys(allOperators);

    ansCodes.forEach(ans => {
        const op = allOperators[ans];
        if (op.Status_Operadora !== 'ATIVA') return;

        const history = beneficiaryData[ans];
        if (!history) return;

        const dates = Object.keys(history).sort().reverse();
        if (dates.length < 2) return;

        const latest = history[dates[0]];
        const previous = history[dates[1]];

        const activeBenef = parseInt(latest.qt_beneficiario_ativo || 0);
        const canceledBenef = parseInt(latest.qt_beneficiario_cancelado || 0);
        const saldo = parseInt(latest.qt_beneficiario_saldo || 0);
        
        // 1. Alerta de IDSS (Simulado via Registro ANS)
        // Usamos uma lógica determinística mas variada para demonstração
        const idssScore = (parseInt(ans) % 100) / 100;
        if (idssScore < 0.45) {
            alerts.push({
                ans,
                name: op.Nome_Fantasia || op.Razao_Social,
                type: 'idss',
                label: 'IDSS Baixo',
                indicator: idssScore.toFixed(2),
                severity: idssScore < 0.3 ? 'critical' : 'warning',
                description: `IDSS abaixo da média regulatória (Score: ${idssScore.toFixed(2)})`,
                lives: activeBenef,
                refDate: dates[0]
            });
        }

        // 2. Alerta Financeiro (Insolvência / Saldo Negativo Crítico)
        if (saldo < -500 && (saldo / activeBenef) < -0.05) {
            alerts.push({
                ans,
                name: op.Nome_Fantasia || op.Razao_Social,
                type: 'financeiro',
                label: 'Risco Financeiro',
                indicator: formatNumber(saldo),
                severity: saldo < -2000 ? 'critical' : 'warning',
                description: `Perda acentuada de beneficiários (${formatNumber(saldo)}) sugere instabilidade financeira.`,
                lives: activeBenef,
                refDate: dates[0]
            });
        }

        // 3. Alerta de Reclamações (Proxy via Evasão/Cancelamento)
        const cancelRate = (canceledBenef / activeBenef) * 100;
        if (cancelRate > 8) {
            alerts.push({
                ans,
                name: op.Nome_Fantasia || op.Razao_Social,
                type: 'reclamacoes',
                label: 'Alta Evasão',
                indicator: `${cancelRate.toFixed(1)}%`,
                severity: cancelRate > 15 ? 'critical' : 'warning',
                description: `Taxa de cancelamento mensal de ${cancelRate.toFixed(1)}% indica possíveis falhas no atendimento.`,
                lives: activeBenef,
                refDate: dates[0]
            });
        }
    });

    updateKPIs();
    updateFavBtnState();
    renderAlertsTable();
}

function updateFavBtnState() {
    const btn = document.getElementById('favFilterBtn');
    if (!btn) return;
    btn.classList.toggle('active', showFavoritesOnly);
    const count = store.favorites.size;
    btn.querySelector('.fav-count').textContent = count > 0 ? `(${count})` : '';
}

function updateKPIs() {
    const critical = alerts.filter(a => a.severity === 'critical').length;
    const warnings = alerts.filter(a => a.severity === 'warning').length;
    
    document.getElementById('kpiCriticalAlerts').textContent = critical;
    document.getElementById('kpiTotalWarnings').textContent = warnings;
    
    // Média IDSS Setor (Fictícia baseada nos alertas)
    document.getElementById('kpiHealthScore').textContent = "0.74";
    document.getElementById('kpiSolvency').textContent = "92%";
}

function renderAlertsTable() {
    const tableBody = document.getElementById('alertsTableBody');
    if (!tableBody) return;

    let filteredAlerts = currentFilter === 'all' 
        ? alerts 
        : alerts.filter(a => a.type === currentFilter);

    // Apply Search Filter
    const searchInput = document.getElementById('searchInput');
    const query = searchInput ? searchInput.value.trim() : "";
    if (query) {
        filteredAlerts = filteredAlerts.filter(a => 
            smartSearch(a.name, query) || 
            a.ans.includes(query)
        );
    }

    // Apply Favorites Filter
    if (showFavoritesOnly) {
        filteredAlerts = filteredAlerts.filter(a => store.favorites.has(a.ans.toString()));
    }

    // Sort Alerts
    filteredAlerts.sort((a, b) => {
        let valA = a[sortCol];
        let valB = b[sortCol];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;

        // Secondary sort by severity if lives are equal
        if (sortCol === 'lives') {
            if (a.severity === 'critical' && b.severity !== 'critical') return -1;
            if (a.severity !== 'critical' && b.severity === 'critical') return 1;
        }
        return 0;
    });

    tableBody.innerHTML = filteredAlerts.map(alert => {
        const isFav = store.favorites.has(alert.ans.toString());
        const logoPath = `assets/logos/${alert.ans}.png`;
        
        return `
            <tr>
                <td>
                    <div class="advertiser-cell">
                        <button class="fav-star-btn ${isFav ? 'active' : ''}" data-ans="${alert.ans}" style="background:none; border:none; color:${isFav ? 'var(--primary)' : 'var(--text-muted)'}; cursor:pointer; padding:4px;" title="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                        </button>
                        <div class="advertiser-main-info" onclick="window.openDetail('${alert.ans}')">
                            <div class="advertiser-logo">
                                <img src="${logoPath}" alt="${escapeHTML(alert.name)}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(alert.name)}&background=f74b4b&color=fff'">
                            </div>
                            <div class="advertiser-info">
                            <span class="advertiser-name" style="font-weight:600; color:var(--text-main); font-size:0.9rem;">
                                ${escapeHTML(alert.name)}
                                <span class="cc-badge ativa">Ativo</span>
                            </span>
                            <span class="advertiser-stats" style="color:var(--text-muted); font-size:0.75rem;">ANS: ${alert.ans}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="beneficiary-cell">
                        <span class="beneficiary-count" style="font-size:0.875rem; font-weight:600; color:var(--text-main);">${formatNumber(alert.lives)}</span>
                        <span class="beneficiary-date" style="font-size:0.65rem; color:var(--text-muted); display:block;">Ref: ${alert.refDate ? alert.refDate.split('-').reverse().join('/') : 'N/A'}</span>
                    </div>
                </td>
                <td>
                    <span style="font-size:0.85rem; font-weight:500;">${alert.label}</span>
                </td>
                <td>
                    <span class="indicator-value">${alert.indicator}</span>
                </td>
                <td>
                    <span class="severity-badge severity-${alert.severity}">
                        ${alert.severity === 'critical' ? '🔴 Crítico' : '🟡 Alerta'}
                    </span>
                </td>
                <td>
                    <button class="filter-btn-primary" style="padding:4px 12px; font-size:0.75rem;" onclick="window.openDetail('${alert.ans}')">
                        Analisar
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (filteredAlerts.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--text-muted);">Nenhum alerta encontrado para este filtro.</td></tr>';
    }
}

/**
 * Inicialização
 */
async function initAlerts() {
    try {
        // Carregar componentes
        await Promise.all([
            loadComponent('components/sidebar.html', 'sidebarContainer'),
            loadComponent('components/operator_modal.html', 'operatorModalContainer')
        ]);

        initSidebar();

        // Carregar Dados
        const [opsRes, benRes] = await Promise.all([
            fetch('data/dados_cadop.json'),
            fetch('data/dados_beneficiarios.json')
        ]);
        
        allOperators = await opsRes.json();
        beneficiaryData = await benRes.json();

        detectAlerts();
        initEvents();

    } catch (error) {
        console.error('Erro ao inicializar alertas:', error);
        showToast('Erro ao carregar dados do painel regulatório.', 'danger');
    }
}

function initEvents() {
    // Tabs de Alerta
    const tabs = document.querySelectorAll('.crypto-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.type;
            renderAlertsTable();
        });
    });

    // Theme Toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('finvest-theme', newTheme);
        });
        
        const savedTheme = localStorage.getItem('finvest-theme');
        if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
    }

    // Campo de Busca
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderAlertsTable();
        });
    }

    // Favoritos
    const favFilterBtn = document.getElementById('favFilterBtn');
    if (favFilterBtn) {
        favFilterBtn.addEventListener('click', () => {
            showFavoritesOnly = !showFavoritesOnly;
            updateFavBtnState();
            renderAlertsTable();
        });
    }

    const favClearBtn = document.getElementById('favClearBtn');
    if (favClearBtn) {
        favClearBtn.addEventListener('click', () => {
            if (store.favorites.size === 0) return;
            if (confirm("Tem certeza que deseja limpar todos os favoritos?")) {
                store.clearFavorites();
                showFavoritesOnly = false;
                updateFavBtnState();
                renderAlertsTable();
            }
        });
    }

    // Listen for star clicks in the table
    document.getElementById('alertsTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('.fav-star-btn');
        if (btn) {
            const ans = btn.dataset.ans;
            store.toggleFavorite(ans);
            renderAlertsTable();
            updateFavBtnState();
        }
    });

    // Reactive update if store changes (from other components or modals)
    window.addEventListener('store-updated', () => {
        updateFavBtnState();
        renderAlertsTable();
    });

    // Table Sorting
    document.querySelectorAll(".trade-table th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const newSortCol = th.getAttribute("data-sort");
            if (sortCol === newSortCol) {
                sortAsc = !sortAsc;
            } else {
                sortCol = newSortCol;
                sortAsc = true;
            }

            // Update UI
            document.querySelectorAll(".trade-table th.sortable").forEach(el => {
                el.classList.remove("current-sort", "asc", "desc");
            });
            th.classList.add("current-sort");
            th.classList.add(sortAsc ? "asc" : "desc");

            renderAlertsTable();
        });
    });
}

// Global functions
window.openDetail = (ans) => {
    const op = allOperators[ans];
    if (op) {
        op.Registro_ANS = ans;
        openOperatorModal(op);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAlerts);
} else {
    initAlerts();
}
