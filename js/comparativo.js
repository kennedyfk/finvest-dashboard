let allOperatorsArray = [];
let selectedOperators = [];
let globalBenefData = {};
let favorites = new Set(JSON.parse(localStorage.getItem('finvest_favorites') || '[]').filter(x => x !== null && x !== undefined));
const MAX_COMPARE = 4;
const STORAGE_KEY = 'finvest_compare_ops';

// Chart instances
let radarChartInstance = null;
let barChartInstance = null;

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

async function loadComponent(url, targetId) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        const html = await response.text();
        const container = document.getElementById(targetId);
        if (container) {
            container.outerHTML = html;
        }
    } catch (err) {
        console.warn(`Component load failed for ${url}:`, err.message);
    }
}

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

function showToast(message, type = "info") {
    const toastContainer = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let icon = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    if (type === "success") icon = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    else if (type === "error" || type === "warning") icon = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

    toast.innerHTML = `${icon}<span class="toast-message">${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = "toastOut 0.3s ease forwards";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

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
    if (!regAns) return;
    if (favorites.has(regAns)) favorites.delete(regAns);
    else favorites.add(regAns);
    localStorage.setItem('finvest_favorites', JSON.stringify([...favorites]));
}

function formatNumber(num) {
    if (num === undefined || num === null || isNaN(num)) return "—";
    return num.toLocaleString('pt-BR');
}

function formatPercent(num) {
    if (num === undefined || num === null || isNaN(num)) return "—";
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

function renderCards() {
    const grid = document.getElementById("compareGrid");
    const tagsBox = document.getElementById("compareSelectedTags");
    grid.innerHTML = "";
    tagsBox.innerHTML = "";

    document.getElementById("compareCountMsg").textContent = `${selectedOperators.length}/${MAX_COMPARE} selecionadas`;

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
    query = query || "";
    text = text || "";
    const cleanQuery = query.toLowerCase().trim();
    const cleanText = text.toLowerCase().trim();

    // Highest priority for exact total match
    if (cleanText === cleanQuery) return -100;

    // High priority if the text starts exactly with the query
    if (cleanText.startsWith(cleanQuery + " ")) return -50;
    if (cleanText.startsWith(cleanQuery)) return -40;

    const cleanWord = (w) => w.replace(/ de | da | do | dos | das | e /g, ' ').trim();
    const qWords = cleanWord(cleanQuery).split(/\s+/).filter(w => w.length > 0);
    const tWords = cleanWord(cleanText).split(/\s+/).filter(w => w.length > 0);

    let score = 0;
    for (const qw of qWords) {
        let bestDist = 999;
        for (const tw of tWords) {
            if (tw === qw) { bestDist = 0; break; }
            if (tw.startsWith(qw)) { bestDist = Math.min(bestDist, 0.1); }
            if (tw.includes(qw)) { bestDist = Math.min(bestDist, 0.5); }
            const dist = levenshtein(qw, tw);
            if (dist < bestDist) bestDist = dist;
        }
        score += bestDist;
    }
    // slight penalty for much longer target names, to prefer exact matches
    score += Math.max(0, tWords.length - qWords.length) * 0.1;
    return score;
}

function renderCharts() {
    const chartsContainer = document.getElementById("chartsContainer");
    if (!chartsContainer || selectedOperators.length === 0) return;

    chartsContainer.style.display = "block";

    const labels = selectedOperators.map(op => {
        const name = op.Nome_Fantasia || op.Razao_Social || op.Registro_ANS.toString();
        return name.length > 20 ? name.substring(0, 20) + "..." : name;
    });

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textColor = isDark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.7)";
    const gridColor = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)";

    if (window.Chart) {
        Chart.defaults.color = textColor;
        Chart.defaults.font.family = "'Inter', sans-serif";

        // 1. Bar Chart (Total Beneficiarios)
        const ctxBar = document.getElementById('barChart').getContext('2d');
        if (barChartInstance) barChartInstance.destroy();

        barChartInstance = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Beneficiários Ativos',
                    data: selectedOperators.map(op => op.qt_beneficiario_ativo || 0),
                    backgroundColor: CHART_COLORS.slice(0, selectedOperators.length),
                    borderWidth: 0,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return " " + context.raw.toLocaleString('pt-BR') + " vidas";
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: {
                            callback: function (value) {
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
                                return value;
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
                label: labels[idx],
                data: normalizedData,
                rawData: rawData, // for tooltip
                backgroundColor: CHART_BG_COLORS[idx],
                borderColor: CHART_COLORS[idx],
                pointBackgroundColor: CHART_COLORS[idx],
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: CHART_COLORS[idx],
                borderWidth: 2,
                fill: true
            };
        });

        radarChartInstance = new Chart(ctxRadar, {
            type: 'radar',
            data: {
                labels: radarMetrics.map(m => m.label),
                datasets: radarDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: gridColor },
                        grid: { color: gridColor },
                        pointLabels: { color: textColor, font: { size: 10, weight: '500' } },
                        ticks: { display: false },
                        min: 0,
                        max: 100
                    }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { color: textColor, padding: 15, boxWidth: 12 } },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const rawVal = context.dataset.rawData[context.dataIndex];
                                return context.dataset.label + ": " + rawVal.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                            }
                        }
                    }
                }
            }
        });
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
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);
    document.getElementById("compareInput").addEventListener("focus", () => {
        document.getElementById("compareDropdown").classList.add("active");
    });

    // Load navbar and modal
    await Promise.all([
        loadComponent("components/sidebar.html", "sidebarContainer"),
        loadComponent("components/operator_modal.html", "operatorModalContainer")
    ]);

    // Sidebar logic
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebarToggle");

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.toggle("open");
        });
        document.addEventListener("click", (e) => {
            if (window.innerWidth <= 1024 && sidebar.classList.contains("open")) {
                if (!sidebar.contains(e.target) && e.target !== sidebarToggle && !sidebarToggle.contains(e.target)) {
                    sidebar.classList.remove("open");
                }
            }
        });
    }

    document.querySelectorAll(".nav-item").forEach(item => {
        if (item.dataset.page === "compare") {
            document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
            item.classList.add("active");
        }

        const href = item.getAttribute("href");
        if (href === "#") {
            item.addEventListener("click", (e) => {
                e.preventDefault();
                showToast("Em breve!", "info");
            });
        }
    });

    await loadData();
    initSearch();
    renderCards();
});
