import { initSidebar } from './sidebar.js?v=14';
import { loadComponent, showToast, formatNumber } from './utils/ui.js?v=14';

// State
let allOperators = {};
let beneficiaryData = {};
let reportWidgets = [];

/**
 * Biblioteca de Widgets (Estrutura e Dados)
 */
const WIDGET_TEMPLATES = {
    kpi_vitals: {
        title: 'Indicadores Vitais do Setor',
        render: () => `
            <div class="kpi-cards" style="grid-template-columns: repeat(3, 1fr); margin-top:0;">
                <div class="kpi-card">
                    <div class="kpi-info">
                        <span class="kpi-value">51.2M</span>
                        <span class="kpi-label">Beneficiários Totais</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-info">
                        <span class="kpi-value">0.74</span>
                        <span class="kpi-label">Média IDSS</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-info">
                        <span class="kpi-value">92%</span>
                        <span class="kpi-label">Solvência Garantida</span>
                    </div>
                </div>
            </div>
        `
    },
    growth_chart: {
        title: 'Tendência de Crescimento (Últimos 12 meses)',
        render: () => `
            <div style="height:250px; display:flex; align-items:flex-end; gap:10px; padding:20px 0;">
                ${[40, 60, 45, 80, 90, 75, 100, 110, 95, 120, 140, 130].map(h => `
                    <div style="flex:1; background:var(--primary); height:${h}px; border-radius:4px 4px 0 0; opacity:0.8;"></div>
                `).join('')}
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); border-top:1px solid var(--border-light); padding-top:10px;">
                <span>Jan</span><span>Mar</span><span>Jun</span><span>Set</span><span>Dez</span>
            </div>
        `
    },
    geo_map: {
        title: 'Mapa de Concentração Geográfica',
        render: () => `
            <div style="background:#f8fafc; border-radius:12px; height:300px; display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden;">
                <svg viewBox="0 0 24 24" fill="none" stroke="#ddd" stroke-width="0.5" style="width:100%; height:100%;">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
                </svg>
                <div style="position:absolute; top:20%; left:40%; width:12px; height:12px; background:var(--primary); border-radius:50%; box-shadow:0 0 10px var(--primary);"></div>
                <div style="position:absolute; top:50%; left:60%; width:8px; height:8px; background:var(--primary); border-radius:50%; opacity:0.6;"></div>
                <div style="position:absolute; top:70%; left:30%; width:15px; height:15px; background:var(--primary); border-radius:50%; opacity:0.4;"></div>
                <span style="position:absolute; bottom:15px; right:15px; font-size:0.7rem; color:var(--text-muted);">Visualização Baseada em UF Sede</span>
            </div>
        `
    },
    alerts_table: {
        title: 'Operadoras com Alertas Críticos',
        render: () => `
            <table class="trade-table" style="font-size:0.8rem;">
                <thead>
                    <tr><th>Operadora</th><th>Alerta</th><th>Criticidade</th></tr>
                </thead>
                <tbody>
                    <tr><td>UNIMED VITÓRIA</td><td>IDSS Baixo</td><td><span style="color:#ef4444">🔴 Crítico</span></td></tr>
                    <tr><td>BRADESCO SAÚDE</td><td>Alta Evasão</td><td><span style="color:#f59e0b">🟡 Alerta</span></td></tr>
                    <tr><td>AMIL SAÚDE</td><td>Insolvência</td><td><span style="color:#ef4444">🔴 Crítico</span></td></tr>
                </tbody>
            </table>
        `
    },
    demographics: {
        title: 'Distribuição Demográfica e Mix de Planos',
        render: () => `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                <div>
                    <span style="font-size:0.75rem; color:var(--text-muted);">Faixa Etária (Idosos)</span>
                    <div style="height:12px; background:#eee; border-radius:6px; margin-top:8px; overflow:hidden;">
                        <div style="width:14%; height:100%; background:var(--primary);"></div>
                    </div>
                    <span style="font-size:0.9rem; font-weight:700;">14.2%</span>
                </div>
                <div>
                    <span style="font-size:0.75rem; color:var(--text-muted);">Planos Individuais</span>
                    <div style="height:12px; background:#eee; border-radius:6px; margin-top:8px; overflow:hidden;">
                        <div style="width:32%; height:100%; background:#64748b;"></div>
                    </div>
                    <span style="font-size:0.9rem; font-weight:700;">32.0%</span>
                </div>
            </div>
        `
    }
};

/**
 * Inicialização
 */
async function initReports() {
    try {
        await loadComponent('components/sidebar.html', 'sidebarContainer');
        initSidebar();
        initEvents();
        initTheme();

        // Carregar dados reais (para uso futuro opcional nos widgets)
        const [opsRes, benRes] = await Promise.all([
            fetch('data/dados_cadop.json'),
            fetch('data/dados_beneficiarios.json')
        ]);
        allOperators = await opsRes.json();
        beneficiaryData = await benRes.json();

    } catch (error) {
        console.error('Erro ao inicializar gerador:', error);
        showToast('Erro ao carregar dados do gerador.', 'danger');
    }
}

function initEvents() {
    // Adicionar widgets
    const libraryItems = document.querySelectorAll('.widget-item');
    libraryItems.forEach(item => {
        item.addEventListener('click', () => {
            const type = item.dataset.type;
            addWidget(type);
        });
    });

    // Exportar PDF
    document.getElementById('exportPDF').addEventListener('click', () => {
        if (reportWidgets.length === 0) {
            showToast('Adicione pelo menos um widget ao relatório.', 'warning');
            return;
        }
        window.print();
    });
}

function addWidget(type) {
    const template = WIDGET_TEMPLATES[type];
    if (!template) return;

    reportWidgets.push({ id: Date.now(), type });
    renderCanvas();
    showToast(`${template.title} adicionado.`, 'success');
}

function removeWidget(id) {
    reportWidgets = reportWidgets.filter(w => w.id !== id);
    renderCanvas();
}

function renderCanvas() {
    const canvas = document.getElementById('reportCanvas');
    const placeholder = document.getElementById('placeholder');

    if (reportWidgets.length === 0) {
        placeholder.style.display = 'block';
        // Limpar widgets mas manter placeholder
        const existingWidgets = canvas.querySelectorAll('.report-widget');
        existingWidgets.forEach(w => w.remove());
        return;
    }

    placeholder.style.display = 'none';
    
    // Para simplificar, vamos reconstruir o canvas
    // Em uma app real, usaríamos DocumentFragment ou Diffing
    const currentWidgetsIDs = reportWidgets.map(w => w.id);
    const renderedWidgets = canvas.querySelectorAll('.report-widget');
    
    // Limpar o que não existe mais
    renderedWidgets.forEach(w => {
        if (!currentWidgetsIDs.includes(parseInt(w.dataset.id))) w.remove();
    });

    // Adicionar novos
    reportWidgets.forEach(w => {
        if (!canvas.querySelector(`[data-id="${w.id}"]`)) {
            const template = WIDGET_TEMPLATES[w.type];
            const div = document.createElement('div');
            div.className = 'report-widget';
            div.dataset.id = w.id;
            div.innerHTML = `
                <button class="remove-widget" onclick="window.removeWidget(${w.id})">×</button>
                <h4 style="margin-bottom:20px; color:var(--text-main); font-size:1rem; border-left:4px solid var(--primary); padding-left:12px;">
                    ${template.title}
                </h4>
                <div class="widget-content">
                    ${template.render()}
                </div>
            `;
            canvas.appendChild(div);
        }
    });
}

function initTheme() {
    const savedTheme = localStorage.getItem('finvest-theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
}

// Global scope for onclick
window.removeWidget = removeWidget;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReports);
} else {
    initReports();
}
