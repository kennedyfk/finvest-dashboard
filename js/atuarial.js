import { initSidebar } from './sidebar.js?v=14';
import { loadComponent, showToast, formatNumber, formatCurrency, escapeHTML } from './utils/ui.js?v=14';
import { smartSearch, normalizeText } from './utils/search.js?v=14';

// State
let allOperators = {};
let beneficiaryData = {};
let selectedOp = null;
let activeAnimations = {}; // Cache para controle de frames de animação

// Cache de Elementos DOM para Performance
const dom = {
    input: null,
    dropdown: null,
    selectedBox: null,
    selectedName: null,
    selectedANS: null,
    chart: null,
    verdict: null,
    verdictContainer: null
};

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
        // Inicializar Cache do DOM
        dom.input = document.getElementById('opSearch');
        dom.dropdown = document.getElementById('opResults');
        dom.selectedBox = document.getElementById('selectedOpBox');
        dom.selectedName = document.getElementById('selectedOpName');
        dom.selectedANS = document.getElementById('selectedOpANS');
        dom.chart = document.getElementById('ageBarChart');
        dom.verdict = document.getElementById('technicalVerdict');
        dom.verdictContainer = document.getElementById('technicalVerdictContainer');

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

function initSearch() {
    if (!dom.input || !dom.dropdown) return;

    dom.input.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val.length < 2) {
            dom.dropdown.classList.remove('active');
            dom.input.setAttribute('aria-expanded', 'false');
            return;
        }

        const maxErrors = Math.max(2, val.split(/\s+/).length * 1.5 + 1);

        let scored = Object.keys(allOperators).map(ans => {
            const op = allOperators[ans];
            const name = op.Nome_Fantasia || op.Razao_Social || "";
            let score = 999;

            if (val === ans) score = -200;
            else if (ans && ans.includes(val)) score = -80;
            else {
                const normQuery = normalizeText(val);
                const normTarget = normalizeText(name);

                if (normTarget === normQuery) score = -100;
                else if (normTarget.startsWith(normQuery)) score = -50;
                else if (smartSearch(name, val)) score = -30;
                else {
                    const stopWords = ["de", "da", "do", "dos", "das", "e", "a", "o", "com", "em"];
                    const qWords = normQuery.split(/\s+/).filter(w => w.length > 1 && !stopWords.includes(w));
                    const tWords = normTarget.split(/\s+/).filter(w => w.length > 1 && !stopWords.includes(w));

                    if (qWords.length > 0) {
                        let totalDist = 0;
                        qWords.forEach(qw => {
                            let minDist = 9;
                            tWords.forEach(tw => {
                                if (tw === qw) minDist = 0;
                                else if (tw.startsWith(qw)) minDist = Math.min(minDist, 0.1);
                                else if (tw.includes(qw)) minDist = Math.min(minDist, 0.5);
                            });
                            totalDist += minDist;
                        });
                        score = totalDist + (Math.max(0, tWords.length - qWords.length) * 0.1);
                    }
                }

                if (op.Nome_Fantasia && op.Razao_Social && score > 0) {
                    const normRazao = normalizeText(op.Razao_Social);
                    if (normRazao.includes(normQuery)) score = Math.min(score, 0);
                }
            }
            return { op, ans, score };
        }).filter(item => item.score < maxErrors);

        scored.sort((a, b) => a.score - b.score);
        let filtered = scored.slice(0, 10);

        if (filtered.length === 0) {
            dom.dropdown.innerHTML = "";
            const noResults = document.createElement("div");
            noResults.style.padding = "12px 16px";
            noResults.style.color = "var(--text-muted)";
            noResults.style.fontSize = "0.85rem";
            noResults.textContent = "Nenhuma operadora encontrada.";
            dom.dropdown.appendChild(noResults);
        } else {
            dom.dropdown.innerHTML = "";
            filtered.forEach(item => {
                const { op, ans } = item;
                const name = op.Nome_Fantasia || op.Razao_Social;
                
                const div = document.createElement("div");
                div.className = "autocomplete-item";
                div.setAttribute('role', 'option');
                
                const nameSpan = document.createElement("span");
                nameSpan.className = "ac-name";
                nameSpan.textContent = name; // Seguro XSS
                
                const ansSpan = document.createElement("span");
                ansSpan.className = "ac-ans";
                ansSpan.textContent = `Registro ANS: ${ans} - ${op.UF}`; // Seguro XSS
                
                div.append(nameSpan, ansSpan);
                div.addEventListener("click", () => {
                    selectOperator(ans);
                    dom.dropdown.classList.remove("active");
                    dom.input.setAttribute('aria-expanded', 'false');
                    dom.input.value = "";
                });
                dom.dropdown.appendChild(div);
            });
        }
        dom.dropdown.classList.add("active");
        dom.input.setAttribute('aria-expanded', 'true');
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".compare-search-wrap")) {
            dom.dropdown.classList.remove("active");
            dom.input.setAttribute('aria-expanded', 'false');
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

    dom.selectedName.textContent = selectedOp.name;
    dom.selectedANS.textContent = `ANS: ${ans}`;
    dom.selectedBox.style.display = 'block';

    runActuarialSimulation();
}

/**
 * Motor de Simulação Atuarial
 */
function runActuarialSimulation() {
    const totalVidas = parseInt(selectedOp.data.qt_beneficiario_ativo || 0);
    const idososPerc = parseFloat(selectedOp.data.ativos_idosos_perc || 0);

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

    const monthlyTechCost = distribution.reduce((sum, item) => sum + item.estimatedCost, 0);
    const avgCostPerLife = monthlyTechCost / Math.max(totalVidas, 1);
    const peona = monthlyTechCost * 1.15;
    const ibnr = monthlyTechCost * 0.52;

    updateUI(distribution, totalVidas, peona, ibnr, avgCostPerLife);
}

function updateUI(distribution, totalVidas, peona, ibnr, avgCost) {
    animateValue('peonaValue', peona, true);
    animateValue('ibnrValue', ibnr, true);
    animateValue('avgCostValue', avgCost, true);

    const maxCount = Math.max(...distribution.map(d => d.count), 1);

    dom.chart.innerHTML = "";
    distribution.forEach(d => {
        const column = document.createElement("div");
        column.className = "age-column";
        
        const bar = document.createElement("div");
        bar.className = "age-bar";
        bar.style.height = `${(d.count / maxCount) * 100}%`;
        bar.setAttribute("data-count", `${formatNumber(d.count)} vidas`);
        bar.setAttribute("data-label", d.range);
        
        const label = document.createElement("div");
        label.style.fontSize = "0.65rem";
        label.style.color = "var(--text-muted)";
        label.style.marginTop = "25px";
        label.style.textAlign = "center";
        label.textContent = `${d.countPerc.toFixed(1)}%`;
        
        column.append(bar, label);
        dom.chart.appendChild(column);
    });

    const idosos = parseFloat(selectedOp.data.ativos_idosos_perc || 0);
    let riskLevel = 'MODERADO';
    let riskColor = 'var(--warning)';
    
    if (idosos > 14) { riskLevel = 'ALTO (Sensibilidade a Eventos Graves)'; riskColor = 'var(--danger)'; }
    else if (idosos < 7) { riskLevel = 'BAIXO (Perfil Jovem/Acumulador)'; riskColor = 'var(--success)'; }

    // Verdict Sanitizado via DOM
    dom.verdict.innerHTML = "";
    
    const p1 = document.createElement("p");
    p1.innerHTML = `Com base na carteira de <strong>${escapeHTML(formatNumber(totalVidas))} beneficiários</strong>, a operadora apresenta um Perfil de Exposição Demográfica <span style="color:${riskColor}; font-weight:700;">${escapeHTML(riskLevel)}</span>.`;
    
    const p2 = document.createElement("p");
    p2.style.marginTop = "12px";
    p2.innerHTML = `A concentração de <strong>${idosos.toFixed(1)}% de idosos</strong> exige uma liquidez técnica mínima de <strong>${escapeHTML(formatCurrency(ibnr))}</strong> para cobertura de sinistros IBNR. 
                    O custo assistencial pro-forma ajustado pelo risco etário é de <strong>${escapeHTML(formatCurrency(avgCost))} por vida/mês</strong>, 
                    o que sugere a necessidade de uma PEONA mensal de <strong>${escapeHTML(formatCurrency(peona))}</strong> para manutenção da solvência operacional.`;
    
    dom.verdict.append(p1, p2);
    dom.verdictContainer.style.borderLeftColor = riskColor;
}

/**
 * Animação robusta com prevenção de race condition
 */
function animateValue(id, value, isCurrency) {
    const el = document.getElementById(id);
    if (!el) return;

    // Cancelar animação anterior no mesmo elemento
    if (activeAnimations[id]) {
        cancelAnimationFrame(activeAnimations[id]);
    }

    const start = 0;
    const end = value;
    const duration = 800;
    let startTime = null;

    function step(currentTime) {
        if (!startTime) startTime = currentTime;
        const progress = Math.min((currentTime - startTime) / duration, 1);
        const current = progress * (end - start) + start;
        el.textContent = isCurrency ? formatCurrency(current) : formatNumber(Math.floor(current));
        
        if (progress < 1) {
            activeAnimations[id] = requestAnimationFrame(step);
        } else {
            delete activeAnimations[id];
        }
    }
    activeAnimations[id] = requestAnimationFrame(step);
}

function initTheme() {
    const savedTheme = localStorage.getItem('finvest-theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
}

document.addEventListener('DOMContentLoaded', initActuarial);
