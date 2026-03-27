import { store } from '../services/store.js';

let currentModalTrader = null;
let currentModalBenefData = null;

function padCNPJ(cnpj) {
    if (!cnpj) return "";
    const clean = cnpj.toString().replace(/\D/g, "");
    if (clean.length !== 14) return cnpj;
    return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
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

function renderDemoChart(dataKey, opData, dates, chartContainer) {
    if (!chartContainer) return;
    const chartData = dates.map(d => ({
        date: d,
        label: `${d.substring(5, 7)}/${d.substring(2, 4)}`,
        value: Number(opData[d][dataKey] || 0)
    }));

    if (chartData.length < 2) {
        chartContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">Dados indisponíveis (mín 2 meses).</div>`;
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

    const points = chartData.map((d, i) => {
        const x = padL + (i / (chartData.length - 1)) * plotW;
        const y = padT + plotH - ((d.value - minVal) / range) * plotH;
        return { x, y, ...d };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${padT + plotH} L${points[0].x.toFixed(1)},${padT + plotH} Z`;

    let yLabels = '';
    let gridLines = '';
    for (let i = 0; i <= 4; i++) {
        const val = minVal + (range * i / 4);
        const y = padT + plotH - (i / 4) * plotH;
        const formattedVal = val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0);
        yLabels += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${formattedVal}</text>`;
        gridLines += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-dasharray="3,3" opacity="0.5"/>`;
    }

    let xLabels = '';
    for (let i = 0; i < chartData.length; i += Math.ceil(chartData.length / 8)) {
        xLabels += `<text x="${points[i].x}" y="${H - 6}" text-anchor="middle" fill="var(--text-muted)" font-size="10">${points[i].label}</text>`;
    }

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

function populateDemografia(regAns) {
    const metricsGrid = document.getElementById("demoMetrics");
    const chartContainer = document.getElementById("demoChartContainer");
    const chartTitle = document.querySelector(".demo-chart-title");
    const opData = currentModalBenefData ? currentModalBenefData[regAns] : null;

    if (!opData || Object.keys(opData).length === 0) {
        if (metricsGrid) metricsGrid.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted); grid-column: 1/-1;">Dados demográficos indisponíveis para esta operadora.</div>`;
        if (chartContainer) chartContainer.innerHTML = '';
        return;
    }

    const dates = Object.keys(opData).sort();
    const latestDate = dates[dates.length - 1];
    const latest = opData[latestDate];

    const refMM = latestDate.substring(5, 7);
    const refYYYY = latestDate.substring(0, 4);

    const metrics = [
        { key: 'qt_beneficiario_ativo', label: 'Benef. Ativos', value: Number(latest.qt_beneficiario_ativo || 0).toLocaleString('pt-BR'), icon: '👥', desc: 'Quantidade de beneficiários ativos.' },
        { key: 'qt_beneficiario_aderido', label: 'Aderidos', value: Number(latest.qt_beneficiario_aderido || 0).toLocaleString('pt-BR'), icon: '📈', desc: 'Adesões no período.' },
        { key: 'qt_beneficiario_cancelado', label: 'Cancelados', value: Number(latest.qt_beneficiario_cancelado || 0).toLocaleString('pt-BR'), icon: '📉', desc: 'Cancelamentos no período.' },
        { key: 'qt_beneficiario_saldo', label: 'Saldo', value: Number(latest.qt_beneficiario_saldo || 0).toLocaleString('pt-BR'), icon: '📊', desc: 'Diferença entre aderidos e cancelados.' },
        { key: 'ativos_ate_4_anos_perc', label: '% Ativos até 4 anos', value: `${parseFloat(latest.ativos_ate_4_anos_perc || 0).toFixed(2)}%`, icon: '👶', desc: 'Percentual de beneficiários ativos com idade de 0 a 4 anos.' },
        { key: 'ativos_ate_14_anos_perc', label: '% Ativos até 14 anos', value: `${parseFloat(latest.ativos_ate_14_anos_perc || 0).toFixed(2)}%`, icon: '🧒', desc: 'Percentual de beneficiários ativos com idade de 0 a 14 anos.' },
        { key: 'ativos_idosos_perc', label: '% Idosos', value: `${parseFloat(latest.ativos_idosos_perc || 0).toFixed(2)}%`, icon: '👴', desc: 'Beneficiários com 60+ anos.' },
        { key: 'razao_dependencia_de_idosos', label: 'Dep. Idosos', value: `${parseFloat(latest.razao_dependencia_de_idosos || 0).toFixed(2)}%`, icon: '🏥', desc: 'Razão de dependência de idosos.' },
        { key: 'razao_dependencia_de_jovens', label: 'Dep. Jovens', value: `${parseFloat(latest.razao_dependencia_de_jovens || 0).toFixed(2)}%`, icon: '🧑', desc: 'Razão de dependência de jovens.' },
        { key: 'indice_de_envelhecimento', label: 'Índ. Envelhecimento', value: `${parseFloat(latest.indice_de_envelhecimento || 0).toFixed(2)}%`, icon: '📅', desc: 'Índice de envelhecimento da carteira.' },
        { key: 'indice_de_longevidade', label: 'Índ. Longevidade', value: `${parseFloat(latest.indice_de_longevidade || 0).toFixed(2)}%`, icon: '⏳', desc: 'Índice de longevidade.' },
        { key: 'razao_sexo_terceira_idade', label: 'Sexo 3ª Idade', value: `${parseFloat(latest.razao_sexo_terceira_idade || 0).toFixed(2)}%`, icon: '⚤', desc: 'Razão entre sexos na 3ª idade.' },
        { key: 'razao_renovacao_geracional', label: 'Renov. Geracional', value: `${parseFloat(latest.razao_renovacao_geracional || 0).toFixed(2)}%`, icon: '🔄', desc: 'Capacidade de renovação da carteira.' },
        { key: 'idosos_plano_individual', label: '% Idosos P. Indiv.', value: `${parseFloat(latest.idosos_plano_individual || 0).toFixed(2)}%`, icon: '🏠', desc: 'Idosos em planos individuais.' }
    ];

    if (metricsGrid) {
        metricsGrid.innerHTML = `
            <div class="demo-ref-date">Ref: ${refMM}/${refYYYY}</div>
            ${metrics.map((m, i) => `
                <div class="demo-metric-card${i === 0 ? ' active' : ''}" data-key="${m.key}" data-label="${m.label}" title="${m.desc}">
                    <span class="demo-metric-icon">${m.icon}</span>
                    <div class="demo-metric-info">
                        <span class="demo-metric-value">${m.value}</span>
                        <span class="demo-metric-label">${m.label}</span>
                    </div>
                </div>
            `).join('')}
        `;

        const chartDesc = document.getElementById('demoChartDesc');
        metricsGrid.querySelectorAll('.demo-metric-card').forEach(card => {
            card.addEventListener('click', () => {
                metricsGrid.querySelectorAll('.demo-metric-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                if (chartTitle) chartTitle.textContent = `Evolução de ${card.dataset.label}`;
                if (chartDesc) chartDesc.textContent = card.getAttribute('title') || '';
                renderDemoChart(card.dataset.key, opData, dates, chartContainer);
            });
        });

        const firstCard = metricsGrid.querySelector('.demo-metric-card');
        if (firstCard && chartDesc) {
            chartDesc.textContent = firstCard.getAttribute('title') || '';
        }
    }

    if (chartTitle) chartTitle.textContent = 'Evolução de Benef. Ativos';
    renderDemoChart('qt_beneficiario_ativo', opData, dates, chartContainer);
}

export function openOperatorModal(op, benefDataDict) {
    const buyModal = document.getElementById("buyModal");
    if (!buyModal) return;

    currentModalTrader = op;
    currentModalBenefData = benefDataDict;

    document.querySelectorAll(".modal-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".modal-tab-content").forEach(t => t.classList.remove("active"));
    const firstTabBtn = document.querySelector('.modal-tab[data-tab="details"]');
    const firstTabCont = document.getElementById("details");
    if (firstTabBtn) firstTabBtn.classList.add("active");
    if (firstTabCont) firstTabCont.classList.add("active");

    const favBtn = document.getElementById("favoriteBtn");
    if (favBtn) {
        favBtn.classList.toggle("active", store.favorites.has(op.Registro_ANS.toString()));
        favBtn.title = store.favorites.has(op.Registro_ANS.toString()) ? "Remover dos favoritos" : "Adicionar aos favoritos";

        const newFavBtn = favBtn.cloneNode(true);
        favBtn.parentNode.replaceChild(newFavBtn, favBtn);
        newFavBtn.addEventListener("click", () => {
            const isFav = store.toggleFavorite(op.Registro_ANS);
            newFavBtn.classList.toggle("active", isFav);
            newFavBtn.title = isFav ? "Remover dos favoritos" : "Adicionar aos favoritos";
        });
    }

    const opName = op.Nome_Fantasia && op.Nome_Fantasia.trim() !== "" ? op.Nome_Fantasia : op.Razao_Social;
    const regFormatted = op.Registro_ANS.toString().padStart(6, '0');
    const initial = op.Nome_Fantasia ? op.Nome_Fantasia.charAt(0) : op.Razao_Social.charAt(0);
    const logoPath = `assets/logos/${op.Registro_ANS}.png`;
    const img = new Image();
    const modalAvatar = document.getElementById("modalAvatar");
    modalAvatar.className = `seller-avatar`;
    modalAvatar.style.background = getGradient("purple");
    modalAvatar.innerHTML = initial;

    img.onload = () => {
        if (currentModalTrader && currentModalTrader.Registro_ANS !== op.Registro_ANS) return;
        modalAvatar.classList.add("logo-loaded");
        modalAvatar.innerHTML = `<img src="${logoPath}" alt="${op.Nome_Fantasia}" style="width:auto; height:66%; border-radius:inherit; object-fit:contain;">`;
        modalAvatar.style.background = "rgba(255, 255, 255, 1.00)";
    };
    img.src = logoPath;

    document.getElementById("modalSellerName").textContent = opName;
    document.getElementById("modalSellerStats").textContent = `ANS: ${regFormatted} | ${op.Status_Operadora}`;
    document.getElementById("modalPrice").textContent = padCNPJ(op.CNPJ);
    document.getElementById("modalAvailable").textContent = op.Modalidade;
    document.getElementById("modalLimit").textContent = `${op.Cidade} - ${op.UF}`;

    const website = op.Endereco_eletronico || "";
    const websiteEl = document.getElementById("modalPayment");
    if (websiteEl) {
        if (website) {
            const fullUrl = website.startsWith("http") ? website : `http://www.${website.replace(/^www\./, "")}`;
            const displayUrl = website.startsWith("www.") ? website : `www.${website}`;
            websiteEl.innerHTML = `<a href="${fullUrl}" target="_blank" style="color:var(--primary); text-decoration:underline;">${displayUrl}</a>`;
        } else {
            websiteEl.textContent = "N/A";
        }
    }

    populateDemografia(op.Registro_ANS);

    document.getElementById("rn518").innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">Indicadores RN518 Indisponível</div>`;
    document.getElementById("cbr").innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">Indicadores CBR Indisponível</div>`;

    buyModal.classList.add("active");

    const modalClose = document.getElementById("modalClose");
    const modalConfirm = document.getElementById("modalConfirm");
    const btnDeepHistory = document.getElementById("btnDeepHistory");

    const hideModal = () => buyModal.classList.remove("active");
    if (modalClose) modalClose.onclick = hideModal;
    if (modalConfirm) modalConfirm.onclick = hideModal;

    if (btnDeepHistory) {
        btnDeepHistory.onclick = () => {
            window.location.href = `historico.html?ans=${op.Registro_ANS}`;
        };
    }

    buyModal.onclick = (e) => { if (e.target === buyModal) hideModal(); }

    document.querySelectorAll(".modal-tab").forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll(".modal-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".modal-tab-content").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(tab.dataset.tab).classList.add("active");
        }
    });
}

