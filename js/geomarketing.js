import { initSidebar } from './sidebar.js';
import { openOperatorModal } from './components/operator_modal.js';
import { loadComponent, showToast, formatNumber } from './utils/ui.js';
import { smartSearch, normalizeText } from './utils/search.js';

// Configuration
const GEOJSON_URL = 'https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/brazil-states.geojson';
const MAP_INITIAL_VIEW = [-15.78, -47.93]; // Brasília
const MAP_INITIAL_ZOOM = 4;

// State
let map;
let geojsonLayer;
let allOperators = {};
let beneficiariesData = {};
let statsByUF = {};
let selectedUF = null;
let selectedOperatorAns = null;
let currentGrades = [0, 100000, 200000, 500000, 1000000, 2000000, 5000000, 10000000];

/**
 * Cores para o Choropleth baseadas nos quartis de beneficiários
 */
function getColor(d) {
    if (d <= 0) return '#e5e7eb'; // Cinza para zero

    const colors = [
        '#FFEDA0', '#FED976', '#FEB24C', '#FD8D3C',
        '#FC4E2A', '#E31A1C', '#BD0026', '#800026'
    ];

    // Percorre do maior para o menor
    for (let i = currentGrades.length - 1; i >= 0; i--) {
        if (d >= currentGrades[i]) {
            const idx = Math.min(i, colors.length - 1);
            return colors[idx];
        }
    }
    return colors[0];
}

/**
 * Estilo para cada estado no GeoJSON
 */
function style(feature) {
    const uf = feature.properties.sigla;
    const stats = statsByUF[uf] || { beneficiaries: 0 };
    return {
        fillColor: getColor(stats.beneficiaries),
        weight: 1,
        opacity: 1,
        color: 'var(--border)',
        fillOpacity: 0.7
    };
}

/**
 * Processamento e agregação de dados
 */
async function loadAndProcessData() {
    try {
        if (Object.keys(allOperators).length === 0) {
            const [opsRes, benRes] = await Promise.all([
                fetch('data/dados_cadop.json'),
                fetch('data/dados_beneficiarios.json')
            ]);
            allOperators = await opsRes.json();
            beneficiariesData = await benRes.json();
        }

        // Reset statsByUF
        statsByUF = {};

        // Agregar por UF
        Object.keys(allOperators).forEach(ans => {
            const op = allOperators[ans];
            if (op.Status_Operadora !== 'ATIVA') return;

            // Se houver filtro de operadora, pular as outras
            if (selectedOperatorAns && ans !== selectedOperatorAns) return;

            const uf = op.UF;

            // Em caso de filtro individual, precisamos mapear todos os estados onde ela atua
            // se o dado de beneficiários estiver disponível por UF/município.
            // Para esta base simplificada, usaremos a UF sede ou simularemos a dispersão se houver dados.
            // NOTA: No dataset atual, o Registro_ANS mapeia para um histórico de beneficiários totais consolidado.
            // Para mostrar distribuição por estado de UMA operadora, precisaríamos de dados por UF.
            // Se não tivermos, vamos simular que os beneficiários estão na UF sede para fins demonstrativos
            // ou buscar nos "dados_beneficiarios.json" se houver quebra por UF lá.

            const processUF = (targetUf, count) => {
                if (!statsByUF[targetUf]) {
                    statsByUF[targetUf] = {
                        operators: 0,
                        beneficiaries: 0,
                        topOps: []
                    };
                }
                statsByUF[targetUf].operators++;
                statsByUF[targetUf].beneficiaries += count;
                statsByUF[targetUf].topOps.push({
                    reg: ans,
                    name: op.Nome_Fantasia || op.Razao_Social,
                    count: count
                });
            };

            const history = beneficiariesData[ans];
            if (history) {
                const dates = Object.keys(history).sort().reverse();
                if (dates.length > 0) {
                    const latest = history[dates[0]];
                    const count = parseInt(latest.qt_beneficiario_ativo || 0);

                    // Se não tivermos quebra por UF, usamos a sede
                    processUF(uf, count);
                }
            }
        });

        // Calcular Escalas Dinâmicas (Universal)
        const benValues = Object.values(statsByUF).map(s => s.beneficiaries).filter(v => v > 0);
        const maxVal = benValues.length > 0 ? Math.max(...benValues) : 0;
        const roundTo10 = (n) => Math.round(n / 10) * 10;

        if (maxVal > 0) {
            // Usar percentuais fixos para garantir que o mapa tenha variação visual independente do volume
            currentGrades = [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9].map(p => roundTo10(maxVal * p));
            currentGrades = [...new Set(currentGrades)].sort((a, b) => a - b);
        } else {
            currentGrades = [0, 100000, 500000, 1000000, 2000000, 5000000, 10000000];
        }

        // Ordenar os TOP 5 de cada UF
        Object.keys(statsByUF).forEach(uf => {
            statsByUF[uf].topOps.sort((a, b) => b.count - a.count);
            statsByUF[uf].topOps = statsByUF[uf].topOps.slice(0, 5);
        });

        updateGlobalKPIs();
        renderLegend();
        if (geojsonLayer) geojsonLayer.setStyle(style);

    } catch (error) {
        console.error('Erro ao processar dados:', error);
        showToast('Erro ao carregar dados geográficos.', 'danger');
    }
}

function updateGlobalKPIs() {
    let totalBen = 0;
    let totalOps = 0;

    Object.values(statsByUF).forEach(s => {
        totalBen += s.beneficiaries;
        totalOps += s.operators;
    });

    document.getElementById('kpiBeneficiarios').textContent = formatNumber(totalBen);
    document.getElementById('kpiOperadoras').textContent = formatNumber(totalOps);

    // Lista global TOP
    renderTopOperatorsList(Object.values(statsByUF).flatMap(s => s.topOps).sort((a, b) => b.count - a.count).slice(0, 5));
}

function updateRegionStats(ufName, ufSigla) {
    const stats = statsByUF[ufSigla];
    const nameEl = document.getElementById('selectedRegionName');

    if (!stats) {
        nameEl.querySelector('span').textContent = 'Brasil (Consolidado)';
        updateGlobalKPIs();
        return;
    }

    nameEl.querySelector('span').textContent = `${ufName} (${ufSigla})`;
    document.getElementById('kpiBeneficiarios').textContent = formatNumber(stats.beneficiaries);
    document.getElementById('kpiOperadoras').textContent = formatNumber(stats.operators);

    document.getElementById('kpiDensidade').textContent = (stats.beneficiaries / 100000).toFixed(2);

    renderTopOperatorsList(stats.topOps);
}

function renderTopOperatorsList(list) {
    const listEl = document.getElementById('topOperatorsList');
    if (list.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem;">Nenhum dado disponível.</div>';
        return;
    }

    listEl.innerHTML = list.map(op => `
        <div class="top-operator-item clickable-operator-item" title="Ver distribuição de ${op.name}" onclick="window.applyOperatorFilter('${op.reg}')">
            <span style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${op.name}</span>
            <strong style="color:var(--primary);">${formatNumber(op.count)}</strong>
        </div>
    `).join('');
}

function renderLegend() {
    const legendEl = document.getElementById('legendContent');
    if (!legendEl) return;

    const zeroItem = `
        <div class="legend-item" style="margin-bottom: 8px; border-bottom: 1px solid var(--border-light); padding-bottom: 8px;">
            <i class="legend-color" style="background:#e5e7eb"></i> Sem dados / 0
        </div>
    `;

    const gradeItems = currentGrades.map((grade, index) => {
        const next = currentGrades[index + 1];
        const color = getColor(grade + 1);
        
        if (grade === 0) {
            if (!next) return '';
            return `
                <div class="legend-item">
                    <i class="legend-color" style="background:${color}"></i>
                    1 &ndash; ${formatNumber(Math.round(next))}
                </div>
            `;
        }

        return `
            <div class="legend-item">
                <i class="legend-color" style="background:${color}"></i>
                ${formatNumber(Math.round(grade))}${next ? '&ndash;' + formatNumber(Math.round(next)) : '+'}
            </div>
        `;
    }).join('');

    legendEl.innerHTML = zeroItem + gradeItems;
}

/**
 * Inicialização do Mapa
 */
async function initMap() {
    // Brazil Bounds (Tightened)
    const southWest = L.latLng(-34.0, -74.0);
    const northEast = L.latLng(5.5, -34.7);
    const bounds = L.latLngBounds(southWest, northEast);

    map = L.map('map', {
        zoomControl: false, 
        attributionControl: false,
        maxBounds: bounds,
        maxBoundsViscosity: 1.0,
        minZoom: 4
    }).setView(MAP_INITIAL_VIEW, MAP_INITIAL_ZOOM);

    L.control.zoom({
        position: 'topright'
    }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        bounds: bounds
    }).addTo(map);

    try {
        const response = await fetch(GEOJSON_URL);
        const brazilGeo = await response.json();

        geojsonLayer = L.geoJson(brazilGeo, {
            style: style,
            onEachFeature: (feature, layer) => {
                layer.on({
                    mouseover: (e) => {
                        const l = e.target;
                        const props = l.feature.properties;
                        
                        l.setStyle({
                            weight: 2,
                            color: 'var(--primary)',
                            fillOpacity: 0.9
                        });
                        
                        l.openPopup();
                        updateRegionStats(props.name, props.sigla);
                    },
                    mouseout: (e) => {
                        geojsonLayer.resetStyle(e.target);
                        e.target.closePopup();
                    },
                    click: (e) => {
                        const props = e.target.feature.properties;
                        updateRegionStats(props.name, props.sigla);
                        map.fitBounds(e.target.getBounds());
                    }
                });

                const stats = statsByUF[feature.properties.sigla] || { beneficiaries: 0, operators: 0 };
                layer.bindPopup(`
                    <div style="font-family:Inter, sans-serif;">
                        <strong style="font-size:1rem; color:var(--primary);">${feature.properties.name}</strong><br/>
                        <div style="margin-top:8px; font-size:0.85rem;">
                            Vidas: <strong>${formatNumber(stats.beneficiaries)}</strong><br/>
                            Operadoras: <strong>${formatNumber(stats.operators)}</strong>
                        </div>
                    </div>
                `);
            }
        }).addTo(map);

    } catch (error) {
        console.error('Erro ao carregar GeoJSON:', error);
        showToast('Erro ao renderizar mapa geográfico.', 'danger');
    }
}

/**
 * Filtro de Operadora
 */
function initOperatorFilter() {
    const searchInput = document.getElementById('opSearchInput');
    const resultsDropdown = document.getElementById('opSearchResults');
    const filterBadge = document.getElementById('activeFilterBadge');
    const activeFilterName = document.getElementById('activeFilterName');
    const clearBtn = document.getElementById('clearFilterBtn');
    const resetBtn = document.getElementById('resetViewBtn');

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (map) {
                map.setView(MAP_INITIAL_VIEW, MAP_INITIAL_ZOOM);
                updateRegionStats('Brasil (Consolidado)', null);
            }
        });
    }

    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            resultsDropdown.classList.remove('active');
            return;
        }

        const matches = Object.keys(allOperators)
            .filter(ans => {
                const op = allOperators[ans];
                return smartSearch(op.Razao_Social, query) ||
                    (op.Nome_Fantasia && smartSearch(op.Nome_Fantasia, query)) ||
                    ans.includes(query);
            })
            .slice(0, 8);

        if (matches.length > 0) {
            resultsDropdown.innerHTML = matches.map(ans => {
                const op = allOperators[ans];
                return `<div class="search-result-item" data-ans="${ans}">
                    <strong>${op.Nome_Fantasia || op.Razao_Social}</strong><br/>
                    <small>ANS: ${ans} | ${op.UF}</small>
                </div>`;
            }).join('');
            resultsDropdown.classList.add('active');
        } else {
            resultsDropdown.classList.remove('active');
        }
    });

    resultsDropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.search-result-item');
        if (!item) return;
        window.applyOperatorFilter(item.dataset.ans);
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            selectedOperatorAns = null;
            localStorage.removeItem('finvest-geomarketing-operator');
            if (filterBadge) filterBadge.style.display = 'none';
            loadAndProcessData();
            showToast('Filtro removido. Exibindo dados consolidados.', 'info');
        });
    }

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsDropdown.contains(e.target)) {
            resultsDropdown.classList.remove('active');
        }
    });
}

/**
 * Aplica o filtro de operadora globalmente
 * @param {string} ans 
 */
window.applyOperatorFilter = (ans) => {
    const op = allOperators[ans];
    if (!op) return;

    selectedOperatorAns = ans;

    // Atualizar UI do badge
    const filterBadge = document.getElementById('activeFilterBadge');
    const activeFilterName = document.getElementById('activeFilterName');
    const resultsDropdown = document.getElementById('opSearchResults');
    const searchInput = document.getElementById('opSearchInput');

    if (activeFilterName) {
        activeFilterName.innerHTML = `Exibindo: <strong>${op.Nome_Fantasia || op.Razao_Social}</strong>`;
    }
    if (filterBadge) {
        filterBadge.style.display = 'flex';
    }
    if (resultsDropdown) {
        resultsDropdown.classList.remove('active');
    }
    if (searchInput) {
        searchInput.value = '';
    }

    loadAndProcessData();
    localStorage.setItem('finvest-geomarketing-operator', ans);
    showToast(`Exibindo distribuição de ${op.Nome_Fantasia || op.Razao_Social}`, 'success');
};

// Expor para o escopo global para o onclick
window.openDetail = (reg) => {
    const op = allOperators[reg];
    if (op) openOperatorModal(op);
};

document.addEventListener('DOMContentLoaded', async () => {
    // Initial UI load
    await Promise.all([
        loadComponent('components/sidebar.html', 'sidebarContainer'),
        loadComponent('components/operator_modal.html', 'operatorModalContainer')
    ]);

    initSidebar();

    const themeToggle = document.getElementById('themeToggle');
    
    const updateMapTiles = (theme) => {
        if (!map) return;
        const tileUrl = theme === 'dark' 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
            
        // Remove old layers
        map.eachLayer(layer => {
            if (layer instanceof L.TileLayer) map.removeLayer(layer);
        });
        
        L.tileLayer(tileUrl, {
            maxZoom: 19
        }).addTo(map);
    };

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('finvest-theme', newTheme);
            
            updateMapTiles(newTheme);
            if (geojsonLayer) geojsonLayer.setStyle(style);
        });
        
        // Load initial theme
        const savedTheme = localStorage.getItem('finvest-theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            // Tiles will be updated after initMap
        }
    }

    await loadAndProcessData();
    await initMap();
    updateMapTiles(document.documentElement.getAttribute('data-theme') || 'light');
    initOperatorFilter();

    // Load saved operator filter
    const savedOp = localStorage.getItem('finvest-geomarketing-operator');
    if (savedOp && allOperators[savedOp]) {
        window.applyOperatorFilter(savedOp);
    }
});

