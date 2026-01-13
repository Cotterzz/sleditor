/**
 * Select Component
 * 
 * Styled dropdown with variants for different contexts.
 */

/**
 * Create a select element
 * @param {object} options
 * @param {Array<{value: string, label: string}>} options.items - Dropdown items
 * @param {string} options.value - Currently selected value
 * @param {Function} options.onChange - Change handler (receives new value)
 * @param {string} options.variant - 'default' | 'compact' | 'monospace'
 * @param {string} options.placeholder - Placeholder text
 * @param {boolean} options.disabled - Disabled state
 * @param {string} options.className - Additional CSS classes
 * @returns {HTMLSelectElement}
 */
export function Select(options = {}) {
    const {
        items = [],
        value = null,
        onChange = null,
        variant = 'default',
        placeholder = null,
        disabled = false,
        className = ''
    } = options;
    
    const select = document.createElement('select');
    select.className = `sl-select sl-select-${variant} ${className}`.trim();
    select.disabled = disabled;
    
    // Placeholder option if provided
    if (placeholder) {
        const placeholderOpt = document.createElement('option');
        placeholderOpt.value = '';
        placeholderOpt.textContent = placeholder;
        placeholderOpt.disabled = true;
        placeholderOpt.selected = value === null || value === '';
        select.appendChild(placeholderOpt);
    }
    
    // Add items
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        if (item.value === value) opt.selected = true;
        select.appendChild(opt);
    });
    
    // Change handler
    if (onChange) {
        select.addEventListener('change', (e) => onChange(e.target.value));
    }
    
    return select;
}

export default Select;
