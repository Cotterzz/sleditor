# Touch-First Structured Code Editor for GLSL

A gesture-based, syntax-directed code editor where syntax errors are prevented by construction. Users build code through gestures and selections rather than typing.

## Core Concept

**DOM as AST**: The HTML DOM itself serves as the Abstract Syntax Tree, with semantic information stored in `data-*` attributes. No separate data model needed.

## Architecture

### Files
- `index.html` (2510 lines) - Complete application (HTML + JavaScript)
- `styles.css` (632 lines) - All styling with CSS variables for theming

### Key Components

**Model Layer (NodeFactory)**
- Creates semantic DOM nodes with `data-*` attributes
- Each node type: `hole`, `number`, `operator`, `var-decl`, `assignment`, `for-loop`, `if-statement`, etc.
- Holes are typed placeholders that know their expected type and context

**Scope Management (ScopeManager)**
- Traverses DOM (parents + previous siblings) to collect in-scope variables/functions
- Updates all holes when structure changes

**Choice Generation (ChoiceGenerator)**
- Provides context-aware, type-filtered choices for holes
- Uses semantic hints: `'mutation'`, `'condition'`, `'value'`

**Interaction Controllers**
- `NumberGesture`: Drag to adjust numeric values (exponential scaling + single-unit mode)
- `OperatorGesture`: Drag distance determines operator (6 comparison ops, 4 math ops)
- `DirectionalGesture`: Drag angle+distance for statement selection (for/if/var-decl/assignment)

**Code Generation (CodeGenerator)**
- Traverses DOM to output valid GLSL
- Recursive with proper indentation tracking
- DOM is source of truth

### Type System
- Types: `int`, `float`, `bool`, `vec2/3/4`, `mat2/3/4`, `ivec*`, `uvec*`, `bvec*`
- Type-based filtering for holes
- Type-based coloring (CSS via `data-var-type` attribute)
  - Float-based (float, vec, mat): Green `#4ade80`
  - Int-based (int, ivec, uvec): Blue `#60a5fa`
  - Bool-based: Yellow `#fbbf24`
  - Type keywords: Red/pink `#fb7185`

### User Settings
- Theme (dark/light) with CSS variables
- Persisted to localStorage
- Easy to extend for fontSize, autoSave, etc.

## Current Features

### Gestures
1. **Number Gesture**: Click-drag numbers
   - Horizontal: Magnitude (×10, ÷10)
   - Vertical: Coefficient
   - Dead-zone horizontal: Single-unit mode with exponential acceleration
   
2. **Operator Gesture**: Click-drag operators
   - Distance-based selection (0-20px: first op, 20-40px: second, etc.)
   - Comparison: `==`, `<`, `>`, `!=`, `<=`, `>=`
   - Math: `+`, `-`, `*`, `/`
   
3. **Directional Gesture**: Click-drag statement holes
   - Angle determines main choice (NE: for, E: var-decl, SE: assignment, S: if)
   - Distance determines sub-choice (e.g., for loop templates)

### Control Flow
- **For loops**: 4 templates
  - Simple: `for(int i = 0; i < N; i++)`
  - Flexible: `for(int i = 0; i < ⮊; ⮊)` (draggable operator, hole for increment)
  - Float: `for(float i = ⮊; i < ⮊; ⮊)`
  - Custom: `for(int ⮊ = ⮊; ⮊; ⮊)` (full control)
  
- **If statements**: `if (condition) { statements }`

### Declarations & Assignments
- Variable declarations with 9 types (float, int, vec2/3/4, bool, mat2/3/4)
- Auto-generated variable names (`myFloat0`, `myInt1`, etc.)
- Assignment to existing variables (filtered by scope)

### Expressions
- Number literals (int/float with proper GLSL formatting)
- Bool literals (true/false)
- Binary operations (math + comparison)
- Variable references
- Function calls (built-in GLSL functions)
- Increment operators (`i++`)

## Known Limitations / TODO

### Not Yet Implemented
- Function declarations (beyond `main()`)
- While/do-while loops
- Break/continue/discard statements
- Return statements
- Struct definitions
- Uniform/varying/attribute declarations
- Preprocessor directives
- Comments
- Ternary operator
- Array access
- Swizzling (e.g., `vec.xyz`)

### Future Enhancements
- Touch support (handlers exist but disabled)
- Multiple language support (architecture is mostly language-agnostic)
- Custom user themes
- Undo/redo
- Copy/paste
- Keyboard shortcuts for power users

## Language Abstraction

**Language-Agnostic Parts** (reusable for JS/Python/etc):
- DOM as AST architecture
- Gesture system
- Scope management logic
- UI components

**GLSL-Specific Parts** (would need config for other languages):
- `getBuiltInFunctions()` - GLSL functions
- `getTypeChoices()` - GLSL types
- `CodeGenerator.toGLSL()` - Output formatting
- Type compatibility rules
- Literal formatting (e.g., floats must have `.0`)

To add JavaScript support:
1. Create `LanguageConfig` object with types, functions, operators
2. Rename `toGLSL` → `toCode`
3. Make syntax configurable (e.g., `let i` vs `int i`)

## Development Notes

### CSS Theming
All colors defined as CSS variables in `:root` and `body.theme-light`/`body.theme-dark`. To add a new theme:
1. Add theme variables to `styles.css`
2. Extend `UserSettings.toggleTheme()` to include new theme

### Adding New Node Types
1. Add factory method to `NodeFactory`
2. Add serialization case to `CodeGenerator.toGLSL()`
3. Add choice generation to `ChoiceGenerator`
4. Add interaction handling to `InteractionController` or gesture class
5. Update scope collection if needed

### Debugging
- DOM Inspector: Right-click any element, inspect `data-*` attributes
- GLSL Output: Live preview in right panel
- Console: Scope tracking, gesture events logged

## Performance
- No virtual DOM - direct DOM manipulation
- CSS handles all visual updates
- Gesture feedback uses absolute positioning
- Efficient scope recalculation only on structure changes

## Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires ES6+ (arrow functions, classes, template literals)
- CSS variables support required
- No external dependencies

## License
[To be determined]

