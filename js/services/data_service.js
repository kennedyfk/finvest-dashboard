/**
 * js/services/data_service.js
 * Service for loading application data and generating historical simulations.
 */

export const dataService = {
    cache: {
        cadop: null,
        beneficiarios: null
    },

    /**
     * Loads core data files.
     */
    async init() {
        if (this.cache.cadop && this.cache.beneficiarios) return;

        try {
            const [cadopRes, benefRes] = await Promise.all([
                fetch('data/dados_cadop.json'),
                fetch('data/dados_beneficiarios.json')
            ]);

            this.cache.cadop = await cadopRes.json();
            this.cache.beneficiarios = await benefRes.json();
        } catch (error) {
            console.error("Error loading data:", error);
            throw error;
        }
    },

    /**
     * Generates simulated 10-year financial history for an operator.
     * @param {string} regAns - Operator's ANS registration number.
     * @returns {Object} - Historical data object.
     */
    getDeepHistory(regAns) {
        const opInfo = { ...this.cache.cadop[regAns] }; // Clone to avoid modifying original cache if needed
        if (!opInfo || Object.keys(opInfo).length === 0) return null;
        
        // Ensure Registro_ANS is present (as it's the key in the JSON, not a field)
        opInfo.Registro_ANS = regAns;

        const benefHistory = this.cache.beneficiarios[regAns] || {};
        const dates = Object.keys(benefHistory).sort();
        
        // Baseline from latest available data or defaults
        const latestDate = dates[dates.length - 1] || '2025-01-01';
        const latestBenef = benefHistory[latestDate] || { qt_beneficiario_ativo: 5000 };
        const baseBeneficiarios = Number(latestBenef.qt_beneficiario_ativo || 5000);

        // Constants for simulation
        const currentYear = new Date().getFullYear();
        const startYear = currentYear - 10;
        const history = [];

        // Realistic seed based on ANS number to ensure consistency for the same operator
        let seed = parseInt(regAns) / 100000;
        const pseudoRandom = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };

        // Trend factors per modalidade (simulated)
        const trends = {
            'Medicina de Grupo': 0.05,
            'Cooperativa Médica': 0.03,
            'Autogestão': 0.01,
            'Filantropia': 0.02,
            'Administradora de Benefícios': 0.08
        };
        const baseTrend = trends[opInfo.Modalidade] || 0.04;

        for (let year = startYear; year <= currentYear; year++) {
            for (let quarter = 1; quarter <= 4; quarter++) {
                const age = year - startYear + (quarter / 4);
                const growthFactor = 1 + (baseTrend * age) + (pseudoRandom() * 0.1 - 0.05);
                
                // Simulated Metrics
                const beneficiaries = Math.floor(baseBeneficiarios * growthFactor * 0.8); // Scale down for past
                const avgTicketMonthly = 450 + (year - startYear) * 25; // Inflation + maturity
                const revenue = beneficiaries * avgTicketMonthly * 3; // Quarterly revenue
                
                const lossRatio = 0.75 + (pseudoRandom() * 0.15 - 0.05); // 70% to 85% range
                const expenses = revenue * lossRatio;
                const adminExpenses = revenue * 0.12; // 12% admin cost
                const profit = revenue - expenses - adminExpenses;

                history.push({
                    year,
                    quarter,
                    period: `${quarter}T${year}`,
                    beneficiaries,
                    revenue,
                    expenses,
                    profit,
                    lossRatio: lossRatio * 100,
                    margin: (profit / revenue) * 100
                });
            }
        }

        return {
            info: opInfo,
            history: history
        };
    }
};
