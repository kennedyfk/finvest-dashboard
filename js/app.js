// ===========================
// Finvest P2P Trading Dashboard
// Application Logic
// ===========================

// ---- STATE ----
let operatorsData = {}; // Was tradersData
let beneficiaryData = {}; // Beneficiary data keyed by Registro ANS
let globalBenefRefDate = ''; // Global most recent date across ALL operators
let currentModalidade = "all"; // Use "all" as global default or MEDICINA
let statusFilter = "ATIVA";
let filterUFs = [];  // array of selected UFs (empty = all)
let filterModalities = [];  // array of selected modalities (empty = all)
let filterCity = "";
let currentPage = 1;
let rowsPerPage = 10;
let sortCol = "qt_beneficiario_ativo";
let sortAsc = false;
let currentViewData = [];

// Dynamic beneficiary columns
let selectedBenefColumns = ['qt_beneficiario_ativo'];

const BENEF_COLUMN_LABELS = {
    qt_beneficiario_ativo: 'Benef. Ativos',
    qt_beneficiario_aderido: 'Benef. Aderidos',
    qt_beneficiario_cancelado: 'Benef. Cancelados',
    qt_beneficiario_saldo: 'Saldo Benef.',
    ativos_ate_4_anos_perc: '% Até 4 anos',
    ativos_ate_14_anos_perc: '% Até 14 anos',
    ativos_idosos_perc: '% Idosos',
    razao_dependencia_de_idosos: 'R.D. Idosos',
    razao_dependencia_de_jovens: 'R.D. Jovens',
    indice_de_envelhecimento: 'Índ. Envelh.',
    indice_de_longevidade: 'Índ. Longev.',
    razao_sexo_terceira_idade: 'R. Sexo 3ª Id.',
    razao_renovacao_geracional: 'R. Renov. Ger.',
    idosos_plano_individual: '% Idosos P.I.'
};

// ---- HELPERS ----
function formatCNPJ(cnpj) {
    if (!cnpj) return "";
    const clean = cnpj.toString().replace(/\D/g, "");
    if (clean.length !== 14) return cnpj;
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function formatNumber(num) {
    if (num === null || num === undefined || num === '' || isNaN(num)) return '—';
    return Number(num).toLocaleString('pt-BR');
}

// Find the global most recent date across ALL operators in beneficiaryData
function findGlobalMaxDate() {
    let maxDate = '';
    Object.values(beneficiaryData).forEach(opDates => {
        Object.keys(opDates).forEach(date => {
            if (date > maxDate) maxDate = date;
        });
    });
    return maxDate;
}

// ---- COMPONENT LOADER ----
async function loadComponent(url, targetId) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        const html = await response.text();
        document.getElementById(targetId).innerHTML = html;
    } catch (err) {
        console.warn(`Component load failed for ${url}:`, err.message);
        // Fallback: try relative path variations
        console.log("Component will need a local server to load. Using inline fallback if available.");
    }
}

// ---- DATA LOADERS ----
async function loadData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        const rawData = await response.json();

        // Transform flat object into grouped by Modalidade
        operatorsData = {};
        Object.keys(rawData).forEach(key => {
            const op = rawData[key];
            const modalidade = op.Modalidade || "Outros";
            if (!operatorsData[modalidade]) operatorsData[modalidade] = [];

            // Add key (Registro ANS) to the object for logo mapping
            op.Registro_ANS = key;
            operatorsData[modalidade].push(op);
        });

    } catch (err) {
        console.error(`Data load failed for ${url}:`, err.message);
        operatorsData = {};
    }
}

async function loadBeneficiaryData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        beneficiaryData = await response.json();
        console.log(`Beneficiary data loaded: ${Object.keys(beneficiaryData).length} operators`);
    } catch (err) {
        console.error(`Beneficiary data load failed for ${url}:`, err.message);
        beneficiaryData = {};
    }
}

// Merge beneficiary data into operator objects using the global reference date
function mergeBeneficiaryData() {
    // Find the single global most recent date
    globalBenefRefDate = findGlobalMaxDate();
    console.log(`Global beneficiary reference date: ${globalBenefRefDate}`);

    const refDateShort = globalBenefRefDate ? globalBenefRefDate.substring(0, 7) : '';
    const allFields = Object.keys(BENEF_COLUMN_LABELS);

    Object.values(operatorsData).forEach(group => {
        group.forEach(op => {
            const opData = beneficiaryData[op.Registro_ANS];
            const benef = opData && opData[globalBenefRefDate] ? opData[globalBenefRefDate] : null;

            allFields.forEach(field => {
                if (benef && benef[field] !== undefined) {
                    op[field] = parseFloat(benef[field]) || 0;
                } else {
                    op[field] = 0;
                }
            });
            // Always set the same global reference date
            op.benef_ref_date = refDateShort;
        });
    });
}

// ---- INIT ----
async function initApp() {
    // Apply saved theme immediately
    initTheme();

    // Load sidebar component and data in parallel
    await Promise.all([
        loadComponent("components/sidebar.html", "sidebarContainer"),
        loadData("data/dados_cadop.json"),
        loadBeneficiaryData("data/dados_beneficiarios.json")
    ]);

    // Merge beneficiary data into operator objects
    mergeBeneficiaryData();

    // Cache DOM refs after components are loaded
    initDOMRefs();
    initEventListeners();
    renderTable();
}

// ---- THEME ----
function initTheme() {
    const saved = localStorage.getItem("finvest-theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
        document.documentElement.setAttribute("data-theme", "dark");
    }
}

function toggleTheme() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const newTheme = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("finvest-theme", newTheme);
}

// ---- DOM REFS ----
let tableBody, cryptoTabs, paginationInfo, prevPageBtn, nextPageBtn;
let rowsValue, buyModal, toastContainer, sidebarToggle, sidebar, searchInput;

function initDOMRefs() {
    tableBody = document.getElementById("tableBody");
    cryptoTabs = document.getElementById("cryptoTabs");
    paginationInfo = document.getElementById("paginationInfo");
    prevPageBtn = document.getElementById("prevPage");
    nextPageBtn = document.getElementById("nextPage");
    rowsValue = document.getElementById("rowsValue");
    buyModal = document.getElementById("buyModal");
    toastContainer = document.getElementById("toastContainer");
    sidebarToggle = document.getElementById("sidebarToggle");
    sidebar = document.getElementById("sidebar");
    searchInput = document.getElementById("searchInput");
}

// ---- SVG TEMPLATES ----
const verifiedSVG = `<svg class="verified-badge" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#f74b4b"/><path d="M6 10.5l2.5 2.5 5.5-5.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const clockSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

// ---- KPI UPDATES ----
function updateKPIs() {
    // KPIs should ideally reflect the current filtered data set (currentViewData)
    const data = currentViewData;

    // Active Operators
    const activeCount = data.filter(op => op.Status_Operadora === "ATIVA").length;
    document.getElementById("kpiTraders").textContent = activeCount.toLocaleString();

    // Total Unique Modalities in filtered set
    const modalities = new Set(data.map(op => op.Modalidade)).size;
    document.getElementById("kpiAvgPrice").textContent = modalities;

    // Active Rate (Active / Total)
    if (data.length > 0) {
        const activeRate = (activeCount / data.length) * 100;
        document.getElementById("kpiAvgRate").textContent = `${activeRate.toFixed(1)}%`;
    } else {
        document.getElementById("kpiAvgRate").textContent = "0%";
    }

    // Total Beneficiários (sum of qt_beneficiario_ativo)
    const totalBenef = data.reduce((sum, op) => sum + (op.qt_beneficiario_ativo || 0), 0);
    document.getElementById("kpiTotalOrders").textContent = totalBenef.toLocaleString('pt-BR');
}

// ---- RENDER DYNAMIC HEADERS ----
function renderDynamicHeaders() {
    const headerRow = document.querySelector('#tradeTable thead tr');
    // Remove any previously added dynamic columns
    headerRow.querySelectorAll('.dynamic-benef-col').forEach(el => el.remove());

    // Add headers for each selected beneficiary column
    selectedBenefColumns.forEach(col => {
        const th = document.createElement('th');
        th.className = 'col-beneficiary sortable dynamic-benef-col';
        th.setAttribute('data-sort', col);
        if (sortCol === col) {
            th.classList.add('current-sort', sortAsc ? 'asc' : 'desc');
        }
        th.innerHTML = `${BENEF_COLUMN_LABELS[col]} <span class="sort-icon"></span>`;
        th.addEventListener('click', () => {
            if (sortCol === col) {
                sortAsc = !sortAsc;
            } else {
                sortCol = col;
                sortAsc = true;
            }
            document.querySelectorAll('.trade-table th.sortable').forEach(el => {
                el.classList.remove('current-sort', 'asc', 'desc');
            });
            th.classList.add('current-sort', sortAsc ? 'asc' : 'desc');
            currentPage = 1;
            renderTable();
        });
        headerRow.appendChild(th);
    });
}

// ---- RENDER TABLE ----
function renderTable() {
    let rawData = [];
    if (currentModalidade === "all") {
        Object.values(operatorsData).forEach(group => rawData = rawData.concat(group));
    } else {
        rawData = operatorsData[currentModalidade] || [];
    }

    let filteredData = [...rawData];

    // 1. Status Filter (Header select)
    if (statusFilter !== "all") {
        filteredData = filteredData.filter(op => op.Status_Operadora === statusFilter);
    }

    // 2. UF Filter (Advanced) - multi-select
    if (filterUFs.length > 0) {
        filteredData = filteredData.filter(op => filterUFs.includes(op.UF));
    }

    // 2b. Modality Filter (Advanced) - multi-select
    if (filterModalities.length > 0) {
        filteredData = filteredData.filter(op => filterModalities.includes(op.Modalidade));
    }

    // 3. City Filter (Advanced)
    if (typeof filterCity !== 'undefined' && filterCity) {
        const cityQuery = filterCity.toLowerCase().trim();
        filteredData = filteredData.filter(op => op.Cidade && op.Cidade.toLowerCase().includes(cityQuery));
    }

    // 4. Global Search
    const query = (searchInput && searchInput.value) ? searchInput.value.toLowerCase().trim() : "";
    if (query) {
        filteredData = filteredData.filter(op =>
            op.Razao_Social.toLowerCase().includes(query) ||
            (op.Nome_Fantasia && op.Nome_Fantasia.toLowerCase().includes(query)) ||
            op.CNPJ.includes(query) ||
            (op.Cidade && op.Cidade.toLowerCase().includes(query))
        );
    }

    currentViewData = filteredData;
    updateKPIs(); // Update KPIs whenever table data changes

    // Sort data
    filteredData.sort((a, b) => {
        let valA = a[sortCol] || "";
        let valB = b[sortCol] || "";

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    currentViewData = filteredData;

    // Update KPIs
    updateKPIs();
    const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
    const startIdx = (currentPage - 1) * rowsPerPage;
    const endIdx = Math.min(startIdx + rowsPerPage, filteredData.length);
    const pageData = filteredData.slice(startIdx, endIdx);

    tableBody.innerHTML = "";

    // Render dynamic beneficiary column headers
    renderDynamicHeaders();

    const totalColCount = 5 + selectedBenefColumns.length;
    if (pageData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="${totalColCount}" style="text-align:center; padding:48px 16px; color:var(--text-muted);">
                    <div style="font-size:2rem; margin-bottom:8px;">📭</div>
                    <div>Nenhuma operadora encontrada ${currentModalidade !== 'all' ? `em ${currentModalidade}` : ''} ${statusFilter !== 'all' ? `com status ${statusFilter}` : ''}</div>
                </td>
            </tr>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();

    pageData.forEach((op, index) => {
        const isAtiva = op.Status_Operadora === "ATIVA";
        const row = document.createElement("tr");
        row.style.animationDelay = `${index * 0.04}s`;
        row.classList.add("table-row-animate");

        const initial = op.Nome_Fantasia ? op.Nome_Fantasia.charAt(0) : op.Razao_Social.charAt(0);
        const color = ["purple", "indigo", "blue", "pink", "green", "orange", "red", "teal"][index % 8];
        const logoPath = `assets/logos/${op.Registro_ANS}.png`;

        row.innerHTML = `
            <td>
                <div class="advertiser-cell">
                    <div class="logo-container-wrapper">
                        <div class="advertiser-avatar color-${color}" id="avatar-${op.Registro_ANS}">
                            ${initial}
                        </div>
                    </div>
                    <div class="advertiser-info">
                        <span class="advertiser-name clickable-name" data-index="${startIdx + index}">
                            ${op.Nome_Fantasia || op.Razao_Social}
                            ${isAtiva ? verifiedSVG : ''}
                        </span>
                        <span class="advertiser-stats">
                            ANS: ${op.Registro_ANS}
                        </span>
                        ${!isAtiva && op.Motivo_do_Descredenciamento ? `<span class="advertiser-stats" style="color:var(--danger);font-size:0.68rem;">${op.Motivo_do_Descredenciamento}</span>` : ''}
                    </div>
                </div>
            </td>
            <td>
                <span class="price-cell">${formatCNPJ(op.CNPJ)}</span>
            </td>
            <td>
                <div class="review-cell">
                    <div class="review-rate">
                        <span class="status-badge ${isAtiva ? 'high' : 'low'}">
                            ${op.Status_Operadora}
                        </span>
                    </div>
                    <div class="review-time">
                        ${!isAtiva && op.Data_Descredenciamento ? `Cancelada ${op.Data_Descredenciamento.substring(5, 7)}/${op.Data_Descredenciamento.substring(0, 4)}` : `Desde ${op.Data_Registro_ANS.split('-')[0]}`}
                    </div>
                </div>
            </td>
            <td>
                <span class="payment-cell">${op.Modalidade}</span>
            </td>
            <td>
                <div class="limit-cell">
                    <span class="limit-amount">${op.Cidade}</span>
                    <span class="limit-range">${op.UF}</span>
                </div>
            </td>
            ${selectedBenefColumns.map(col => `
            <td>
                <div class="beneficiary-cell">
                    <span class="beneficiary-count">${formatNumber(op[col])}</span>
                    <span class="beneficiary-date">Período: ${op.benef_ref_date.split('-').reverse().join('/')}</span>
                </div>
            </td>`).join('')}
        `;

        // Attempt to load logo
        const img = new Image();
        img.src = logoPath;
        img.onload = () => {
            const avatarDiv = row.querySelector(`#avatar-${op.Registro_ANS}`);
            if (avatarDiv) {
                avatarDiv.classList.add("logo-loaded");
                avatarDiv.innerHTML = `<img src="${logoPath}" alt="${op.Nome_Fantasia}" style="width:auto; height:66%; border-radius:inherit; object-fit:contain;">`;
                avatarDiv.style.background = "rgba(255, 255, 255, 0.00)";
                avatarDiv.style.border = "1px solid rgba(0, 0, 0, 0.05)";
            }
        };

        fragment.appendChild(row);
    });

    tableBody.appendChild(fragment);

    // Update pagination
    paginationInfo.textContent = `${startIdx + 1}-${endIdx} de ${filteredData.length}`;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;

    // Bind buy modal trigger
    document.querySelectorAll(".clickable-name").forEach(el => {
        el.addEventListener("click", (e) => {
            const idx = parseInt(e.currentTarget.dataset.index);
            openBuyModal(idx);
        });
    });
}

function formatPrice(price) {
    if (price >= 1000) {
        return price.toLocaleString("en-US");
    }
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}



// ---- BUY MODAL (ENRICHED) ----
let currentModalTrader = null;

function openBuyModal(index) {
    const op = currentViewData[index];
    if (!op) return;
    currentModalTrader = op;

    // Reset to Details tab
    document.querySelectorAll(".modal-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".modal-tab-content").forEach(t => t.classList.remove("active"));
    document.querySelector('.modal-tab[data-tab="details"]').classList.add("active");
    document.getElementById("tabDetails").classList.add("active");

    // Basic info
    const opName = op.Nome_Fantasia && op.Nome_Fantasia.trim() !== "" ? op.Nome_Fantasia : op.Razao_Social;
    document.getElementById("modalCryptoName").textContent = opName;
    const regAnsEl = document.getElementById("modalCryptoReg");
    if (regAnsEl) {
        // Format reg with leading zeros if it's less than 6 digits
        const regFormatted = op.Registro_ANS.toString().padStart(6, '0');
        regAnsEl.textContent = `Registro ANS: ${regFormatted}`;
    }
    const initial = op.Nome_Fantasia ? op.Nome_Fantasia.charAt(0) : op.Razao_Social.charAt(0);
    // Try logo in modal too
    const logoPath = `assets/logos/${op.Registro_ANS}.png`;
    const img = new Image();
    const modalAvatar = document.getElementById("modalAvatar");
    modalAvatar.className = `seller-avatar`;
    modalAvatar.style.background = getGradient("purple");
    modalAvatar.innerHTML = initial;

    img.onload = () => {
        modalAvatar.classList.add("logo-loaded");
        modalAvatar.innerHTML = `<img src="${logoPath}" alt="${op.Nome_Fantasia}" style="width:auto; height:66%; border-radius:inherit; object-fit:contain;">`;
        modalAvatar.style.background = "rgba(255, 255, 255, 0.00)";
    };
    img.src = logoPath;

    document.getElementById("modalSellerName").textContent = op.Nome_Fantasia || op.Razao_Social;
    document.getElementById("modalSellerStats").textContent = `ANS: ${op.Registro_ANS} | ${op.Status_Operadora}`;
    document.getElementById("modalPrice").textContent = formatCNPJ(op.CNPJ);
    document.getElementById("modalAvailable").textContent = op.Modalidade;
    document.getElementById("modalLimit").textContent = `${op.Cidade} - ${op.UF}`;

    // Website link formatting
    const website = op.Endereco_eletronico || "";
    const websiteEl = document.getElementById("modalPayment");
    if (website) {
        const fullUrl = website.startsWith("http") ? website : `http://www.${website.replace(/^www\./, "")}`;
        const displayUrl = website.startsWith("www.") ? website : `www.${website}`;
        websiteEl.innerHTML = `<a href="${fullUrl}" target="_blank" style="color:var(--primary); text-decoration:underline;">${displayUrl}</a>`;
    } else {
        websiteEl.textContent = "N/A";
    }

    const receiveCurrencyEl = document.getElementById("receiveCurrency");
    if (receiveCurrencyEl) receiveCurrencyEl.textContent = "ANS";

    // Hide or disable trading inputs (if they exist)
    const inputGroups = document.querySelectorAll('.modal-input-group');
    if (inputGroups[0]) inputGroups[0].style.display = "none";
    if (inputGroups[1]) inputGroups[1].style.display = "none";

    // Sparkline (Disable if exists)
    const sparklineSection = document.querySelector('.sparkline-section');
    if (sparklineSection) sparklineSection.style.display = "none";

    // Populate Demografia tab
    populateDemografia(op.Registro_ANS);

    // Rating breakdown (Disable)
    document.getElementById("rn518").innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">Indicadores RN518 Indisponível</div>`;

    // Rating breakdown (Disable)
    document.getElementById("cbr").innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">Indicadores CBR Indisponível</div>`;

    document.getElementById("modalConfirm").textContent = `Fechar Detalhes`;
    buyModal.classList.add("active");
}

function populateDemografia(regAns) {
    const metricsGrid = document.getElementById("demoMetrics");
    const chartContainer = document.getElementById("demoChartContainer");
    const opData = beneficiaryData[regAns];

    if (!opData || Object.keys(opData).length === 0) {
        metricsGrid.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted); grid-column: 1/-1;">Dados demográficos indisponíveis para esta operadora.</div>`;
        chartContainer.innerHTML = '';
        return;
    }

    // Sort dates ascending
    const dates = Object.keys(opData).sort();
    const latestDate = dates[dates.length - 1];
    const latest = opData[latestDate];

    // Format reference date
    const refMM = latestDate.substring(5, 7);
    const refYYYY = latestDate.substring(0, 4);

    // Key metrics for grid
    const metrics = [
        { label: 'Benef. Ativos', value: Number(latest.qt_beneficiario_ativo || 0).toLocaleString('pt-BR'), icon: '👥' },
        { label: 'Aderidos', value: Number(latest.qt_beneficiario_aderido || 0).toLocaleString('pt-BR'), icon: '📈' },
        { label: 'Cancelados', value: Number(latest.qt_beneficiario_cancelado || 0).toLocaleString('pt-BR'), icon: '📉' },
        { label: 'Saldo', value: Number(latest.qt_beneficiario_saldo || 0).toLocaleString('pt-BR'), icon: '📊' },
        { label: '% Ativos até 4 anos', value: `${parseFloat(latest.ativos_ate_4_anos_perc || 0).toFixed(2)}%`, icon: '👶' },
        { label: '% Ativos até 14 anos', value: `${parseFloat(latest.ativos_ate_14_anos_perc || 0).toFixed(2)}%`, icon: '🧒' },
        { label: '% Ativos Idosos', value: `${parseFloat(latest.ativos_idosos_perc || 0).toFixed(2)}%`, icon: '👴' },
        { label: 'Dep. Idosos', value: parseFloat(latest.razao_dependencia_de_idosos || 0).toFixed(2), icon: '🏥' },
        { label: 'Dep. Jovens', value: parseFloat(latest.razao_dependencia_de_jovens || 0).toFixed(2), icon: '🧑' },
        { label: 'Índ. Envelhecimento', value: parseFloat(latest.indice_de_envelhecimento || 0).toFixed(2), icon: '📅' },
        { label: 'Índ. Longevidade', value: parseFloat(latest.indice_de_longevidade || 0).toFixed(2), icon: '⏳' },
        { label: 'Sexo 3ª Idade', value: parseFloat(latest.razao_sexo_terceira_idade || 0).toFixed(2), icon: '⚤' },
        { label: 'Renov. Geracional', value: parseFloat(latest.razao_renovacao_geracional || 0).toFixed(2), icon: '🔄' },
        { label: '% Idosos P. Indiv.', value: `${parseFloat(latest.idosos_plano_individual || 0).toFixed(2)}%`, icon: '🏠' },
    ];

    metricsGrid.innerHTML = `
        <div class="demo-ref-date">Ref: ${refMM}/${refYYYY}</div>
        ${metrics.map(m => `
            <div class="demo-metric-card">
                <span class="demo-metric-icon">${m.icon}</span>
                <div class="demo-metric-info">
                    <span class="demo-metric-value">${m.value}</span>
                    <span class="demo-metric-label">${m.label}</span>
                </div>
            </div>
        `).join('')}
    `;

    // ---- LINE CHART ----
    const chartData = dates.map(d => ({
        date: d,
        label: `${d.substring(5, 7)}/${d.substring(2, 4)}`,
        value: Number(opData[d].qt_beneficiario_ativo || 0)
    }));

    if (chartData.length < 2) {
        chartContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">Dados insuficientes para gráfico.</div>`;
        return;
    }

    const W = 480, H = 180;
    const padL = 60, padR = 16, padT = 16, padB = 36;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const values = chartData.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    // Generate points
    const points = chartData.map((d, i) => {
        const x = padL + (i / (chartData.length - 1)) * plotW;
        const y = padT + plotH - ((d.value - minVal) / range) * plotH;
        return { x, y, ...d };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${padT + plotH} L${points[0].x.toFixed(1)},${padT + plotH} Z`;

    // Y-axis labels (5 ticks)
    const yTicks = 5;
    let yLabels = '';
    let gridLines = '';
    for (let i = 0; i <= yTicks; i++) {
        const val = minVal + (range * i / yTicks);
        const y = padT + plotH - (i / yTicks) * plotH;
        const formattedVal = val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0);
        yLabels += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${formattedVal}</text>`;
        gridLines += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-dasharray="3,3" opacity="0.5"/>`;
    }

    // X-axis labels (show every Nth)
    const maxXLabels = 8;
    const step = Math.ceil(chartData.length / maxXLabels);
    let xLabels = '';
    for (let i = 0; i < chartData.length; i += step) {
        xLabels += `<text x="${points[i].x}" y="${H - 6}" text-anchor="middle" fill="var(--text-muted)" font-size="10">${points[i].label}</text>`;
    }

    // Dots + invisible hover targets
    const dots = points.map(p => `
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="var(--primary)" stroke="#fff" stroke-width="1.5"/>
        <title>${p.label}: ${p.value.toLocaleString('pt-BR')}</title>
    `).join('');

    chartContainer.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%; height:auto;">
            ${gridLines}
            ${yLabels}
            ${xLabels}
            <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.25"/>
                    <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.02"/>
                </linearGradient>
            </defs>
            <path d="${areaPath}" fill="url(#areaGrad)"/>
            <path d="${linePath}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            ${dots}
        </svg>
    `;
}

function closeBuyModal() {
    buyModal.classList.remove("active");
    currentModalTrader = null;
}

function getGradient(color) {
    const gradients = {
        purple: "linear-gradient(135deg, #7c3aed, #6d28d9)",
        orange: "linear-gradient(135deg, #f97316, #ea580c)",
        blue: "linear-gradient(135deg, #3b82f6, #2563eb)",
        pink: "linear-gradient(135deg, #ec4899, #db2777)",
        green: "linear-gradient(135deg, #10b981, #059669)",
        red: "linear-gradient(135deg, #ef4444, #dc2626)",
        teal: "linear-gradient(135deg, #14b8a6, #0d9488)",
        indigo: "linear-gradient(135deg, #6366f1, #4f46e5)",
    };
    return gradients[color] || gradients.purple;
}

// ---- SPARKLINE ----
function generateSparklineSVG(prices, highlightPrice) {
    if (!prices || prices.length === 0) return "";

    const width = 400;
    const height = 50;
    const padding = 4;
    const sorted = [...prices].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const range = max - min || 1;

    // Create points for the sparkline
    const points = sorted.map((p, i) => {
        const x = padding + (i / (sorted.length - 1)) * (width - padding * 2);
        const y = height - padding - ((p - min) / range) * (height - padding * 2);
        return `${x},${y}`;
    }).join(" ");

    // Fill area under the line
    const firstX = padding;
    const lastX = padding + (width - padding * 2);
    const fillPoints = `${firstX},${height} ${points} ${lastX},${height}`;

    // Highlight dot position
    const hlIdx = sorted.indexOf(highlightPrice);
    const hlX = hlIdx >= 0 ? padding + (hlIdx / (sorted.length - 1)) * (width - padding * 2) : -10;
    const hlY = hlIdx >= 0 ? height - padding - ((highlightPrice - min) / range) * (height - padding * 2) : -10;

    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.2"/>
                <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <polygon points="${fillPoints}" fill="url(#sparkGrad)"/>
        <polyline points="${points}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${hlX}" cy="${hlY}" r="4" fill="var(--primary)" stroke="#fff" stroke-width="2"/>
    </svg>`;
}

// ---- BANK BADGES ----
function generateBankBadges(banksStr) {
    if (!banksStr) return "";
    const bankIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>`;
    return banksStr.split(",").map(b =>
        `<span class="bank-badge">${bankIcon} ${b.trim()}</span>`
    ).join("");
}

// ---- TRADE HISTORY (Simulated) ----
function generateTradeHistory(trader) {
    const types = ["buy", "sell"];
    const now = new Date();
    let items = "";

    // Generate 6 simulated trades based on trader data
    for (let i = 0; i < 6; i++) {
        const type = types[i % 2];
        const daysAgo = Math.floor(Math.random() * 14) + 1;
        const date = new Date(now - daysAgo * 86400000);
        const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

        // Vary the price slightly
        const variance = (Math.random() - 0.5) * trader.price * 0.06;
        const price = Math.round(trader.price + variance);

        // Random amount
        const amount = (Math.random() * 0.5 + 0.01).toFixed(6);
        const value = (amount * price).toFixed(2);

        const icon = type === "buy"
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="17 14 12 9 7 14"/><line x1="12" y1="9" x2="12" y2="21"/></svg>`;

        items += `
            <div class="trade-history-item">
                <div class="trade-history-left">
                    <div class="trade-history-icon ${type}">${icon}</div>
                    <div class="trade-history-info">
                        <span class="trade-history-type">${type === "buy" ? "Bought" : "Sold"} ${currentCrypto}</span>
                        <span class="trade-history-date">${dateStr} at ${timeStr}</span>
                    </div>
                </div>
                <div class="trade-history-right">
                    <span class="trade-history-amount">${amount} ${currentCrypto}</span>
                    <span class="trade-history-value">$${formatPrice(parseFloat(value))}</span>
                </div>
            </div>`;
    }

    return items;
}

// ---- RATING BREAKDOWN ----
function generateRatingBreakdown(trader) {
    // Calculate overall score from rate, completion, and time
    const timeScore = Math.max(0, 100 - (trader.time / 60) * 100); // Lower time = higher score
    const overallScore = ((trader.rate + trader.completion + timeScore) / 3).toFixed(1);

    // Star calculation (out of 5)
    const starCount = Math.round((overallScore / 100) * 5);
    const starSVG = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" width="16" height="16"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    const emptyStarSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" width="16" height="16"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

    let stars = "";
    for (let i = 0; i < 5; i++) {
        stars += i < starCount ? starSVG : emptyStarSVG;
    }

    function getBarClass(value) {
        if (value >= 95) return "excellent";
        if (value >= 85) return "good";
        if (value >= 70) return "warning";
        return "danger";
    }

    function getTimeLabel(min) {
        if (min <= 10) return "Very Fast";
        if (min <= 20) return "Fast";
        if (min <= 45) return "Average";
        return "Slow";
    }

    return `
        <div class="rating-overview">
            <span class="rating-score">${overallScore}</span>
            <div class="rating-score-info">
                <div class="rating-stars">${stars}</div>
                <span class="rating-count">${trader.orders.toLocaleString()} total orders</span>
            </div>
        </div>
        <div class="rating-metrics">
            <div class="rating-metric">
                <div class="rating-metric-header">
                    <span class="rating-metric-label">Approval Rate</span>
                    <span class="rating-metric-value">${trader.rate.toFixed(1)}%</span>
                </div>
                <div class="rating-metric-bar">
                    <div class="rating-metric-fill ${getBarClass(trader.rate)}" style="width: ${trader.rate}%"></div>
                </div>
            </div>
            <div class="rating-metric">
                <div class="rating-metric-header">
                    <span class="rating-metric-label">Completion Rate</span>
                    <span class="rating-metric-value">${trader.completion.toFixed(1)}%</span>
                </div>
                <div class="rating-metric-bar">
                    <div class="rating-metric-fill ${getBarClass(trader.completion)}" style="width: ${trader.completion}%"></div>
                </div>
            </div>
            <div class="rating-metric">
                <div class="rating-metric-header">
                    <span class="rating-metric-label">Response Time</span>
                    <span class="rating-metric-value">${trader.time} min · ${getTimeLabel(trader.time)}</span>
                </div>
                <div class="rating-metric-bar">
                    <div class="rating-metric-fill ${getBarClass(timeScore)}" style="width: ${timeScore}%"></div>
                </div>
            </div>
            <div class="rating-metric">
                <div class="rating-metric-header">
                    <span class="rating-metric-label">Trust Score</span>
                    <span class="rating-metric-value">${trader.verified ? "✓ Verified" : "Unverified"}</span>
                </div>
                <div class="rating-metric-bar">
                    <div class="rating-metric-fill ${trader.verified ? "excellent" : "warning"}" style="width: ${trader.verified ? 100 : 40}%"></div>
                </div>
            </div>
        </div>`;
}

// ---- FAVORITES / WATCHLIST ----
function getFavorites() {
    try {
        return JSON.parse(localStorage.getItem("finvest-favorites")) || [];
    } catch {
        return [];
    }
}

function isFavorite(name) {
    return getFavorites().includes(name);
}

function toggleFavorite(name) {
    let favs = getFavorites();
    if (favs.includes(name)) {
        favs = favs.filter(n => n !== name);
        showToast(`${name} removed from Watchlist`, "info");
    } else {
        favs.push(name);
        showToast(`${name} added to Watchlist ★`, "success");
    }
    localStorage.setItem("finvest-favorites", JSON.stringify(favs));
}


// ---- TOAST NOTIFICATIONS ----
function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let iconSVG = "";
    if (type === "success") {
        iconSVG = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 16 9"/></svg>`;
    } else if (type === "error") {
        iconSVG = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
        iconSVG = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#f74b4b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `${iconSVG}<span class="toast-message">${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = "toastOut 0.3s ease forwards";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ---- EVENT LISTENERS ----
function initEventListeners() {
    // Crypto tabs (Modalidades)
    cryptoTabs.addEventListener("click", (e) => {
        const tab = e.target.closest(".crypto-tab");
        if (!tab) return;

        document.querySelectorAll(".crypto-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        currentModalidade = tab.dataset.modalidade;
        currentPage = 1;
        renderTable();
    });

    // ---- FILTER MODAL ----
    const filterBtn = document.getElementById("filterBtn");
    const filterModal = document.getElementById("filterModal");
    const filterModalClose = document.getElementById("filterModalClose");
    const filterApply = document.getElementById("filterApply");
    const filterReset = document.getElementById("filterReset");
    const filterModalityList = document.getElementById("filterModalityList");
    const filterStatusSelect = document.getElementById("filterStatus");
    const filterUFList = document.getElementById("filterUFList");
    const filterCityInput = document.getElementById("filterCity");

    // Helper: set checkboxes from array
    function syncCheckboxes(container, values) {
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = values.includes(cb.value);
        });
    }
    // Helper: read checked values from container
    function readCheckboxes(container) {
        return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    }

    // Helper: update trigger text based on checked count
    function updateTriggerText(wrapper, defaultText) {
        const trigger = wrapper.querySelector('.filter-dropdown-text');
        const count = wrapper.querySelectorAll('input[type="checkbox"]:checked').length;
        trigger.textContent = count > 0 ? `${count} selecionado${count > 1 ? 's' : ''}` : defaultText;
    }

    // Toggle dropdowns
    const filterModalityWrapper = document.getElementById('filterModalityWrapper');
    const filterUFWrapper = document.getElementById('filterUFWrapper');

    document.getElementById('filterModalityTrigger').addEventListener('click', (e) => {
        e.preventDefault();
        filterModalityWrapper.classList.toggle('open');
    });
    document.getElementById('filterUFTrigger').addEventListener('click', (e) => {
        e.preventDefault();
        filterUFWrapper.classList.toggle('open');
    });

    // Update trigger text on checkbox change
    filterModalityList.addEventListener('change', () => {
        updateTriggerText(filterModalityWrapper, 'Todas as Modalidades');
    });
    filterUFList.addEventListener('change', () => {
        updateTriggerText(filterUFWrapper, 'Todos os Estados');
    });

    if (filterBtn) {
        filterBtn.addEventListener("click", () => {
            syncCheckboxes(filterModalityList, filterModalities);
            filterStatusSelect.value = statusFilter;
            syncCheckboxes(filterUFList, filterUFs);
            filterCityInput.value = filterCity;
            // Update trigger texts
            updateTriggerText(filterModalityWrapper, 'Todas as Modalidades');
            updateTriggerText(filterUFWrapper, 'Todos os Estados');
            // Close any open dropdowns
            filterModalityWrapper.classList.remove('open');
            filterUFWrapper.classList.remove('open');
            filterModal.classList.add("active");
        });
    }

    if (filterModalClose) {
        filterModalClose.addEventListener("click", () => filterModal.classList.remove("active"));
    }

    if (filterApply) {
        filterApply.addEventListener("click", () => {
            const selectedModalities = readCheckboxes(filterModalityList);
            // If modalities are selected, set filterModalities; also sync currentModalidade
            filterModalities = selectedModalities;
            if (selectedModalities.length === 1) {
                currentModalidade = selectedModalities[0];
            } else {
                currentModalidade = "all";
            }
            statusFilter = filterStatusSelect.value;
            filterUFs = readCheckboxes(filterUFList);
            filterCity = filterCityInput.value;

            // Sync tabs
            document.querySelectorAll(".crypto-tab").forEach(t => {
                t.classList.toggle("active", t.dataset.modalidade === currentModalidade);
            });

            currentPage = 1;
            renderTable();
            filterModal.classList.remove("active");
        });
    }

    if (filterReset) {
        filterReset.addEventListener("click", () => {
            currentModalidade = "all";
            statusFilter = "ATIVA";
            filterUFs = [];
            filterModalities = [];
            filterCity = "";

            // Uncheck all filter checkboxes
            filterModalityList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            filterUFList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            // Reset trigger texts and close dropdowns
            updateTriggerText(filterModalityWrapper, 'Todas as Modalidades');
            updateTriggerText(filterUFWrapper, 'Todos os Estados');
            filterModalityWrapper.classList.remove('open');
            filterUFWrapper.classList.remove('open');

            // Sync tabs
            document.querySelectorAll(".crypto-tab").forEach(t => {
                t.classList.toggle("active", t.dataset.modalidade === "all");
            });

            currentPage = 1;
            renderTable();
            filterModal.classList.remove("active");
        });
    }

    filterModal.addEventListener("click", (e) => {
        if (e.target === filterModal) filterModal.classList.remove("active");
    });

    // ---- EXPORT CONTROLS ----
    const exportWrapper = document.getElementById("exportWrapper");
    const exportBtn = document.getElementById("exportBtn");
    const exportCSV = document.getElementById("exportCSV");
    const exportExcel = document.getElementById("exportExcel");
    const exportPDF = document.getElementById("exportPDF");

    if (exportBtn) {
        exportBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            exportWrapper.classList.toggle("active");
            exportBtn.classList.toggle("active");
        });
    }

    if (exportCSV) exportCSV.addEventListener("click", () => { exportToCSV(); exportWrapper.classList.remove("active"); exportBtn.classList.remove("active"); });
    if (exportExcel) exportExcel.addEventListener("click", () => { exportToExcel(); exportWrapper.classList.remove("active"); exportBtn.classList.remove("active"); });
    if (exportPDF) exportPDF.addEventListener("click", () => { exportToPDF(); exportWrapper.classList.remove("active"); exportBtn.classList.remove("active"); });

    // Pagination
    prevPageBtn.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });

    nextPageBtn.addEventListener("click", () => {
        const totalPages = Math.ceil(currentViewData.length / rowsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });

    // Rows per page
    const rowsSelect = document.getElementById("rowsSelect");
    rowsSelect.addEventListener("click", (e) => {
        e.stopPropagation();
        rowsSelect.classList.toggle("open");
    });

    rowsSelect.querySelectorAll(".select-option").forEach(opt => {
        opt.addEventListener("click", (e) => {
            e.stopPropagation();
            rowsPerPage = parseInt(opt.dataset.value);
            rowsValue.textContent = rowsPerPage;
            rowsSelect.querySelectorAll(".select-option").forEach(o => o.classList.remove("active"));
            opt.classList.add("active");
            rowsSelect.classList.remove("open");
            currentPage = 1;
            renderTable();
        });
    });


    // Close dropdowns on outside click
    document.addEventListener("click", () => {
        document.querySelectorAll(".rows-select.open, .export-wrapper.active").forEach(s => {
            s.classList.remove("open", "active");
        });
        if (exportBtn) exportBtn.classList.remove("active");
    });

    // Sidebar toggle (mobile)
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

    // Sidebar nav items
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
            item.classList.add("active");

            const page = item.dataset.page;
            document.querySelector(".breadcrumb").textContent = item.querySelector("span").textContent;

            if (page !== "p2p") {
                showToast(`Navigated to ${item.querySelector("span").textContent}`, "info");
            }

            if (window.innerWidth <= 1024) {
                sidebar.classList.remove("open");
            }
        });
    });

    // Modal
    document.getElementById("modalClose").addEventListener("click", closeBuyModal);
    //document.getElementById("modalCancel").addEventListener("click", closeBuyModal);

    buyModal.addEventListener("click", (e) => {
        if (e.target === buyModal) closeBuyModal();
    });

    document.getElementById("modalConfirm").addEventListener("click", () => {
        closeBuyModal();
    });

    // Modal Tabs
    document.querySelectorAll(".modal-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.tab;
            document.querySelectorAll(".modal-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".modal-tab-content").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            document.querySelector(`.modal-tab-content[data-tab="${target}"]`).classList.add("active");
        });
    });

    // Favorite Button
    document.getElementById("favoriteBtn").addEventListener("click", () => {
        if (!currentModalTrader) return;
        toggleFavorite(currentModalTrader.name);
        const favBtn = document.getElementById("favoriteBtn");
        favBtn.classList.toggle("active");
        favBtn.title = favBtn.classList.contains("active") ? "Remove from Watchlist" : "Add to Watchlist";
    });

    // Search
    searchInput.addEventListener("input", () => {
        currentPage = 1;
        renderTable();
    });

    // Notification button
    document.getElementById("notifBtn").addEventListener("click", () => {
        showToast("You have 3 unread notifications", "info");
    });


    // ---- COLUMNS DROPDOWN ----
    const columnsWrapper = document.getElementById('columnsWrapper');
    const columnsBtn = document.getElementById('columnsBtn');
    const columnsDropdown = document.getElementById('columnsDropdown');
    const columnsClearBtn = document.getElementById('columnsClearBtn');

    if (columnsBtn && columnsDropdown) {
        columnsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            columnsWrapper.classList.toggle('open');
        });

        // Checkbox change
        columnsDropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                selectedBenefColumns = Array.from(
                    columnsDropdown.querySelectorAll('input[type="checkbox"]:checked')
                ).map(el => el.value);
                currentPage = 1;
                renderTable();
            });
        });

        // Clear button
        columnsClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            columnsDropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });
            selectedBenefColumns = [];
            currentPage = 1;
            renderTable();
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!columnsWrapper.contains(e.target)) {
                columnsWrapper.classList.remove('open');
            }
        });
    }

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeBuyModal();
            document.querySelectorAll(".filter-select.open, .rows-select.open").forEach(s => s.classList.remove("open"));
            if (exportWrapper) exportWrapper.classList.remove("active");
            if (exportBtn) exportBtn.classList.remove("active");
            if (columnsWrapper) columnsWrapper.classList.remove('open');
            if (window.innerWidth <= 1024) sidebar.classList.remove("open");
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
            e.preventDefault();
            searchInput.focus();
        }
    });

    // Theme toggle
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);

    // Table Sorting
    document.querySelectorAll(".trade-table th.sortable").forEach(th => {
        th.addEventListener("click", () => {
            const newSortCol = th.getAttribute("data-sort");
            if (sortCol === newSortCol) {
                sortAsc = !sortAsc; // Toggle direction if same column
            } else {
                sortCol = newSortCol;
                sortAsc = true; // Default to ascending for new column
            }

            // Update UI
            document.querySelectorAll(".trade-table th.sortable").forEach(el => {
                el.classList.remove("current-sort", "asc", "desc");
            });
            th.classList.add("current-sort");
            th.classList.add(sortAsc ? "asc" : "desc");

            // Re-render
            currentPage = 1;
            renderTable();
        });
    });
}

// ---- EXPORT FUNCTIONS ----
function exportToCSV() {
    const data = currentViewData;
    if (data.length === 0) {
        showToast("Nenhum dado para exportar", "error");
        return;
    }

    const headers = ["Razao Social", "Nome Fantasia", "Registro ANS", "CNPJ", "Status", "Modalidade", "Cidade", "UF", "Website", "Telefone", "Beneficiarios Ativos"];

    // Formata os dados usando ponto e vírgula como separador (padrão Excel Brasil)
    const rows = data.map(op => [
        `"${op.Razao_Social || ''}"`,
        `"${op.Nome_Fantasia || ''}"`,
        `"${op.Registro_ANS || ''}"`,
        `"${op.CNPJ || ''}"`,
        `"${op.Status_Operadora || ''}"`,
        `"${op.Modalidade || ''}"`,
        `"${op.Cidade || ''}"`,
        `"${op.UF || ''}"`,
        `"${op.Endereco_eletronico || ''}"`,
        `"${(op.DDD || '') + (op.Telefone || '')}"`,
        `"${op.qt_beneficiario_ativo || 0}"`
    ]);

    const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    const fileName = `operadoras_${currentModalidade}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Dados exportados como CSV: ${fileName}`, "success");
}

function exportToPDF() {
    const data = currentViewData;
    if (data.length === 0) {
        showToast("Nenhum dado para exportar", "error");
        return;
    }

    // Calculate sum of active operators in this view
    const activeCount = data.filter(op => op.Status_Operadora === "ATIVA").length;

    const tableRows = data.map(op => `
        <tr>
            <td>${op.Nome_Fantasia || op.Razao_Social}</td>
            <td>${op.Registro_ANS}</td>
            <td>${op.CNPJ}</td>
            <td>${op.Status_Operadora}</td>
            <td>${op.Modalidade}</td>
            <td>${op.Cidade} / ${op.UF}</td>
            <td style="text-align:right">${(op.qt_beneficiario_ativo || 0).toLocaleString('pt-BR')}</td>
        </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html><head>
<title>Relatório de Operadoras - ${new Date().toLocaleDateString()}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1e1b4b; }
    .report-header { text-align: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #f74b4b; }
    .report-header h1 { font-size: 28px; color: #f74b4b; margin-bottom: 4px; }
    .report-header p { color: #6b7280; font-size: 14px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
    .kpi-box { padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
    .kpi-box .value { font-size: 24px; font-weight: 700; color: #1e1b4b; }
    .kpi-box .label { font-size: 12px; color: #6b7280; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f5f3ff; padding: 10px 12px; text-align: left; font-weight: 600; color: #6b7280; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb; }
    td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
    tr:hover { background: #faf8ff; }
    .footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; }
    @media print { body { padding: 20px; } }
</style>
</head><body>
    <div class="report-header">
        <h1>SaúdePortal — Relatório de Operadoras</h1>
        <p>Gerado em ${new Date().toLocaleDateString()} às ${new Date().toLocaleTimeString()}</p>
    </div>
    <div class="kpi-grid">
        <div class="kpi-box"><div class="value">${data.length}</div><div class="label">Total no Filtro</div></div>
        <div class="kpi-box"><div class="value">${activeCount}</div><div class="label">Operadoras Ativas</div></div>
        <div class="kpi-box"><div class="value">${currentModalidade}</div><div class="label">Modalidade</div></div>
    </div>
    <table>
        <thead><tr>
            <th>Operadora (Fantasia)</th><th>ANS</th><th>CNPJ</th><th>Status</th><th>Modalidade</th><th>Localidade</th><th style="text-align:right">Beneficiários</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
    </table>
    <div class="footer">Dashboard de Operadoras ANS — Relatório Confidencial</div>
    <script>window.onload = () => { window.print(); }</script>
</body></html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();

    showToast(`Relatório PDF gerado para impressão`, "success");
}

function exportToExcel() {
    if (typeof XLSX === "undefined") {
        showToast("Biblioteca Excel carregando... Tente novamente em instantes.", "warning");
        return;
    }

    const data = currentViewData;
    if (data.length === 0) {
        showToast("Nenhum dado para exportar", "error");
        return;
    }

    // Prepare headers and rows for Excel
    const headers = ["Razao Social", "Nome Fantasia", "Registro ANS", "CNPJ", "Status", "Modalidade", "Logradouro", "Numero", "Bairro", "Cidade", "UF", "CEP", "Website", "Telefone", "Beneficiarios Ativos"];
    const rows = data.map(op => [
        op.Razao_Social || '',
        op.Nome_Fantasia || '',
        op.Registro_ANS || '',
        op.CNPJ || '',
        op.Status_Operadora || '',
        op.Modalidade || '',
        op.Logradouro || '',
        op.Numero || '',
        op.Bairro || '',
        op.Cidade || '',
        op.UF || '',
        op.CEP || '',
        op.Endereco_eletronico || '',
        (op.DDD || '') + (op.Telefone || ''),
        op.qt_beneficiario_ativo || 0
    ]);

    const worksheetData = [headers, ...rows];

    // Create new workbook and append sheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // Auto-size columns slightly
    const colWidths = [
        { wch: 30 }, // Razao
        { wch: 20 }, // Fantasia
        { wch: 12 }, // ANS
        { wch: 18 }, // CNPJ
        { wch: 12 }, // Status
        { wch: 20 }, // Modalidade
        { wch: 30 }, // Logradouro
        { wch: 10 }, // Numero
        { wch: 15 }, // Bairro
        { wch: 15 }, // Cidade
        { wch: 5 },  // UF
        { wch: 12 }, // CEP
        { wch: 25 }, // Website
        { wch: 15 }  // Telefone
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, `Operadoras`);

    // Download file
    const fileName = `operadoras_${currentModalidade}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);

    showToast(`Dados exportados como Excel (.xlsx): ${fileName}`, "success");
}

function exportToCSV() {
    const data = currentViewData;
    if (data.length === 0) {
        showToast("Nenhum dado para exportar", "error");
        return;
    }

    const headers = ["Razao Social", "Nome Fantasia", "Registro ANS", "CNPJ", "Status", "Modalidade", "Cidade", "UF", "Website", "Beneficiarios Ativos"];
    const csvRows = [headers.join(",")];

    data.forEach(op => {
        const row = [
            `"${(op.Razao_Social || "").replace(/"/g, '""')}"`,
            `"${(op.Nome_Fantasia || "").replace(/"/g, '""')}"`,
            `"${op.Registro_ANS || ""}"`,
            `"${op.CNPJ || ""}"`,
            `"${op.Status_Operadora || ""}"`,
            `"${op.Modalidade || ""}"`,
            `"${op.Cidade || ""}"`,
            `"${op.UF || ""}"`,
            `"${op.Endereco_eletronico || ""}"`,
            `"${op.qt_beneficiario_ativo || 0}"`
        ];
        csvRows.push(row.join(","));
    });

    const csvContent = "\uFEFF" + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileName = `operadoras_${new Date().toISOString().slice(0, 10)}.csv`;

    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Dados exportados como CSV: ${fileName}`, "success");
}

// ---- TABLE ROW ANIMATION ----
const animStyle = document.createElement("style");
animStyle.textContent = `
    .table-row-animate {
        animation: rowFadeIn 0.3s ease both;
    }
    @keyframes rowFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(animStyle);

// ---- START APP ----
document.addEventListener("DOMContentLoaded", initApp);
