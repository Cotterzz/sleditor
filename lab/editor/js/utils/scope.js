export function getGlobalFunctionNames() {
    return Array.from(document.querySelectorAll('[data-node-type="function-decl"]'))
        .map(el => el.dataset.name)
        .filter(Boolean);
}
