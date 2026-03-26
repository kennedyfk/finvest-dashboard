/**
 * js/utils/ui.js
 * Shared UI helpers and common utilities.
 */

/**
 * Loads an HTML fragment into a target container.
 * @param {string} url - Path to the HTML component
 * @param {string} targetId - ID of the container element
 */
export async function loadComponent(url, targetId) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        const html = await response.text();
        const container = document.getElementById(targetId);
        if (container) {
            container.innerHTML = html;
        }
    } catch (err) {
        console.warn(`Component load failed for ${url}:`, err.message);
    }
}

/**
 * Displays a toast notification.
 */
export function showToast(message, type = "info") {
    let toastContainer = document.getElementById("toastContainer");
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.id = "toastContainer";
        toastContainer.className = "toast-container";
        document.body.appendChild(toastContainer);
    }

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

/**
 * Formats a number to pt-BR locale.
 */
export function formatNumber(num) {
    if (num === undefined || num === null || isNaN(num)) return "—";
    return num.toLocaleString('pt-BR');
}

/**
 * Formats a percentage to pt-BR locale.
 */
export function formatPercent(num) {
    if (num === undefined || num === null || isNaN(num)) return "—";
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}
