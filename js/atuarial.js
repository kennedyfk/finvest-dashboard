import { initSidebar } from './sidebar.js?v=14';
import { loadComponent, showToast, formatNumber, formatCurrency } from './utils/ui.js?v=14';
import { smartSearch, normalizeText } from './utils/search.js?v=14';

// State
let allOperators = {};
let beneficiaryData = {};
let selectedOp = null;

// Matriz de Risco Atuarial (Benchmarks ANS-like)
const RISK_FACTORS = [
    { range: '00-18', factor: 0.82, weight: 0.28 },
    { range: '19-30', factor: 1.00, weight: 0.22 },
    { range: '31-50', factor: 1.75, weight: 0.32 },
    { range: '51-60', factor: 2.80, weight: 0.10 },
    { range: '60+',   factor: 4.85, weight: 0.08 }
];

const BASE_TECHNICAL_COST = 485; // Custo assistencial médio base por vida/mês

/**
 * Inicialização do Módulo Atuarial
 */
async function initActuarial() {
    try {
        // Tenta carregar o sidebar no container correto
        await loadComponent('components/sidebar.html', 'sidebarContainer');
        initSidebar();

        // Carregar dados mestre
        const [opsRes, benRes] = await Promise.all([
            fetch('data/dados_cadop.json'),
            fetch('data/dados_beneficiarios.json')
        ]);
        
        allOperators = await opsRes.json();
        beneficiaryData = await benRes.json();

        initSearch();
        initTheme();

    } catch (error) {
        console.error('Erro na inicialização atuarial:', error);
        showToast('Falha ao inicializar motor atuarial.', 'danger');
    }
}

function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    var matrix = [];
    for (var i = 0; i <= b.length; i++) matrix[i] = [i];
    for (var j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (var i = 1; i <= b.length; i++) {
        for (var j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
        }
    }
    return matrix[b.length][a.length];
}

function getMatchScore(query, text) {
    if (!query) return 1000;
    if (!text) return 1000;

    const normQuery = normalizeText(query);
    const normTarget = normalizeText(text);

    if (normTarget === normQuery) return -100;
    if (normTarget.startsWith(normQuery)) return -50;
    if (smartSearch(text, query)) return -30;

    const stopWords = ["de", "da", "do", "dos", "das", "e", "a", "o", "com", "em"];
    const qWords = normQuery.split(/\s+/).filter(w => w.length > 1 && !stopWords.includes(w));
    const tWords = normTarget.split(/\s+/).filter(w => w.length > 1 && !stopWords.includes(w));

    if (qWords.length === 0) return normTarget.includes(normQuery) ? 0 : 999;

    let totalDist = 0;
    qWords.forEach(qw => {
        let minDist = 999;
        tWords.forEach(tw => {
            if (tw === qw) minDist = 0;
            else if (tw.startsWith(qw)) minDist = Math.min(minDist, 0.1);
            else if (tw.includes(qw)) minDist = Math.min(minDist, 0.5);
            else {
                const dist = levenshtein(qw, tw);
                minDist = Math.min(minDist, dist);
            }
        });
        totalDist += minDist;
    });

    return totalDist + (Math.max(0, tWords.length - qWords.length) * 0.1);
}

function initSearch() {
    const input = document.getElementById('opSearch');
    const dropdown = document.getElementById('opResults');

    input.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val.length < 2) {
            dropdown.classList.remove('active');
            return;
        }

        const maxErrors = Math.max(2, val.split(/\s+/).length * 1.5 + 1);

        // Unified Smart Fuzzy Search & Scoring
        let scored = Object.keys(allOperators).map(ans => {
            const op = allOperators[ans];
            const name = op.Nome_Fantasia || op.Razao_Social || "";
            let score = 999;

            // Strict ANS Matches
            if (val === ans) score = -200;
            else if (ans && ans.includes(val)) score = -80;
            else {
                // Name fuzzy match
                score = getMatchScore(val, name);

                // Fallback secondary check against Razao Social if Nome Fantasia was used
                if (op.Nome_Fantasia && op.Razao_Social) {
                    const scoreRazao = getMatchScore(val, op.Razao_Social);
                    if (scoreRazao < score) score = scoreRazao;
                }
            }

            return { op, ans, score };
        }).filter(item => item.score < maxErrors);

        // Sort by best match (lowest score)
        scored.sort((a, b) => a.score - b.score);

        let filtered = scored.slice(0, 10); // Limit to top 10

        if (filtered.length === 0) {
            dropdown.innerHTML = `<div style="padding:10px 16px; color:var(--text-muted); font-size:0.85rem;">Nenhuma operadora encontrada.</div>`;
        } else {
            dropdown.innerHTML = "";
            filtered.forEach(item => {
                const op = item.op;
                const ans = item.ans;
                const div = document.createElement("div");
                div.className = "autocomplete-item";
                const name = op.Nome_Fantasia || op.Razao_Social;
                div.innerHTML = `
                    <span class="ac-name">${name}</span>
                    <span class="ac-ans">Registro ANS: ${ans} - ${op.UF}</span>
                `;
                div.addEventListener("click", () => {
                    selectOperator(ans);
                    dropdown.classList.remove("active");
                    input.value = "";
                });
                dropdown.appendChild(div);
            });
        }
        dropdown.classList.add("active");
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".compare-search-wrap")) {
            dropdown.classList.remove("active");
        }
    });
}

function selectOperator(ans) {
    const op = allOperators[ans];
    const history = beneficiaryData[ans];
    const latestDate = history ? Object.keys(history).sort().reverse()[0] : null;
    const data = latestDate ? history[latestDate] : null;

    if (!data) {
        showToast('Dados históricos insuficientes para análise atuarial.', 'warning');
        return;
    }

    selectedOp = {
        ans,
        name: op.Nome_Fantasia || op.Razao_Social,
        data: data
    };

    document.getElementById('selectedOpName').textContent = selectedOp.name;
    document.getElementById('selectedOpANS').textContent = `ANS: ${ans}`;
    document.getElementById('selectedOpBox').style.display = 'block';

    runActuarialSimulation();
}

/**
 * Motor de Simulação Atuarial
 */
function runActuarialSimulation() {
    const totalVidas = parseInt(selectedOp.data.qt_beneficiario_ativo || 0);
    const idososPerc = parseFloat(selectedOp.data.ativos_idosos_perc || 0);

    // 1. Simulação da Distribuição Etária
    // Se idososPerc for 10%, distribuímos os 90% restantes conforme os pesos da matriz
    const distribution = RISK_FACTORS.map(rf => {
        let perc;
        if (rf.range === '60+') {
            perc = idososPerc / 100;
        } else {
            const remainingBase = 1 - (idososPerc / 100);
            const sumOtherWeights = RISK_FACTORS.filter(x => x.range !== '60+').reduce((a, b) => a + b.weight, 0);
            perc = (rf.weight / sumOtherWeights) * remainingBase;
        }
        
        const count = Math.round(totalVidas * perc);
        const estimatedCost = count * BASE_TECHNICAL_COST * rf.factor;

        return { ...rf, count, countPerc: perc * 100, estimatedCost };
    });

    // 2. Cálculos de Provisões (Estimativa Técnica)
    const monthlyTechCost = distribution.reduce((sum, item) => sum + item.estimatedCost, 0);
    const avgCostPerLife = monthlyTechCost / Math.max(totalVidas, 1);
    
    // PEONA (Provisão de Eventos Não Avisados): Estimamos 115% do custo mensal projetado (pro-forma)
    const peona = monthlyTechCost * 1.15;
    
    // IBNR (Incurred But Not Reported): Reserva de liquidez média setorial (45-60 dias de sinistralidade)
    const ibnr = monthlyTechCost * 0.52; // ~52% do custo mensal

    updateUI(distribution, totalVidas, peona, ibnr, avgCostPerLife);
}

function updateUI(distribution, totalVidas, peona, ibnr, avgCost) {
    // KPIs
    animateValue('peonaValue', peona, true);
    animateValue('ibnrValue', ibnr, true);
    animateValue('avgCostValue', avgCost, true);

    // Chart
    const barChart = document.getElementById('ageBarChart');
    const maxCount = Math.max(...distribution.map(d => d.count), 1);

    barChart.innerHTML = distribution.map(d => `
        <div class="age-column">
            <div class="age-bar" 
                 style="height: ${(d.count / maxCount) * 100}%;" 
                 data-count="${formatNumber(d.count)} vidas"
                 data-label="${d.range}">
            </div>
            <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 25px; text-align: center;">
                ${d.countPerc.toFixed(1)}%
            </div>
        </div>
    `).join('');

    // Verdict
    const verdict = document.getElementById('technicalVerdict');
    const idosos = parseFloat(selectedOp.data.ativos_idosos_perc || 0);
    
    let riskLevel = 'MODERADO';
    let riskColor = 'var(--warning)';
    
    if (idosos > 14) { riskLevel = 'ALTO (Sensibilidade a Eventos Graves)'; riskColor = 'var(--danger)'; }
    else if (idosos < 7) { riskLevel = 'BAIXO (Perfil Jovem/Acumulador)'; riskColor = 'var(--success)'; }

    verdict.innerHTML = `
        <p>Com base na carteira de <strong>${formatNumber(totalVidas)} beneficiários</strong>, a operadora apresenta um Perfil de Exposição Demográfica <span style="color:${riskColor}; font-weight:700;">${riskLevel}</span>.</p>
        <p style="margin-top:12px;">
            A concentração de <strong>${idosos.toFixed(1)}% de idosos</strong> exige uma liquidez técnica mínima de <strong>${formatCurrency(ibnr)}</strong> para cobertura de sinistros IBNR. 
            O custo assistencial pro-forma ajustado pelo risco etário é de <strong>${formatCurrency(avgCost)} por vida/mês</strong>, 
            o que sugere a necessidade de uma PEONA mensal de <strong>${formatCurrency(peona)}</strong> para manutenção da solvência operacional.
        </p>
    `;
    document.getElementById('technicalVerdictContainer').style.borderLeftColor = riskColor;
}

/**
 * Animação simples para valores numéricos
 */
function animateValue(id, value, isCurrency) {
    const el = document.getElementById(id);
    const start = 0;
    const end = value;
    const duration = 800;
    let startTime = null;

    function animation(currentTime) {
        if (!startTime) startTime = currentTime;
        const progress = Math.min((currentTime - startTime) / duration, 1);
        const current = progress * (end - start) + start;
        el.textContent = isCurrency ? formatCurrency(current) : formatNumber(Math.floor(current));
        if (progress < 1) requestAnimationFrame(animation);
    }
    requestAnimationFrame(animation);
}

function initTheme() {
    const savedTheme = localStorage.getItem('finvest-theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initActuarial);
} else {
    initActuarial();
}
