/**
 * js/services/store.js
 * Centralized State Management for Finvest Dashboard.
 * Handles Favorites, Benchmarking selections, and LocalStorage sync.
 */

// Initial state from LocalStorage
const INITIAL_FAVORITES = JSON.parse(localStorage.getItem('finvest_favorites') || '[]');
const INITIAL_BENCHMARK = JSON.parse(localStorage.getItem('finvest_benchmark') || '[]');

export const store = {
    favorites: new Set(INITIAL_FAVORITES),
    benchmarkList: new Set(INITIAL_BENCHMARK),

    /**
     * Toggles an operator's favorite status.
     * @param {string|number} regAns - ANS Registration Number.
     * @returns {boolean} - New status.
     */
    toggleFavorite(regAns) {
        const reg = regAns.toString();
        if (this.favorites.has(reg)) {
            this.favorites.delete(reg);
        } else {
            this.favorites.add(reg);
        }
        this.save();
        return this.favorites.has(reg);
    },

    /**
     * Toggles an operator's benchmarking selection.
     * @param {string|number} regAns - ANS Registration Number.
     * @returns {boolean} - New status.
     */
    toggleBenchmark(regAns) {
        const reg = regAns.toString();
        if (this.benchmarkList.has(reg)) {
            this.benchmarkList.delete(reg);
        } else {
            this.benchmarkList.add(reg);
        }
        this.save();
        return this.benchmarkList.has(reg);
    },

    /**
     * Clears all favorites.
     */
    clearFavorites() {
        this.favorites.clear();
        this.save();
    },

    /**
     * Clears benchmarking selections.
     */
    clearBenchmark() {
        this.benchmarkList.clear();
        this.save();
    },

    /**
     * Persists current state to LocalStorage.
     */
    save() {
        localStorage.setItem('finvest_favorites', JSON.stringify([...this.favorites]));
        localStorage.setItem('finvest_benchmark', JSON.stringify([...this.benchmarkList]));
        
        // Dispatch custom event for reactive-like updates if needed
        window.dispatchEvent(new CustomEvent('store-updated', { 
            detail: { 
                favorites: this.favorites, 
                benchmark: this.benchmarkList 
            } 
        }));
    }
};
