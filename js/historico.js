/**
 * js/historico.js
 * Logic for the Deep Financial History drill-down page.
 */

import { dataService } from './services/data_service.js';
import { loadComponent, formatNumber, formatPercent, escapeHTML } from './utils/ui.js';
import { initSidebar } from './sidebar.js';

async function initHistory() {
    const urlParams = new URLSearchParams(window.location.search);
    const regAns = urlParams.get('ans');

    if (!regAns) {
        window.location.href = 'index.html';
        return;
    }

    // Load Sidebar
    await loadComponent("components/sidebar.html", "sidebarContainer");
    initSidebar();

    // Initialize Theme
    const savedTheme = localStorage.getItem("finvest-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", savedTheme);

    document.getElementById("themeToggle").onclick = () => {
        const current = document.documentElement.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("finvest-theme", next);
        // Reload charts to update colors
        renderCharts(data.history);
    };

    try {
        await dataService.init();
        const data = dataService.getDeepHistory(regAns);

        if (!data) {
            alert("Operadora não encontrada.");
            window.location.href = 'index.html';
            return;
        }

        renderHeader(data.info);
        renderKPIs(data.history);
        renderCharts(data.history);
        renderTable(data.history);

    } catch (error) {
        console.error("Failed to load history:", error);
    }
}

function renderHeader(info) {
    const opLogo = document.getElementById("opLogo");
    const opName = document.getElementById("opName");
    const opMeta = document.getElementById("opMeta");

    const name = info.Nome_Fantasia && info.Nome_Fantasia.trim() !== "" ? info.Nome_Fantasia : info.Razao_Social;
    opName.textContent = name;
    opMeta.innerHTML = `
        <span>ANS: ${escapeHTML(info.Registro_ANS)}</span>
        <span>Modalidade: ${escapeHTML(info.Modalidade)}</span>
        <span>Localidade: ${escapeHTML(info.Cidade)} - ${escapeHTML(info.UF)}</span>
    `;

    // Try loading logo
    const logoImg = new Image();
    const logoPath = `assets/logos/${info.Registro_ANS}.png`;
    logoImg.onload = () => {
        opLogo.innerHTML = `<img src="${logoPath}" alt="${escapeHTML(name)}">`;
        opLogo.style.background = "white";
    };
    logoImg.src = logoPath;
    opLogo.textContent = name.charAt(0);
}

function renderKPIs(history) {
    const totalRevenue = history.reduce((sum, h) => sum + h.revenue, 0);
    const avgProfit = history.reduce((sum, h) => sum + h.profit, 0) / (history.length / 4); // Profit per year
    const avgMargin = history.reduce((sum, h) => sum + h.margin, 0) / history.length;
    const avgLoss = history.reduce((sum, h) => sum + h.lossRatio, 0) / history.length;

    document.getElementById("kpiTotalRevenue").textContent = `R$ ${(totalRevenue / 1000000).toFixed(1)}M`;
    document.getElementById("kpiAvgProfit").textContent = `R$ ${(avgProfit / 1000000).toFixed(1)}M`;
    document.getElementById("kpiAvgMargin").textContent = formatPercent(avgMargin);
    document.getElementById("kpiAvgLoss").textContent = formatPercent(avgLoss);
}

function renderCharts(history) {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const borderColor = isDark ? '#334155' : '#e2e8f0';

    // 1. Financial Evolution Chart (Revenue vs Expenses)
    const financialOptions = {
        series: [{
            name: 'Receita',
            data: history.map(h => h.revenue.toFixed(0))
        }, {
            name: 'Sinistros/Despesas',
            data: history.map(h => h.expenses.toFixed(0))
        }],
        chart: {
            type: 'area',
            height: 350,
            toolbar: { show: false },
            background: 'transparent',
            foreColor: textColor
        },
        colors: ['#7c3aed', '#f74b4b'],
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 2 },
        xaxis: {
            categories: history.map(h => h.period),
            labels: {
                rotate: -45,
                style: { fontSize: '10px' },
                hideOverlappingLabels: true
            }
        },
        yaxis: {
            labels: {
                formatter: val => `R$ ${(val / 1000000).toFixed(1)}M`
            }
        },
        grid: { borderColor: borderColor },
        tooltip: { theme: isDark ? 'dark' : 'light' }
    };

    // 2. Profitability Donut (Positive vs Negative Quarters)
    const positiveQtrs = history.filter(h => h.profit > 0).length;
    const negativeQtrs = history.length - positiveQtrs;

    const profitOptions = {
        series: [positiveQtrs, negativeQtrs],
        chart: {
            type: 'donut',
            height: 300,
            background: 'transparent',
            foreColor: textColor
        },
        labels: ['Trimestres Positivos', 'Trimestres Negativos'],
        colors: ['#10b981', '#ef4444'],
        legend: { position: 'bottom' },
        stroke: { show: false },
        tooltip: { theme: isDark ? 'dark' : 'light' }
    };

    // 3. Beneficiaries Evolution
    const benefOptions = {
        series: [{
            name: 'Beneficiários',
            data: history.map(h => h.beneficiaries)
        }],
        chart: {
            type: 'line',
            height: 300,
            toolbar: { show: false },
            background: 'transparent',
            foreColor: textColor
        },
        colors: ['#3b82f6'],
        stroke: { width: 3 },
        xaxis: {
            categories: history.map(h => h.period),
            labels: { show: false }
        },
        grid: { borderColor: borderColor },
        tooltip: { theme: isDark ? 'dark' : 'light' }
    };

    // Initialize/Update Charts
    document.getElementById("chartFinancials").innerHTML = '';
    document.getElementById("chartProfitability").innerHTML = '';
    document.getElementById("chartBeneficiaries").innerHTML = '';

    new ApexCharts(document.getElementById("chartFinancials"), financialOptions).render();
    new ApexCharts(document.getElementById("chartProfitability"), profitOptions).render();
    new ApexCharts(document.getElementById("chartBeneficiaries"), benefOptions).render();
}

function renderTable(history) {
    const tableBody = document.getElementById("historyTableBody");
    tableBody.innerHTML = history.slice().reverse().map(h => `
        <tr>
            <td style="font-weight:600">${h.period}</td>
            <td>${formatNumber(h.beneficiaries)}</td>
            <td>R$ ${(h.revenue / 1000000).toFixed(2)}M</td>
            <td>R$ ${(h.expenses / 1000000).toFixed(2)}M</td>
            <td class="${h.profit > 0 ? 'positive' : 'negative'}">R$ ${(h.profit / 1000000).toFixed(2)}M</td>
            <td>${formatPercent(h.lossRatio)}</td>
            <td class="${h.margin > 0 ? 'positive' : 'negative'}">${formatPercent(h.margin)}</td>
        </tr>
    `).join('');
}

// Start
document.addEventListener("DOMContentLoaded", initHistory);
