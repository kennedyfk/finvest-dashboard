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

document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);

    // Carrega sidebar
    await loadComponent("components/sidebar.html", "sidebarContainer");

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

    // Configura item ativo no sidebar
    document.querySelectorAll(".nav-item").forEach(item => {
        if (item.dataset.page === "help") {
            document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
            item.classList.add("active");
        }
        
        // Em links que não são href="help.html" nem href="index.html", apenas previne
        if (item.getAttribute("href") === "#") {
            item.addEventListener("click", (e) => {
                e.preventDefault();
                document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
                item.classList.add("active");
                if (window.innerWidth <= 1024) sidebar.classList.remove("open");
            });
        }
    });

    // Logica do FAQ
    document.querySelectorAll(".faq-item").forEach(item => {
        const questionBtn = item.querySelector(".faq-question");
        questionBtn.addEventListener("click", () => {
            const isActive = item.classList.contains("active");
            
            // Fecha os outros
            document.querySelectorAll(".faq-item").forEach(other => {
                other.classList.remove("active");
            });

            // Abre se estava fechado
            if (!isActive) {
                item.classList.add("active");
            }
        });
    });
});
