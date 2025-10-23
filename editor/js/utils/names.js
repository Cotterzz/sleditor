export function nextSequentialName(baseName, existingNames) {
    const existingSet = new Set(existingNames || []);
    let counter = 0;
    while (existingSet.has(`${baseName}${counter}`)) {
        counter++;
    }
    return `${baseName}${counter}`;
}
