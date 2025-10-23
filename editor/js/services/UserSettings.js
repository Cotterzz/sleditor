// User preferences and settings
// Compact interface: load/save/apply settings

export const UserSettings = {
    settings: {
        theme: 'dark',
    },

    load() {
        const stored = localStorage.getItem('editorSettings');
        if (stored) {
            try {
                this.settings = { ...this.settings, ...JSON.parse(stored) };
            } catch (e) {
                console.warn('Failed to load settings, using defaults');
            }
        }
        this.apply();
    },

    save() {
        localStorage.setItem('editorSettings', JSON.stringify(this.settings));
    },

    apply() {
        document.body.className = `theme-${this.settings.theme}`;
    },

    set(key, value) {
        this.settings[key] = value;
        this.save();
        this.apply();
    },

    get(key) {
        return this.settings[key];
    },

    toggleTheme() {
        const newTheme = this.settings.theme === 'dark' ? 'light' : 'dark';
        this.set('theme', newTheme);
        return newTheme;
    }
};
