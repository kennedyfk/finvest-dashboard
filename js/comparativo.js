import { store } from './services/store.js';
import { initSidebar } from './sidebar.js';
import { openOperatorModal } from './components/operator_modal.js';
import { loadComponent, showToast, formatNumber, formatPercent } from './utils/ui.js';
import { smartSearch, normalizeText } from './utils/search.js';

let allOperatorsArray = [];
let selectedOperators = [];
let globalBenefData = {};
const MAX_COMPARE = 4;
const STORAGE_KEY = 'finvest_compare_ops';

// Chart instances
let radarChartInstance = null;
let barChartInstance = null;
let shareChartInstance = null;
let ageChartInstance = null;

const CHART_COLORS = [
    'rgba(124, 58, 237, 1)',   // Primary Purple
    'rgba(16, 185, 129, 1)',   // Emerald
    'rgba(245, 158, 11, 1)',   // Amber
    'rgba(59, 130, 246, 1)'    // Blue
];
const CHART_BG_COLORS = [
    'rgba(124, 58, 237, 0.2)',
    'rgba(16, 185, 129, 0.2)',
    'rgba(245, 158, 11, 0.2)',
    'rgba(59, 130, 246, 0.2)'
];

// Globals ref dates
let globalBenefRefDate = "";

// loadComponent now imported from utils/ui.js

function initTheme() {
    const saved = localStorage.getItem("finvest-theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
        document.documentElement.setAttribute("data-theme", "dark");
    } else {
        document.documentElement.setAttribute("data-theme", "light");
    }
    updateThemeIcons();
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const newTheme = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("finvest-theme", newTheme);
    updateThemeIcons();
    if (typeof renderCharts === "function" && selectedOperators.length > 0) renderCharts();
}

function updateThemeIcons() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const moon = document.querySelector(".icon-moon");
    const sun = document.querySelector(".icon-sun");
    if (moon && sun) {
        moon.style.display = isDark ? "none" : "block";
        sun.style.display = isDark ? "block" : "none";
    }
}

// showToast now imported from utils/ui.js

// Data loading
async function loadData() {
    try {
        const [cadopRes, benefRes] = await Promise.all([
            fetch('data/dados_cadop.json'),
            fetch('data/dados_beneficiarios.json')
        ]);

        const cadopData = await cadopRes.json();
        globalBenefData = await benefRes.json();

        // Find global ref date from benefData
        const extractRefDates = (obj) => {
            const dates = new Set();
            for (const key in obj) {
                dates.add(key);
            }
            return Array.from(dates).sort((a, b) => b.localeCompare(a));
        };
        const allDates = extractRefDates(globalBenefData[Object.keys(globalBenefData)[0]] || {});
        globalBenefRefDate = allDates.length > 0 ? allDates[0] : "";

        // Merge logic
        Object.keys(cadopData).forEach(registroAns => {
            const op = cadopData[registroAns];
            op.Registro_ANS = registroAns; // Set the key in the object

            const bData = globalBenefData[registroAns];
            const bMonth = bData && bData[globalBenefRefDate] ? bData[globalBenefRefDate] : null;

            if (bMonth) {
                Object.keys(bMonth).forEach(k => {
                    op[k] = parseFloat(bMonth[k]) || 0;
                });
            }
            allOperatorsArray.push(op);
        });

        loadCompareData();

    } catch (e) {
        console.error("Error loading data", e);
        showToast("Erro ao carregar banco de dados", "error");
    }
}

function saveCompareData() {
    const ansList = selectedOperators.map(o => o.Registro_ANS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ansList));
}

function loadCompareData() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (Array.isArray(saved) && saved.length > 0) {
            saved.forEach(ans => {
                const op = allOperatorsArray.find(o => o.Registro_ANS === ans);
                if (op && selectedOperators.length < MAX_COMPARE) {
                    selectedOperators.push(op);
                }
            });
        }
    } catch (e) {
        console.warn("Failed to load saved compare operators", e);
    }
}

function toggleFavorite(regAns) {
    store.toggleFavorite(regAns);
}

// formatNumber/formatPercent now imported from utils/ui.js

// ---- SKELETONS ----
function renderSkeletons() {
    const grid = document.getElementById("compareGrid");
    if (!grid) return;

    // Only show skeletons if we have saved data to load
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (saved.length === 0) return;

    let html = "";
    for (let i = 0; i < saved.length; i++) {
        html += `
            <div class="compare-card">
                <div class="compare-card-header">
                    <div class="skeleton skeleton-avatar"></div>
                    <div style="flex: 1; margin-left: 12px;">
                        <div class="skeleton skeleton-text" style="width: 80%;"></div>
                        <div class="skeleton skeleton-text" style="width: 40%; height: 0.6rem;"></div>
                    </div>
                </div>
                <div class="compare-card-body">
                    <div class="skeleton skeleton-text" style="width: 100%; height: 2rem; margin-bottom: 12px;"></div>
                    <div class="skeleton skeleton-text" style="width: 100%; height: 2rem;"></div>
                </div>
            </div>
        `;
    }
    grid.innerHTML = html;

    // Charts skeletons
    const chartContainers = [
        "barChart", "radarChart", "shareChart", "ageChart"
    ];
    chartContainers.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            const container = canvas.parentElement;
            if (container) {
                const skeleton = document.createElement("div");
                skeleton.className = "skeleton skeleton-rect chart-skeleton-placeholder";
                skeleton.style.position = "absolute";
                skeleton.style.top = "0";
                skeleton.style.left = "0";
                skeleton.style.zIndex = "5";
                container.style.position = "relative";
                container.appendChild(skeleton);
            }
        }
    });
}

function renderCards() {
    const grid = document.getElementById("compareGrid");
    const tagsBox = document.getElementById("compareSelectedTags");
    const clearAllBtn = document.getElementById("clearAllBtn");

    grid.innerHTML = "";
    tagsBox.innerHTML = "";

    document.getElementById("compareCountMsg").textContent = `${selectedOperators.length}/${MAX_COMPARE} selecionadas`;

    if (clearAllBtn) {
        clearAllBtn.style.display = selectedOperators.length > 0 ? "block" : "none";
    }

    if (selectedOperators.length === 0) {
        grid.innerHTML = `
            <div class="compare-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                </svg>
                <h2>Nenhuma operadora selecionada</h2>
                <p style="margin-top:8px;">Utilize a busca acima para adicionar empresas e comparar seu tamanho e atuação no mercado.</p>
            </div>
        `;
        // Hide charts on empty
        if (document.getElementById("chartsContainer")) {
            document.getElementById("chartsContainer").style.display = "none";
        }
        return;
    }

    // Determine max values for highlighting the "winner"
    const maxValues = {
        beneficiarios: Math.max(...selectedOperators.map(o => o.qt_beneficiario_ativo || 0)),
        idosos: Math.max(...selectedOperators.map(o => o.ativos_idosos_perc || 0)),
        renovacao: selectedOperators.map(o => o.razao_renovacao_geracional || 0).reduce((min, val) => val < min && val > 0 ? val : min, 9999) // Smaller is better or maybe higher? Actually for gerational renewal (youth/elderly), usually higher is "better" for risk pooling, let's just highlight Max.
    };
    maxValues.renovacao = Math.max(...selectedOperators.map(o => o.razao_renovacao_geracional || 0));

    selectedOperators.forEach(op => {
        const isBWinner = (op.qt_beneficiario_ativo || 0) === maxValues.beneficiarios && maxValues.beneficiarios > 0;

        const name = op.Nome_Fantasia && op.Nome_Fantasia.trim() !== "" ? op.Nome_Fantasia : op.Razao_Social;
        const initial = name.charAt(0).toUpperCase();

        // 1. Render tag in the box above (with Drag and Drop)
        const tag = document.createElement("div");
        tag.className = "compare-selected-tag";
        tag.draggable = true;
        tag.style.cssText = "background: var(--card-bg); border: 1px solid var(--border); border-radius: 20px; padding: 6px 14px; font-size: 0.8rem; display: flex; align-items: center; gap: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); animation: fadeIn 0.3s ease; cursor: grab;";
        tag.innerHTML = `
            <span style="font-weight: 600; color: var(--text); padding-right: 4px; border-right: 1px solid var(--border-light); cursor: pointer;" title="Arraste para reordenar" class="drag-handle">☰</span>
            <span style="font-weight: 600; color: var(--text);">${name}</span>
            <button class="remove-op-btn" style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 2px; margin-right: -4px; display: flex; align-items: center;" aria-label="Remover">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;

        tag.querySelector(".remove-op-btn").addEventListener("click", () => {
            selectedOperators = selectedOperators.filter(o => o.Registro_ANS !== op.Registro_ANS);
            saveCompareData();
            renderCards();
        });

        // Drag and Drop Events
        tag.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", op.Registro_ANS);
            tag.style.opacity = '0.5';
        });
        tag.addEventListener("dragend", () => {
            tag.style.opacity = '1';
        });
        tag.addEventListener("dragover", (e) => {
            e.preventDefault();
            tag.style.transform = "scale(1.05)";
        });
        tag.addEventListener("dragleave", (e) => {
            tag.style.transform = "scale(1)";
        });
        tag.addEventListener("drop", (e) => {
            e.preventDefault();
            tag.style.transform = "scale(1)";
            const draggedAns = e.dataTransfer.getData("text/plain");
            const targetAns = op.Registro_ANS;
            if (draggedAns && draggedAns !== targetAns) {
                const draggedIdx = selectedOperators.findIndex(o => o.Registro_ANS === draggedAns);
                const targetIdx = selectedOperators.findIndex(o => o.Registro_ANS === targetAns);
                if (draggedIdx > -1 && targetIdx > -1) {
                    const [draggedOp] = selectedOperators.splice(draggedIdx, 1);
                    selectedOperators.splice(targetIdx, 0, draggedOp);
                    saveCompareData();
                    renderCards();
                }
            }
        });

        tagsBox.appendChild(tag);

        // 2. Render Card
        const card = document.createElement("div");
        card.className = "compare-card";

        let statusClass = op.Status_Operadora === "ATIVA" ? "ativa" : "";

        // Verificando imagem
        const logoPath = `assets/logos/${op.Registro_ANS}.png`;
        const avatarHtml = `<div class="cc-avatar modal-trigger" style="cursor:pointer;" id="avatar-${op.Registro_ANS}">${initial}</div>`;

        card.innerHTML = `
            <div class="cc-header">
                ${avatarHtml}
                <div class="cc-title-wrap modal-trigger" style="cursor:pointer;">
                    <span class="cc-subtitle">ANS: ${op.Registro_ANS}</span>
                    <h3 class="cc-title" title="${op.Razao_Social}">${name}</h3>
                    <span class="cc-badge ${statusClass}">${op.Status_Operadora}</span>
                </div>
            </div>
            <div class="cc-metrics">
                <div class="cc-metric">
                    <span class="cc-metric-label">Modalidade</span>
                    <span class="cc-metric-value" style="font-size:1rem;">${op.Modalidade}</span>
                </div>
                <div class="cc-divider"></div>
                <div class="cc-metric">
                    <span class="cc-metric-label">Beneficiários Ativos</span>
                    <span class="cc-metric-value ${isBWinner && selectedOperators.length > 1 ? 'winner' : ''}">${formatNumber(op.qt_beneficiario_ativo)}</span>
                    <span class="cc-metric-sub">Ref: ${globalBenefRefDate || 'N/A'}</span>
                </div>
                <div class="cc-metric">
                    <span class="cc-metric-label">% Idosos na Carteira</span>
                    <span class="cc-metric-value">${formatPercent(op.ativos_idosos_perc)}</span>
                </div>
                <div class="cc-divider"></div>
                <div class="cc-metric">
                    <span class="cc-metric-label">Razão Dep. de Idosos</span>
                    <span class="cc-metric-value" style="font-size:1rem;">${formatNumber(op.razao_dependencia_de_idosos)}</span>
                </div>
                <div class="cc-metric">
                    <span class="cc-metric-label">Razão Renov. Geracional</span>
                    <span class="cc-metric-value" style="font-size:1rem;">${formatNumber(op.razao_renovacao_geracional)}</span>
                </div>
                <div class="cc-divider"></div>
                <div class="cc-metric">
                    <span class="cc-metric-label">Localização</span>
                    <span class="cc-metric-value" style="font-size:1rem;">${op.Cidade} - ${op.UF}</span>
                </div>
            </div>
        `;

        grid.appendChild(card);

        // Async load avatar
        const img = new Image();
        img.onload = () => {
            const av = document.getElementById(`avatar-${op.Registro_ANS}`);
            if (av) {
                av.innerHTML = `<img src="${logoPath}" alt="${name}">`;
            }
        };
        img.src = logoPath;

        // Modal listeners
        card.querySelectorAll(".modal-trigger").forEach(el => {
            el.addEventListener("click", () => openOperatorModal(op, globalBenefData));
        });
    });

    renderCharts();
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

    // Highest priority: Exact match (normalized)
    if (normTarget === normQuery) return -100;

    // High priority: Starts with query
    if (normTarget.startsWith(normQuery)) return -50;

    // Smart Match: If all keywords match
    if (smartSearch(text, query)) return -30;

    // Fallback to fuzzy word matching
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

function renderCharts() {
    const chartsContainer = document.getElementById("chartsContainer");
    if (!chartsContainer || selectedOperators.length === 0) return;

    // Remove skeletons
    document.querySelectorAll(".chart-skeleton-placeholder").forEach(el => el.remove());

    chartsContainer.style.display = "block";

    const operatorLabels = selectedOperators.map(op => {
        const name = op.Nome_Fantasia || op.Razao_Social || op.Registro_ANS.toString();
        return name.length > 20 ? name.substring(0, 20) + "..." : name;
    });

    // 1. Determine X-axis labels (Sorted Dates)
    const allDatesSet = new Set();
    selectedOperators.forEach(op => {
        const history = globalBenefData[op.Registro_ANS] || {};
        Object.keys(history).forEach(d => allDatesSet.add(d));
    });
    const sortedDates = Array.from(allDatesSet).sort();
    const dateLabels = sortedDates.map(d => `${d.substring(5, 7)}/${d.substring(2, 4)}`);

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textColor = isDark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.7)";
    const gridColor = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)";

    if (window.Chart) {
        Chart.defaults.color = textColor;
        Chart.defaults.font.family = "'Inter', sans-serif";

        // 1. Line Chart (Evolution) - Replaces the old bar chart
        const ctxEvolution = document.getElementById('barChart').getContext('2d');
        if (barChartInstance) barChartInstance.destroy();

        const datasets = selectedOperators.map((op, idx) => {
            const name = operatorLabels[idx];
            const history = globalBenefData[op.Registro_ANS] || {};

            return {
                label: name,
                data: sortedDates.map(d => history[d] ? history[d].qt_beneficiario_ativo || 0 : null),
                borderColor: CHART_COLORS[idx % CHART_COLORS.length],
                backgroundColor: CHART_BG_COLORS[idx % CHART_BG_COLORS.length],
                borderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
                tension: 0.3,
                fill: true
            };
        });

        barChartInstance = new Chart(ctxEvolution, {
            type: 'line',
            data: {
                labels: dateLabels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { boxWidth: 12, usePointStyle: true, font: { size: 10 } }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function (context) {
                                const val = Number(context.raw) || 0;
                                return " " + context.dataset.label + ": " + val.toLocaleString('pt-BR') + " vidas";
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: { color: gridColor },
                        ticks: {
                            callback: function (value) {
                                if (value >= 1000000) {
                                    let num = (value / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
                                    return num.replace('.', ',') + 'M';
                                }
                                if (value >= 1000) {
                                    let num = (value / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
                                    return num.replace('.', ',') + 'k';
                                }
                                return value.toLocaleString('pt-BR');
                            }
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });

        // 2. Radar Chart (Demographic Profile)
        const ctxRadar = document.getElementById('radarChart').getContext('2d');
        if (radarChartInstance) radarChartInstance.destroy();

        const radarMetrics = [
            { label: '% Idosos', key: 'ativos_idosos_perc' },
            { label: '% 0-14 Anos', key: 'ativos_ate_14_anos_perc' },
            { label: '% Até 4 Anos', key: 'ativos_ate_4_anos_perc' },
            { label: 'R.D. Idosos', key: 'razao_dependencia_de_idosos' },
            { label: 'R.D. Jovens', key: 'razao_dependencia_de_jovens' },
            { label: 'Índ. Envelhecimento', key: 'indice_de_envelhecimento' },
            { label: 'Índ. Longevidade', key: 'indice_de_longevidade' },
            { label: 'Renov. Geracional', key: 'razao_renovacao_geracional' }
        ];

        // Normalize each metric to 100 max
        const radarMax = {};
        radarMetrics.forEach(m => {
            let maxVal = Math.max(...selectedOperators.map(o => o[m.key] || 0));
            radarMax[m.key] = maxVal > 0 ? maxVal : 1;
        });

        const radarDatasets = selectedOperators.map((op, idx) => {
            const rawData = radarMetrics.map(m => op[m.key] || 0);
            const normalizedData = radarMetrics.map(m => ((op[m.key] || 0) / radarMax[m.key]) * 100);

            return {
                label: operatorLabels[idx],
                data: normalizedData,
                rawData: rawData, // for tooltip
                backgroundColor: CHART_BG_COLORS[idx % CHART_BG_COLORS.length],
                borderColor: CHART_COLORS[idx % CHART_COLORS.length],
                pointBackgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: CHART_COLORS[idx % CHART_COLORS.length],
                borderWidth: 2,
                fill: true
            };
        });

        const radarOptions = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: gridColor },
                    grid: { color: gridColor },
                    pointLabels: { color: textColor, font: { size: 10, weight: '500' } },
                    ticks: { display: false, stepSize: 20 },
                    suggestedMin: 0,
                    suggestedMax: 105
                }
            },
            plugins: {
                legend: { position: 'bottom', labels: { color: textColor, padding: 15, boxWidth: 12 } },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const ds = context.dataset;
                            const metric = radarMetrics[context.dataIndex];
                            const raw = ds.rawData[context.dataIndex];
                            let formatted = raw;
                            if (metric.label.includes('%')) formatted = formatPercent(raw);
                            else if (metric.key.startsWith('razao_') || metric.key.startsWith('indice_'))
                                formatted = raw.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            else formatted = formatNumber(raw);
                            return `${ds.label}: ${formatted}`;
                        }
                    }
                }
            }
        };

        radarChartInstance = new Chart(ctxRadar, {
            type: 'radar',
            data: {
                labels: radarMetrics.map(m => m.label),
                datasets: radarDatasets
            },
            options: radarOptions
        });

        // 3. Radar Metrics Grid (Modern rewrite)
        const tableContainer = document.getElementById('radarTableContainer');
        if (tableContainer) {
            let gridHtml = `
                <div class="benchmark-grid">
                    <div class="benchmark-header">
                        <div class="benchmark-cell label-cell header-cell">
                            <div class="cell-content">Indicador</div>
                            <div class="operator-bar" style="background: var(--border);"></div>
                        </div>
                        ${selectedOperators.map((op, idx) => `
                            <div class="benchmark-cell header-cell">
                                <div class="cell-content" title="${operatorLabels[idx]}">${operatorLabels[idx]}</div>
                                <div class="operator-bar" style="background: ${CHART_COLORS[idx % CHART_COLORS.length]};"></div>
                            </div>
                        `).join('')}
                    </div>
            `;

            radarMetrics.forEach(m => {
                gridHtml += `
                    <div class="benchmark-row">
                        <div class="benchmark-cell label-cell">${m.label}</div>
                        ${selectedOperators.map(op => {
                    const val = op[m.key] || 0;
                    let formatted = "";
                    if (m.label.includes('%')) {
                        formatted = val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
                    } else if (m.key.startsWith('razao_') || m.key.startsWith('indice_') || m.key.startsWith('ind_')) {
                        formatted = val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    } else {
                        formatted = val.toLocaleString('pt-BR');
                    }
                    return `<div class="benchmark-cell">${formatted}</div>`;
                }).join('')}
                    </div>
                `;
            });

            gridHtml += `</div>`;
            tableContainer.innerHTML = gridHtml;
        }

        // 4. Doughnut Chart (Market Share)
        const ctxShare = document.getElementById('shareChart').getContext('2d');
        if (shareChartInstance) shareChartInstance.destroy();

        const shareData = selectedOperators.map(op => parseFloat(op.qt_beneficiario_ativo) || 0);

        shareChartInstance = new Chart(ctxShare, {
            type: 'doughnut',
            data: {
                labels: operatorLabels,
                datasets: [{
                    data: shareData,
                    backgroundColor: CHART_COLORS,
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor, padding: 20, boxWidth: 12, usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.raw !== null) {
                                    const total = context.chart._metasets[context.datasetIndex].total;
                                    const percentage = total > 0 ? ((context.raw / total) * 100).toFixed(1) + '%' : '0%';
                                    label += context.raw.toLocaleString('pt-BR') + ' vidas (' + percentage + ')';
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });

        // Inject Share Table
        const totalShare = shareData.reduce((a, b) => a + b, 0);
        let shareTableHtml = `
            <table class="radar-metrics-table">
                <thead>
                    <tr>
                        <th style="padding-left:12px;">Operadora</th>
                        <th>Ativos</th>
                        <th>Proporção</th>
                    </tr>
                </thead>
                <tbody>
        `;
        selectedOperators.forEach((op, index) => {
            const val = shareData[index];
            const perc = totalShare > 0 ? ((val / totalShare) * 100).toFixed(1) + '%' : '0%';
            shareTableHtml += `
                <tr>
                    <td>
                        <div class="metric-label" style="display:flex; align-items:center; gap:8px; background:transparent; padding:0;">
                            <span style="display:inline-block; width:10px; height:10px; background:${CHART_COLORS[index]}; border-radius:50%; flex-shrink:0;"></span>
                            <span style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600;" title="${operatorLabels[index]}">${operatorLabels[index]}</span>
                        </div>
                    </td>
                    <td>${val.toLocaleString('pt-BR')}</td>
                    <td><strong style="color:var(--text);">${perc}</strong></td>
                </tr>
            `;
        });
        shareTableHtml += `</tbody></table>`;
        const shareContainer = document.getElementById('shareTableContainer');
        if (shareContainer) shareContainer.innerHTML = shareTableHtml;

        // 5. Stacked Bar Chart (Age Composition)
        const ctxAge = document.getElementById('ageChart').getContext('2d');
        if (ageChartInstance) ageChartInstance.destroy();

        const dataJovens = selectedOperators.map(op => parseFloat(op.ativos_ate_14_anos_perc) || 0);
        const dataIdosos = selectedOperators.map(op => parseFloat(op.ativos_idosos_perc) || 0);
        const dataAdultos = selectedOperators.map((op, i) => {
            let totalJovensIdosos = dataJovens[i] + dataIdosos[i];
            let adultos = 100 - totalJovensIdosos;
            return adultos > 0 ? adultos : 0;
        });

        ageChartInstance = new Chart(ctxAge, {
            type: 'bar',
            data: {
                labels: operatorLabels,
                datasets: [
                    {
                        label: '0 a 14 Anos',
                        data: dataJovens,
                        backgroundColor: 'rgba(59, 130, 246, 0.8)', // Blue
                    },
                    {
                        label: '15 a 59 Anos',
                        data: dataAdultos,
                        backgroundColor: 'rgba(16, 185, 129, 0.8)', // Green
                    },
                    {
                        label: '60+ Anos',
                        data: dataIdosos,
                        backgroundColor: 'rgba(124, 58, 237, 0.8)', // Purple
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y', // Horizontal bars
                scales: {
                    x: {
                        stacked: true,
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            callback: function (value) { return value + '%'; }
                        },
                        max: 100
                    },
                    y: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: textColor }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: textColor, boxWidth: 12, usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return context.dataset.label + ': ' + context.raw.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
                            }
                        }
                    }
                }
            }
        });

        // Inject Age Table
        let ageTableHtml = `
            <table class="radar-metrics-table">
                <thead>
                    <tr>
                        <th style="padding-left:12px;">Operadora</th>
                        <th style="color:rgba(59, 130, 246, 1);">0-14</th>
                        <th style="color:rgba(16, 185, 129, 1);">15-59</th>
                        <th style="color:rgba(124, 58, 237, 1);">60+</th>
                    </tr>
                </thead>
                <tbody>
        `;
        selectedOperators.forEach((op, index) => {
            const j = dataJovens[index];
            const a = dataAdultos[index];
            const i = dataIdosos[index];
            ageTableHtml += `
                <tr>
                    <td>
                        <div class="metric-label" style="display:flex; align-items:center; gap:8px; background:transparent; padding:0;">
                            <span style="display:inline-block; width:10px; height:10px; background:${CHART_COLORS[index]}; border-radius:50%; flex-shrink:0;"></span>
                            <span style="max-width:150px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600;" title="${operatorLabels[index]}">${operatorLabels[index]}</span>
                        </div>
                    </td>
                    <td>${j.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</td>
                    <td>${a.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</td>
                    <td><strong style="color:var(--text);">${i.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</strong></td>
                </tr>
            `;
        });
        ageTableHtml += `</tbody></table>`;
        const ageContainer = document.getElementById('ageTableContainer');
        if (ageContainer) ageContainer.innerHTML = ageTableHtml;
    }
}

function initSearch() {
    const input = document.getElementById("compareInput");
    const dropdown = document.getElementById("compareDropdown");

    input.addEventListener("input", (e) => {
        const val = e.target.value.trim();
        if (val.length < 2) {
            dropdown.classList.remove("active");
            return;
        }

        const maxErrors = Math.max(2, val.split(/\s+/).length * 1.5 + 1);

        // Unified Smart Fuzzy Search & Scoring
        let scored = allOperatorsArray.map(op => {
            const name = op.Nome_Fantasia || op.Razao_Social || "";
            let score = 999;

            // Strict ANS Matches
            if (val === op.Registro_ANS) score = -200;
            else if (op.Registro_ANS && op.Registro_ANS.includes(val)) score = -80;
            else {
                // Name fuzzy match
                score = getMatchScore(val, name);

                // Fallback secondary check against Razao Social if Nome Fantasia was used
                if (op.Nome_Fantasia && op.Razao_Social) {
                    const scoreRazao = getMatchScore(val, op.Razao_Social);
                    if (scoreRazao < score) score = scoreRazao;
                }
            }

            return { op, score };
        }).filter(item => item.score < maxErrors);

        // Sort by best match (lowest score)
        scored.sort((a, b) => a.score - b.score);

        let filtered = scored.map(item => item.op).slice(0, 10); // Limit to top 10

        if (filtered.length === 0) {
            dropdown.innerHTML = `<div style="padding:10px 16px; color:var(--text-muted); font-size:0.85rem;">Nenhuma operadora encontrada.</div>`;
        } else {
            dropdown.innerHTML = "";
            filtered.forEach(op => {
                const item = document.createElement("div");
                item.className = "autocomplete-item";
                const name = op.Nome_Fantasia || op.Razao_Social;
                item.innerHTML = `
                    <span class="ac-name">${name}</span>
                    <span class="ac-ans">Registro ANS: ${op.Registro_ANS} - ${op.UF}</span>
                `;
                item.addEventListener("click", () => {
                    if (selectedOperators.length >= MAX_COMPARE) {
                        showToast(`Máximo de ${MAX_COMPARE} operadoras atingido.`, "warning");
                    } else if (selectedOperators.some(o => o.Registro_ANS === op.Registro_ANS)) {
                        showToast("Esta operadora já foi adicionada.", "info");
                    } else {
                        selectedOperators.push(op);
                        saveCompareData();
                        renderCards();
                        input.value = "";
                    }
                    dropdown.classList.remove("active");
                });
                dropdown.appendChild(item);
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

document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    renderSkeletons();

    // Load components first
    await Promise.all([
        loadComponent("components/sidebar.html", "sidebarContainer"),
        loadComponent("components/operator_modal.html", "operatorModalContainer")
    ]);

    // Sidebar logic handled by initSidebar
    initSidebar();

    await loadData();
    initSearch();
    renderCards();
});
