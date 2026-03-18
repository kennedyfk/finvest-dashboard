// ===========================
// Finvest P2P Trading Dashboard
// Application Logic
// ===========================

// ---- STATE ----
let tradersData = {};
let currentCrypto = "BTC";
let currentPage = 1;
let rowsPerPage = 8;
let sortCol = "price";
let sortAsc = true;
let currentViewData = [];

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

// ---- DATA LOADER ----
async function loadData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        tradersData = await response.json();
    } catch (err) {
        console.error(`Data load failed for ${url}:`, err.message);
        tradersData = {};
    }
}

// ---- INIT ----
async function initApp() {
    // Apply saved theme immediately
    initTheme();

    // Load sidebar component and data in parallel
    await Promise.all([
        loadComponent("components/sidebar.html", "sidebarContainer"),
        loadData("data/traders.json")
    ]);

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
    const data = tradersData[currentCrypto] || [];
    
    // Active Traders
    document.getElementById("kpiTraders").textContent = data.length;
    
    // Avg Price
    if (data.length > 0) {
        const avgPrice = data.reduce((sum, t) => sum + t.price, 0) / data.length;
        document.getElementById("kpiAvgPrice").textContent = `$${formatPrice(Math.round(avgPrice))}`;
    } else {
        document.getElementById("kpiAvgPrice").textContent = "$0";
    }
    
    // Avg Rate
    if (data.length > 0) {
        const avgRate = data.reduce((sum, t) => sum + t.rate, 0) / data.length;
        document.getElementById("kpiAvgRate").textContent = `${avgRate.toFixed(1)}%`;
    } else {
        document.getElementById("kpiAvgRate").textContent = "0%";
    }
    
    // Total Orders
    const totalOrders = data.reduce((sum, t) => sum + t.orders, 0);
    document.getElementById("kpiTotalOrders").textContent = totalOrders.toLocaleString();
}

// ---- RENDER TABLE ----
function renderTable() {
    let rawData = tradersData[currentCrypto] || [];
    let filteredData = [...rawData];

    // Filter by text search
    const query = (searchInput && searchInput.value) ? searchInput.value.toLowerCase().trim() : "";
    if (query) {
        filteredData = rawData.filter(t =>
            t.name.toLowerCase().includes(query) ||
            t.payment.toLowerCase().includes(query) ||
            t.banks.toLowerCase().includes(query)
        );
    }

    // Sort data
    filteredData.sort((a, b) => {
        let valA = a[sortCol];
        let valB = b[sortCol];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        // Specific cases for 'available' which is a string like "0.012 BTC"
        if (sortCol === 'available') {
            valA = parseFloat(valA.split(' ')[0].replace(/,/g, ''));
            valB = parseFloat(valB.split(' ')[0].replace(/,/g, ''));
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
    });

    currentViewData = filteredData;

    // Update KPIs
    updateKPIs();
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    const startIdx = (currentPage - 1) * rowsPerPage;
    const endIdx = Math.min(startIdx + rowsPerPage, filteredData.length);
    const pageData = filteredData.slice(startIdx, endIdx);

    tableBody.innerHTML = "";

    if (pageData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:48px 16px; color:var(--text-muted);">
                    <div style="font-size:2rem; margin-bottom:8px;">📭</div>
                    <div>No advertisers found for ${currentCrypto}</div>
                </td>
            </tr>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();

    pageData.forEach((trader, index) => {
        const rateClass = trader.rate >= 95 ? "high" : trader.rate >= 85 ? "medium" : "low";
        const row = document.createElement("tr");
        row.style.animationDelay = `${index * 0.04}s`;
        row.classList.add("table-row-animate");

        row.innerHTML = `
            <td>
                <div class="advertiser-cell">
                    <div class="advertiser-avatar color-${trader.color}">
                        ${trader.initial}
                    </div>
                    <div class="advertiser-info">
                        <span class="advertiser-name clickable-name" data-index="${startIdx + index}">
                            ${trader.name}
                            ${trader.verified ? verifiedSVG : ''}
                        </span>
                        <span class="advertiser-stats">
                            <span class="online-dot"></span>
                            ${trader.orders.toLocaleString()} orders | ${trader.completion.toFixed(2)}% completion
                        </span>
                    </div>
                </div>
            </td>
            <td>
                <span class="price-cell">${formatPrice(trader.price)} ${trader.currency}</span>
            </td>
            <td>
                <div class="review-cell">
                    <div class="review-rate">
                        <div class="rate-bar">
                            <div class="rate-bar-fill ${rateClass}" style="width:${trader.rate}%"></div>
                        </div>
                        ${trader.rate.toFixed(2)}%
                    </div>
                    <div class="review-time">
                        ${clockSVG}
                        ${trader.time} min
                    </div>
                </div>
            </td>
            <td>
                <span class="payment-cell">${trader.payment}</span>
            </td>
            <td>
                <div class="limit-cell">
                    <span class="limit-amount">${trader.available}</span>
                    <span class="limit-range">${formatPrice(trader.limitMin)} ${trader.limitCurrency} - ${formatPrice(trader.limitMax)} ${trader.limitCurrency}</span>
                </div>
            </td>
        `;

        fragment.appendChild(row);
    });

    tableBody.appendChild(fragment);

    // Update pagination
    paginationInfo.textContent = `${startIdx + 1}-${endIdx} of ${totalPages}`;
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
    const trader = currentViewData[index];
    if (!trader) return;
    currentModalTrader = trader;

    // Reset to Details tab
    document.querySelectorAll(".modal-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".modal-tab-content").forEach(t => t.classList.remove("active"));
    document.querySelector('.modal-tab[data-tab="details"]').classList.add("active");
    document.getElementById("tabDetails").classList.add("active");

    // Basic info
    document.getElementById("modalCryptoName").textContent = currentCrypto;
    document.getElementById("modalAvatar").textContent = trader.initial;
    document.getElementById("modalAvatar").className = `seller-avatar`;
    document.getElementById("modalAvatar").style.background = getGradient(trader.color);
    document.getElementById("modalSellerName").textContent = trader.name;
    document.getElementById("modalSellerStats").textContent = `${trader.orders.toLocaleString()} orders | ${trader.completion.toFixed(2)}% completion`;
    document.getElementById("modalPrice").textContent = `${formatPrice(trader.price)} ${trader.currency}`;
    document.getElementById("modalAvailable").textContent = trader.available;
    document.getElementById("modalLimit").textContent = `${formatPrice(trader.limitMin)} ${trader.limitCurrency} - ${formatPrice(trader.limitMax)} ${trader.limitCurrency}`;
    document.getElementById("modalPayment").textContent = trader.payment;
    document.getElementById("receiveCurrency").textContent = currentCrypto;
    document.getElementById("payAmount").value = "";
    document.getElementById("receiveAmount").value = "";

    // Live calculation
    const payInput = document.getElementById("payAmount");
    payInput.oninput = () => {
        const amount = parseFloat(payInput.value) || 0;
        const receive = amount / trader.price;
        document.getElementById("receiveAmount").value = receive > 0 ? receive.toFixed(8) : "";
    };

    // Bank badges
    document.getElementById("modalBanks").innerHTML = generateBankBadges(trader.banks);

    // Sparkline
    const allPrices = (tradersData[currentCrypto] || []).map(t => t.price);
    document.getElementById("sparklineCrypto").textContent = currentCrypto;
    document.getElementById("sparklineContainer").innerHTML = generateSparklineSVG(allPrices, trader.price);
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    document.getElementById("sparklineMin").textContent = `$${formatPrice(minP)}`;
    document.getElementById("sparklineMax").textContent = `$${formatPrice(maxP)}`;

    // Trade history
    document.getElementById("tradeHistoryList").innerHTML = generateTradeHistory(trader);

    // Rating breakdown
    document.getElementById("ratingBreakdown").innerHTML = generateRatingBreakdown(trader);

    // Favorite state
    const favBtn = document.getElementById("favoriteBtn");
    if (isFavorite(trader.name)) {
        favBtn.classList.add("active");
        favBtn.title = "Remove from Watchlist";
    } else {
        favBtn.classList.remove("active");
        favBtn.title = "Add to Watchlist";
    }

    document.getElementById("modalConfirm").textContent = `Buy ${currentCrypto}`;
    buyModal.classList.add("active");
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
    // Crypto tabs
    cryptoTabs.addEventListener("click", (e) => {
        const tab = e.target.closest(".crypto-tab");
        if (!tab) return;

        document.querySelectorAll(".crypto-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        currentCrypto = tab.dataset.crypto;
        currentPage = 1;
        renderTable();
    });

    // Pagination
    prevPageBtn.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });

    nextPageBtn.addEventListener("click", () => {
        const data = tradersData[currentCrypto] || [];
        const totalPages = Math.ceil(data.length / rowsPerPage);
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

    // Filter selects
    document.querySelectorAll(".filter-select").forEach(select => {
        const trigger = select.querySelector(".select-trigger");
        trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".filter-select.open, .rows-select.open").forEach(s => {
                if (s !== select) s.classList.remove("open");
            });
            select.classList.toggle("open");
        });

        select.querySelectorAll(".select-option").forEach(opt => {
            opt.addEventListener("click", (e) => {
                e.stopPropagation();
                const span = trigger.querySelector("span");
                span.textContent = opt.textContent;
                select.querySelectorAll(".select-option").forEach(o => o.classList.remove("active"));
                opt.classList.add("active");
                select.classList.remove("open");
                showToast(`Filter set to: ${opt.textContent}`, "success");
            });
        });
    });

    // Close dropdowns on outside click
    document.addEventListener("click", () => {
        document.querySelectorAll(".filter-select.open, .rows-select.open").forEach(s => {
            s.classList.remove("open");
        });
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
    document.getElementById("modalCancel").addEventListener("click", closeBuyModal);

    buyModal.addEventListener("click", (e) => {
        if (e.target === buyModal) closeBuyModal();
    });

    document.getElementById("modalConfirm").addEventListener("click", () => {
        const amount = document.getElementById("payAmount").value;
        if (!amount || parseFloat(amount) <= 0) {
            showToast("Please enter a valid amount", "error");
            return;
        }
        const receive = document.getElementById("receiveAmount").value;
        showToast(`Order placed! Buying ${receive} ${currentCrypto}`, "success");
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

    // Filter button
    document.getElementById("filterBtn").addEventListener("click", () => {
        showToast("Filters applied successfully", "success");
    });

    // Export dropdown
    const exportWrapper = document.getElementById("exportWrapper");
    const exportBtn = document.getElementById("exportBtn");
    
    exportBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        exportWrapper.classList.toggle("open");
        // Close other dropdowns
        document.querySelectorAll(".filter-select.open, .rows-select.open").forEach(s => s.classList.remove("open"));
    });

    document.getElementById("exportCSV").addEventListener("click", (e) => {
        e.stopPropagation();
        exportToCSV();
        exportWrapper.classList.remove("open");
    });

    document.getElementById("exportExcel").addEventListener("click", (e) => {
        e.stopPropagation();
        exportToExcel();
        exportWrapper.classList.remove("open");
    });

    document.getElementById("exportPDF").addEventListener("click", (e) => {
        e.stopPropagation();
        exportToPDF();
        exportWrapper.classList.remove("open");
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeBuyModal();
            document.querySelectorAll(".filter-select.open, .rows-select.open").forEach(s => s.classList.remove("open"));
            exportWrapper.classList.remove("open");
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
    const data = tradersData[currentCrypto] || [];
    if (data.length === 0) {
        showToast("No data to export", "error");
        return;
    }

    const headers = ["Name", "Verified", "Orders", "Completion %", "Price", "Currency", "Rate %", "Time (min)", "Payment", "Banks", "Available", "Min Limit", "Max Limit", "Limit Currency"];
    
    // Formata os dados usando ponto e vírgula como separador (padrão Excel Brasil)
    const rows = data.map(t => [
        `"${t.name}"`,
        t.verified ? "Yes" : "No",
        t.orders,
        t.completion.toString().replace('.', ','),
        t.price.toString().replace('.', ','),
        t.currency,
        t.rate.toString().replace('.', ','),
        t.time,
        `"${t.payment}"`,
        `"${t.banks}"`,
        `"${t.available}"`,
        t.limitMin,
        t.limitMax,
        t.limitCurrency
    ]);

    const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentCrypto}_traders_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`${currentCrypto} data exported as CSV`, "success");
}

function exportToPDF() {
    const data = tradersData[currentCrypto] || [];
    if (data.length === 0) {
        showToast("No data to export", "error");
        return;
    }

    // Calculate KPIs
    const avgPrice = data.reduce((s, t) => s + t.price, 0) / data.length;
    const avgRate = data.reduce((s, t) => s + t.rate, 0) / data.length;
    const totalOrders = data.reduce((s, t) => s + t.orders, 0);

    const tableRows = data.map(t => `
        <tr>
            <td>${t.name} ${t.verified ? "✓" : ""}</td>
            <td>${formatPrice(t.price)} ${t.currency}</td>
            <td>${t.rate.toFixed(2)}%</td>
            <td>${t.orders.toLocaleString()}</td>
            <td>${t.completion.toFixed(2)}%</td>
            <td>${t.payment}</td>
            <td>${t.available}</td>
            <td>${formatPrice(t.limitMin)} - ${formatPrice(t.limitMax)} ${t.limitCurrency}</td>
        </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html><head>
<title>${currentCrypto} Report - ${new Date().toLocaleDateString()}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1e1b4b; }
    .report-header { text-align: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #f74b4b; }
    .report-header h1 { font-size: 28px; color: #f74b4b; margin-bottom: 4px; }
    .report-header p { color: #6b7280; font-size: 14px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .kpi-box { padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
    .kpi-box .value { font-size: 24px; font-weight: 700; color: #1e1b4b; }
    .kpi-box .label { font-size: 12px; color: #6b7280; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f5f3ff; padding: 10px 12px; text-align: left; font-weight: 600; color: #6b7280; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; border-bottom: 2px solid #e5e7eb; }
    td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
    tr:hover { background: #faf8ff; }
    .footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
    @media print { body { padding: 20px; } }
</style>
</head><body>
    <div class="report-header">
        <h1>Finvest — ${currentCrypto} Report</h1>
        <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
    </div>
    <div class="kpi-grid">
        <div class="kpi-box"><div class="value">${data.length}</div><div class="label">Active Traders</div></div>
        <div class="kpi-box"><div class="value">$${formatPrice(Math.round(avgPrice))}</div><div class="label">Avg. Price</div></div>
        <div class="kpi-box"><div class="value">${avgRate.toFixed(1)}%</div><div class="label">Avg. Rate</div></div>
        <div class="kpi-box"><div class="value">${totalOrders.toLocaleString()}</div><div class="label">Total Orders</div></div>
    </div>
    <table>
        <thead><tr>
            <th>Trader</th><th>Price</th><th>Rate</th><th>Orders</th><th>Completion</th><th>Payment</th><th>Available</th><th>Limits</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
    </table>
    <div class="footer">Finvest P2P Trading Dashboard — Confidential Report</div>
    <script>window.onload = () => { window.print(); }</script>
</body></html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();

    showToast(`${currentCrypto} report generated for printing`, "success");
}

function exportToExcel() {
    if (typeof XLSX === "undefined") {
        showToast("Excel export library is loading... Please try again in a moment.", "warning");
        return;
    }

    const data = tradersData[currentCrypto] || [];
    if (data.length === 0) {
        showToast("No data to export", "error");
        return;
    }

    // Prepare headers and rows for Excel
    const headers = ["Name", "Verified", "Orders", "Completion %", "Price", "Currency", "Rate %", "Time (min)", "Payment", "Banks", "Available", "Min Limit", "Max Limit", "Limit Currency"];
    const rows = data.map(t => [
        t.name,
        t.verified ? "Yes" : "No",
        t.orders,
        t.completion, // Keep as numbers for Excel
        t.price,
        t.currency,
        t.rate,
        t.time,
        t.payment,
        t.banks,
        t.available,
        t.limitMin,
        t.limitMax,
        t.limitCurrency
    ]);

    const worksheetData = [headers, ...rows];
    
    // Create new workbook and append sheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Auto-size columns slightly
    const colWidths = [
        { wch: 20 }, // Name
        { wch: 10 }, // Verified
        { wch: 10 }, // Orders
        { wch: 15 }, // Completion
        { wch: 15 }, // Price
        { wch: 10 }, // Currency
        { wch: 10 }, // Rate
        { wch: 10 }, // Time
        { wch: 20 }, // Payment
        { wch: 25 }, // Banks
        { wch: 15 }, // Available
        { wch: 15 }, // Min
        { wch: 15 }, // Max
        { wch: 15 }  // Limit Currency
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, `${currentCrypto} Traders`);

    // Download file
    const fileName = `${currentCrypto}_traders_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);

    showToast(`${currentCrypto} data exported as Excel (.xlsx)`, "success");
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
