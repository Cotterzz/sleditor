// "2026" displayed as a grid of uniformly-spaced rounded squares
// Digits formed by presence/absence of squares in a regular grid

// Rounded box SDF
float sdRoundBox(in vec2 p, in vec2 b, in float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// Check if a cell should be filled for digit 2 (5 rows x 3 cols)
// Grid: row 0 = top, col 0 = left
bool digit2(int col, int row) {
    // ###
    //   #
    // ###
    // #
    // ###
    if (row == 0) return true;                    // top row
    if (row == 1) return (col == 2);              // right only
    if (row == 2) return true;                    // middle row
    if (row == 3) return (col == 0);              // left only
    if (row == 4) return true;                    // bottom row
    return false;
}

// Check if a cell should be filled for digit 0
bool digit0(int col, int row) {
    // ###
    // # #
    // # #
    // # #
    // ###
    if (row == 0 || row == 4) return true;        // top and bottom
    return (col == 0 || col == 2);                // sides
}

// Check if a cell should be filled for digit 6
bool digit6(int col, int row) {
    // ###
    // #
    // ###
    // # #
    // ###
    if (row == 0) return true;                    // top
    if (row == 1) return (col == 0);              // left only
    if (row == 2) return true;                    // middle
    if (row == 3) return (col == 0 || col == 2);  // sides
    if (row == 4) return true;                    // bottom
    return false;
}

// Get if cell is filled for a specific digit (0, 2, or 6)
bool getDigitCell(int digit, int col, int row) {
    if (digit == 2) return digit2(col, row);
    if (digit == 0) return digit0(col, row);
    if (digit == 6) return digit6(col, row);
    return false;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    float px = 2.0 / iResolution.y;
    
    // Grid parameters
    float cellSize = 0.08;      // size of each rounded square
    float spacing = 0.12;       // distance between cell centers
    float cornerRadius = 0.02;  // rounded corner radius
    
    // Digit layout: 4 digits, each 3 cells wide, 1 cell gap between digits
    // Total width = 4*3 + 3*1 = 15 cells
    // Digits at: 2 (cols 0-2), 0 (cols 4-6), 2 (cols 8-10), 6 (cols 12-14)
    int digits[4] = int[4](2, 0, 2, 6);
    int digitStartCols[4] = int[4](0, 4, 8, 12);
    
    // Center the grid
    float totalWidth = 15.0 * spacing;
    float totalHeight = 5.0 * spacing;
    vec2 gridOrigin = vec2(-totalWidth * 0.5 + spacing * 0.5, totalHeight * 0.5 - spacing * 0.5);
    
    float d = 1e10;
    
    // Iterate through all cells
    for (int digitIdx = 0; digitIdx < 4; digitIdx++) {
        int digit = digits[digitIdx];
        int startCol = digitStartCols[digitIdx];
        
        for (int row = 0; row < 5; row++) {
            for (int col = 0; col < 3; col++) {
                if (getDigitCell(digit, col, row)) {
                    int globalCol = startCol + col;
                    vec2 cellCenter = gridOrigin + vec2(float(globalCol) * spacing, -float(row) * spacing);
                    float cellDist = sdRoundBox(p - cellCenter, vec2(cellSize * 0.5), cornerRadius);
                    d = min(d, cellDist);
                }
            }
        }
    }
    
    // Coloring (same style as original)
    vec3 col = (d > 0.0) ? vec3(0.9, 0.6, 0.3) : vec3(0.65, 0.85, 1.0);
    col *= 1.0 - exp2(-24.0 * abs(d));
    col *= 0.8 + 0.2 * cos(120.0 * d);
    col = mix(col, vec3(1.0), 1.0 - smoothstep(-px, px, abs(d) - 0.005));
    
    fragColor = vec4(col, 1.0);
}
