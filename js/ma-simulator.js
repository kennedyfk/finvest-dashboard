import { initSidebar } from './sidebar.js?v=14';
import { loadComponent, showToast, formatNumber, formatPercent } from './utils/ui.js?v=14';
import { smartSearch } from './utils/search.js?v=14';

// State
let allOperators = {};
let beneficiaryData = {};
let acquirer = null;
let target = null;

const BENEF_FIELDS = [
    { key: 'qt_beneficiario_ativo', label: 'Beneficiários Ativos', type: 'sum' },
    { key: 'ativos_idosos_perc', label: '% Idosos', type: 'weighted_avg' },
    { key: 'qt_beneficiario_cancelado', label: 'Cancelamentos/mês', type: 'sum' },
    { key: 'idosos_plano_individual', label: '% Idosos P.I.', type: 'weighted_avg' }
];

/**
 * Inicialização
 */
async function initSimulator() {
    try {
        await loadComponent('components/sidebar.html', 'sidebarContainer');
        initSidebar();

        const [opsRes, benRes] = await Promise.all([
            fetch('data/dados_cadop.json'),
            fetch('data/dados_beneficiarios.json')
        ]);
        
        allOperators = await opsRes.json();
        beneficiaryData = await benRes.json();

        initSearch('acquirer');
        initSearch('target');
        initTheme();

    } catch (error) {
        console.error('Erro ao inicializar simulador:', error);
        showToast('Erro ao carregar dados do simulador.', 'danger');
    }
}

function initSearch(type) {
    const input = document.getElementById(`${type}Search`);
    const results = document.getElementById(`${type}Results`);

    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            results.classList.remove('active');
            return;
        }

        const matches = Object.keys(allOperators)
            .filter(ans => {
                const op = allOperators[ans];
                return smartSearch(op.Razao_Social, query) ||
                    (op.Nome_Fantasia && smartSearch(op.Nome_Fantasia, query)) ||
                    ans.includes(query);
            })
            .slice(0, 5);

        if (matches.length > 0) {
            results.innerHTML = matches.map(ans => {
                const op = allOperators[ans];
                return `<div class="op-item" data-ans="${ans}">
                    <strong>${op.Nome_Fantasia || op.Razao_Social}</strong><br/>
                    <small>ANS: ${ans} | ${op.UF}</small>
                </div>`;
            }).join('');
            results.classList.add('active');
        } else {
            results.classList.remove('active');
        }
    });

    results.addEventListener('click', (e) => {
        const item = e.target.closest('.op-item');
        if (item) {
            selectOperator(type, item.dataset.ans);
            results.classList.remove('active');
            input.value = '';
        }
    });
}

function selectOperator(type, ans) {
    const op = allOperators[ans];
    const history = beneficiaryData[ans];
    const latestDate = history ? Object.keys(history).sort().reverse()[0] : null;
    const data = latestDate ? history[latestDate] : null;

    const opReady = {
        ans,
        name: op.Nome_Fantasia || op.Razao_Social,
        data: data || {}
    };

    if (type === 'acquirer') {
        acquirer = opReady;
        document.getElementById('acquirerName').textContent = opReady.name;
        document.getElementById('acquirerANS').textContent = `ANS: ${ans}`;
        document.getElementById('acquirerInfo').style.display = 'block';
    } else {
        target = opReady;
        document.getElementById('targetName').textContent = opReady.name;
        document.getElementById('targetANS').textContent = `ANS: ${ans}`;
        document.getElementById('targetInfo').style.display = 'block';
    }

    if (acquirer && target) {
        runSimulation();
    }
}

function runSimulation() {
    const tableBody = document.getElementById('resultTableBody');
    const emptyState = document.getElementById('emptyState');
    const simResult = document.getElementById('simulationResult');
    const proFormaCard = document.getElementById('proFormaCard');

    emptyState.style.display = 'none';
    simResult.style.display = 'block';
    proFormaCard.classList.add('active');

    const combined = {};
    const rows = BENEF_FIELDS.map(field => {
        const valA = parseFloat(acquirer.data[field.key] || 0);
        const valB = parseFloat(target.data[field.key] || 0);
        const vidasA = parseFloat(acquirer.data.qt_beneficiario_ativo || 0);
        const vidasB = parseFloat(target.data.qt_beneficiario_ativo || 0);

        let combinedVal = 0;
        if (field.type === 'sum') {
            combinedVal = valA + valB;
        } else if (field.type === 'weighted_avg') {
            const totalVidas = vidasA + vidasB;
            combinedVal = totalVidas > 0 ? ((valA * vidasA) + (valB * vidasB)) / totalVidas : 0;
        }

        const diff = valA > 0 ? ((combinedVal - valA) / valA) * 100 : 100;

        return `
            <tr>
                <td style="font-weight:600; color:var(--text-main);">${field.label}</td>
                <td>${field.key.includes('perc') ? valA.toFixed(1) + '%' : formatNumber(valA)}</td>
                <td style="color:var(--primary); font-weight:700;">
                    ${field.key.includes('perc') ? combinedVal.toFixed(1) + '%' : formatNumber(combinedVal)}
                </td>
                <td>
                    <span class="diff-tag ${diff >= 0 ? 'diff-up' : 'diff-down'}">
                        ${diff > 0 ? '+' : ''}${diff.toFixed(1)}%
                    </span>
                </td>
            </tr>
        `;
    }).join('');

    tableBody.innerHTML = rows;

    // Mini charts / Scale
    const totalVidasA = parseFloat(acquirer.data.qt_beneficiario_ativo || 0);
    const totalVidasB = parseFloat(target.data.qt_beneficiario_ativo || 0);
    const scaleFactor = (totalVidasA + totalVidasB) / Math.max(totalVidasA, 1);
    
    document.getElementById('scaleLabel').textContent = `${scaleFactor.toFixed(1)}X`;
    document.getElementById('scaleDescription').textContent = `Aumento de ${((scaleFactor - 1) * 100).toFixed(0)}% na base total.`;

    // Age Bar
    const percA = parseFloat(acquirer.data.ativos_idosos_perc || 0);
    const percB = parseFloat(target.data.ativos_idosos_perc || 0);
    const percCombined = ((percA * totalVidasA) + (percB * totalVidasB)) / (totalVidasA + totalVidasB || 1);

    document.getElementById('ageBarA').style.width = `${percA}%`;
    document.getElementById('ageBarB').style.width = `${percCombined}%`;
    document.getElementById('ageBarB').style.opacity = '0.5';
    
    document.getElementById('ageLabelA').textContent = `${percA.toFixed(1)}%`;
    document.getElementById('ageLabelCombined').textContent = `${percCombined.toFixed(1)}%`;
}

function initTheme() {
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
}

document.getElementById('resetSim')?.addEventListener('click', () => {
    acquirer = null;
    target = null;
    document.getElementById('acquirerInfo').style.display = 'none';
    document.getElementById('targetInfo').style.display = 'none';
    document.getElementById('simulationResult').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('proFormaCard').classList.remove('active');
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSimulator);
} else {
    initSimulator();
}
