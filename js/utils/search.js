/**
 * Normaliza o texto removendo acentos e convertendo para minúsculas.
 * @param {string} text 
 * @returns {string}
 */
export function normalizeText(text) {
    if (!text) return "";
    return text.toString().toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Verifica se todos os termos da busca estão presentes no texto alvo (busca inteligente).
 * Ex: "unimed fortaleza" combina com "UNIMED DE FORTALEZA COOPERATIVA"
 * @param {string} target 
 * @param {string} query 
 * @returns {boolean}
 */
export function smartSearch(target, query) {
    if (!query) return true;
    if (!target) return false;

    const normalizedTarget = normalizeText(target);
    const normalizedQuery = normalizeText(query);

    // Split query into terms, ignoring very short words (stop words)
    // Conectores comuns em português que devem ser ignorados na busca por palavras-chave
    const stopWords = ["de", "da", "do", "dos", "das", "e", "a", "o", "com", "em"];
    const queryTerms = normalizedQuery.split(/\s+/)
        .filter(term => term.length > 1 && !stopWords.includes(term));

    if (queryTerms.length === 0) {
        // If all terms were filtered, fallback to simple inclusion check
        return normalizedTarget.includes(normalizedQuery);
    }

    // Every significant term must be present in the target string
    return queryTerms.every(term => normalizedTarget.includes(term));
}
