import { store } from './services/store.js';
import { initSidebar } from './sidebar.js';
import { openOperatorModal } from './components/operator_modal.js';
import { loadComponent, showToast, formatNumber, formatPercent } from './utils/ui.js';

// ---- STATE ----
let operatorsData = {};
let beneficiaryData = {};
let globalBenefRefDate = '';
let currentModalidade = "all";
let statusFilter = "ATIVA";
let filterUFs = [];
let filterModalities = [];
let filterCity = "";
let currentPage = 1;
let rowsPerPage = 10;
let sortCol = "qt_beneficiario_ativo";
let sortAsc = false;
let currentViewData = [];
let selectedBenefColumns = ['qt_beneficiario_ativo'];
let showFavoritesOnly = false;

function updateFavBtnState() {
    const btn = document.getElementById('favFilterBtn');
    if (!btn) return;
    btn.classList.toggle('active', showFavoritesOnly);
    const count = store.favorites.size;
    btn.querySelector('.fav-count').textContent = count > 0 ? `(${count})` : '';
}

// ---- HELPERS ----
function formatCNPJ(cnpj) {
    if (!cnpj) return "";
    const clean = cnpj.toString().replace(/\D/g, "");
    if (clean.length !== 14) return cnpj;
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

// UI Helpers now imported from utils/ui.js
function findGlobalMaxDate() {
    let maxDate = '';
    Object.values(beneficiaryData).forEach(opDates => {
        Object.keys(opDates).forEach(date => {
            if (date > maxDate) maxDate = date;
        });
    });
    return maxDate;
}

function closeBuyModal() {
    if (buyModal) buyModal.classList.remove("active");
}

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

// loadComponent now imported from utils/ui.js

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

    // Load components first
    await Promise.all([
        loadComponent("components/sidebar.html", "sidebarContainer"),
        loadComponent("components/operator_modal.html", "operatorModalContainer")
    ]);

    // Initialize Sidebar logic
    initSidebar();

    // Load data in parallel
    await Promise.all([
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

    // 3b. Favorites filter
    if (showFavoritesOnly) {
        filteredData = filteredData.filter(op => store.favorites.has(op.Registro_ANS.toString()));
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
        let valA = a[sortCol] !== undefined && a[sortCol] !== null ? a[sortCol] : "";
        let valB = b[sortCol] !== undefined && b[sortCol] !== null ? b[sortCol] : "";

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

    const totalColCount = 3 + selectedBenefColumns.length; // Operadora, Modalidade, Local (3) + Benef Columns
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

        const isFav = store.favorites.has(op.Registro_ANS.toString());

        let statusClass = op.Status_Operadora === "ATIVA" ? "ativa" : "cancelada";
        row.innerHTML = `
            <td>
                <div class="advertiser-cell">
                    <button class="fav-star-btn ${isFav ? 'active' : ''}" data-reg="${op.Registro_ANS}" title="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                    </button>
                    <div class="advertiser-logo">
                        <img src="${logoPath}" alt="${op.Nome_Fantasia || op.Razao_Social}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(op.Nome_Fantasia || op.Razao_Social)}&background=f74b4b&color=fff'">
                    </div>
                    <div class="advertiser-info">
                        <span class="advertiser-name clickable-name" data-index="${startIdx + index}">
                            ${op.Nome_Fantasia || op.Razao_Social}
                            <span class="cc-badge ${statusClass}">${op.Status_Operadora}</span>
                        </span>
                        <span class="advertiser-stats">
                            ANS: ${op.Registro_ANS}
                        </span>
                        ${!isAtiva && op.Motivo_do_Descredenciamento ? `<span class="advertiser-stats" style="color:var(--danger);font-size:0.68rem;">${op.Motivo_do_Descredenciamento}</span>` : ''}
                    </div>
                </div>
            </td>
            <td>
                <div class="modalidade-cell">
                    <span class="modalidade-badge">${op.Modalidade || "N/A"}</span>
                </div>
            </td>
            <td>
                <div class="location-cell">
                    <div class="location-city">${op.Cidade || "N/A"}</div>
                    <div class="location-uf">${op.UF || ""}</div>
                </div>
            </td>
            ${selectedBenefColumns.map(col => `
            <td>
                <div class="beneficiary-cell">
                    <span class="beneficiary-count">${formatNumber(op[col])}</span>
                    <span class="beneficiary-date">Período: ${op.benef_ref_date ? op.benef_ref_date.split('-').reverse().join('/') : 'N/A'}</span>
                </div>
            </td>`).join('')}
        `;

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

    // Bind favorite star buttons
    document.querySelectorAll(".fav-star-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            store.toggleFavorite(btn.dataset.reg);
            renderTable();
            updateFavBtnState();
        });
    });
}

// ---- BUY MODAL (ENRICHED) ----
function openBuyModal(index) {
    const op = currentViewData[index];
    if (!op) return;
    openOperatorModal(op, beneficiaryData);
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

    // Favorites toggle and clear
    const favFilterBtn = document.getElementById('favFilterBtn');
    const favClearBtn = document.getElementById('favClearBtn');

    if (favFilterBtn) {
        updateFavBtnState();
        favFilterBtn.addEventListener('click', () => {
            showFavoritesOnly = !showFavoritesOnly;
            currentPage = 1;
            renderTable();
            updateFavBtnState();
        });
    }

    if (favClearBtn) {
        favClearBtn.addEventListener('click', () => {
            if (store.favorites.size === 0) return;
            if (confirm("Tem certeza que deseja limpar todos os favoritos?")) {
                store.clearFavorites();
                showFavoritesOnly = false;
                currentPage = 1;
                renderTable();
                updateFavBtnState();
            }
        });
    }

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
            const href = item.getAttribute("href");
            if (href && href !== "#" && !href.startsWith("./#")) {
                // Let the browser navigate naturally
                return;
            }

            e.preventDefault();
            document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
            item.classList.add("active");

            const page = item.dataset.page;
            document.querySelector(".breadcrumb").textContent = item.querySelector("span").textContent;

            if (page !== "Operadoras de Saúde") {
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
        const isFav = store.toggleFavorite(currentModalTrader.Registro_ANS);
        const favBtn = document.getElementById("favoriteBtn");
        favBtn.classList.toggle("active", isFav);
        favBtn.title = isFav ? "Remover dos favoritos" : "Adicionar aos favoritos";
        
        if (isFav) {
            showToast(`${currentModalTrader.Nome_Fantasia || currentModalTrader.Razao_Social} adicionado aos favoritos ★`, "success");
        } else {
            showToast(`${currentModalTrader.Nome_Fantasia || currentModalTrader.Razao_Social} removido dos favoritos`, "info");
        }
        
        // Refresh table to reflect favorite change in background
        renderTable();
        updateFavBtnState();
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
