// Main application coordinator
// Compact interface: initializes and coordinates all systems

import { UserSettings } from './services/UserSettings.js';
import { LanguageConfig } from './services/LanguageConfig.js';
import { NodeFactory } from './core/NodeFactory.js';
import { ScopeManager } from './core/ScopeManager.js';
import { CodeGenerator } from './core/CodeGenerator.js';
import { ChoiceGenerator } from './services/ChoiceGenerator.js';
import { NumberGesture } from './interactions/NumberGesture.js';
import { OperatorGesture } from './interactions/OperatorGesture.js';
import { DirectionalGesture } from './interactions/DirectionalGesture.js';
import { ExpressionGesture } from './interactions/ExpressionGesture.js';
import { ParamGesture } from './interactions/ParamGesture.js';

export class Application {
    constructor() {
        this.numberGesture = new NumberGesture();
        this.operatorGesture = new OperatorGesture();
        this.directionalGesture = new DirectionalGesture();
        this.expressionGesture = new ExpressionGesture();
        this.paramGesture = new ParamGesture();
        this.setupEventListeners();
        this.initialize();
        this.setupLanguageSelector();
    }

    initialize() {
        UserSettings.load();

        const editor = document.getElementById('editor');
        editor.innerHTML = '';

        // Add root-level hole for declarations/functions before main
        const rootHoleBefore = NodeFactory.createHole('statement');
        rootHoleBefore.style.display = 'block';
        rootHoleBefore.style.marginBottom = '10px';
        editor.appendChild(rootHoleBefore);

        // Create initial function with one statement hole
        const mainFunc = this.createMainFunction();

        editor.appendChild(mainFunc);

        // Update scope and generate code
        ScopeManager.updateAllHoles();
        CodeGenerator.generate();
    }

    createMainFunction() {
        return NodeFactory.createFunctionDecl(
            'void',
            'main',
            [],
            [NodeFactory.createHole('statement')]
        );
    }

    setupEventListeners() {
        // Non-statement hole clicks (keep old menu system)
        document.addEventListener('click', (e) => {
            const hole = e.target.closest('[data-node-type="hole"]');
            if (hole && hole.dataset.contextType !== 'statement') {
                // Disable picker for int expression holes and parameter holes (gesture-only)
                if ((hole.dataset.contextType === 'expression' && hole.dataset.expectedType === 'int') ||
                    (hole.dataset.contextType === 'parameter')) {
                    e.stopPropagation();
                    return;
                }
                const choices = ChoiceGenerator.getChoices(hole);
                this.showChoicePicker(hole, choices);
                e.stopPropagation();
            }
        });

        // Gesture-based interactions
        document.addEventListener('mousedown', (e) => {
            // Statement holes use directional gesture
            const hole = e.target.closest('[data-node-type="hole"]');
            if (hole && hole.dataset.contextType === 'statement') {
                this.directionalGesture.start(hole, e.clientX, e.clientY);
                e.preventDefault();
                return;
            }

            // Param holes use param gesture
            if (hole && hole.dataset.contextType === 'parameter') {
                if (this.paramGesture.start(hole, e.clientX, e.clientY)) {
                    e.preventDefault();
                    return;
                }
            }

            // Int expression holes use expression gesture
            if (hole && hole.dataset.contextType === 'expression' && hole.dataset.expectedType === 'int') {
                if (this.expressionGesture.start(hole, e.clientX, e.clientY)) {
                    e.preventDefault();
                    return;
                }
            }

            // Numbers use number gesture
            const number = e.target.closest('[data-node-type="number"]');
            if (number) {
                this.numberGesture.start(number, e.clientX, e.clientY);
                e.preventDefault();
                return;
            }

            // Operators use operator gesture
            const operator = e.target.closest('[data-node-type="operator"]');
            if (operator) {
                this.operatorGesture.start(operator, e.clientX, e.clientY);
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            this.numberGesture.move(e.clientX, e.clientY);
            this.operatorGesture.move(e.clientX, e.clientY);
            this.directionalGesture.move(e.clientX, e.clientY);
            this.expressionGesture.move(e.clientX, e.clientY);
            this.paramGesture.move(e.clientX, e.clientY);
        });

        document.addEventListener('mouseup', () => {
            this.numberGesture.end();
            this.operatorGesture.end();
            this.directionalGesture.end();
            this.expressionGesture.end();
            this.paramGesture.end();
        });

        // Button controls
        document.getElementById('btn-theme').onclick = () => {
            const newTheme = UserSettings.toggleTheme();
            console.log(`Theme switched to: ${newTheme}`);
        };

        const languageBtn = document.getElementById('btn-language');
        if (languageBtn) {
            languageBtn.onclick = () => {
                this.cycleLanguage();
            };
        }

        document.getElementById('btn-clear').onclick = () => {
            if (confirm('Clear the editor?')) {
                this.initialize();
            }
        };

        document.getElementById('btn-export').onclick = () => {
            const currentLang = LanguageConfig.getCurrent();
            const extension = currentLang.name.toLowerCase();
            const code = document.getElementById('output').textContent;
            this.exportToFile(code, `program.${extension}`);
        };
    }

    showChoicePicker(hole, choices) {
        // Create picker element
        const picker = document.createElement('div');
        picker.className = 'choice-picker';
        picker.style.position = 'fixed';

        // Position near the hole
        const rect = hole.getBoundingClientRect();
        picker.style.left = rect.left + 'px';
        picker.style.top = (rect.bottom + 5) + 'px';

        // Add header
        const header = document.createElement('div');
        header.className = 'choice-header';
        header.textContent = `Choose ${hole.dataset.contextType}`;
        picker.appendChild(header);

        // Add choices
        choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'choice-button';
            btn.dataset.choiceType = choice.type;

            const icon = document.createElement('span');
            icon.className = 'choice-icon';
            icon.textContent = choice.icon;

            const label = document.createElement('span');
            label.className = 'choice-label';
            label.textContent = choice.label;

            btn.appendChild(icon);
            btn.appendChild(label);

            if (choice.submenu) {
                const arrow = document.createElement('span');
                arrow.className = 'submenu-arrow';
                arrow.textContent = '▶';
                btn.appendChild(arrow);
                btn.dataset.hasSubmenu = 'true';
            }

            btn.dataset.choice = JSON.stringify(choice);
            picker.appendChild(btn);
        });

        document.body.appendChild(picker);

        // Handle clicks on choices
        picker.addEventListener('click', (e) => {
            const button = e.target.closest('.choice-button');
            if (!button) return;

            const choice = JSON.parse(button.dataset.choice);
            this.handleChoiceSelection(hole, choice);
            picker.remove();
        });

        // Remove picker when clicking outside
        const removePicker = (e) => {
            if (!picker.contains(e.target)) {
                picker.remove();
                document.removeEventListener('click', removePicker);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', removePicker);
        }, 10);
    }

    handleChoiceSelection(hole, choice) {
        // Import InteractionController dynamically to avoid circular dependency
        import('./interactions/InteractionController.js').then(({ InteractionController }) => {
            const newNode = InteractionController.replaceHole(hole, choice);
            if (newNode) {
                // Update scope and regenerate code
                ScopeManager.updateAllHoles();
                CodeGenerator.generate();
            }
        }).catch(err => {
            console.error('Failed to handle choice selection:', err);
        });
    }

    setupLanguageSelector() {
        // Update the language button text initially
        this.updateLanguageButton();

        // Add language indicator to output panel header
        const outputHeader = document.querySelector('.output-panel .panel-header');
        if (outputHeader) {
            const langIndicator = document.createElement('span');
            langIndicator.id = 'language-indicator';
            langIndicator.style.cssText = 'font-size: 11px; opacity: 0.7; margin-left: 10px;';
            outputHeader.appendChild(langIndicator);
            this.updateLanguageIndicator();
        }

        // Update title and labels to be language-aware
        this.updateLanguageUI();
    }

    cycleLanguage() {
        const languages = LanguageConfig.getAvailableLanguages();
        const currentIndex = languages.indexOf(LanguageConfig.currentLanguage);
        const nextIndex = (currentIndex + 1) % languages.length;
        const nextLanguage = languages[nextIndex];

        LanguageConfig.setLanguage(nextLanguage);
        this.updateLanguageButton();
        this.updateLanguageIndicator();
        this.updateLanguageUI();

        // Regenerate code for new language
        CodeGenerator.generate();

        console.log(`Language switched to: ${LanguageConfig.getCurrent().name}`);
    }

    updateLanguageButton() {
        const btn = document.getElementById('btn-language');
        if (btn) {
            const currentLang = LanguageConfig.getCurrent();
            btn.textContent = `🌐 ${currentLang.name}`;
        }
    }

    updateLanguageIndicator() {
        const indicator = document.getElementById('language-indicator');
        if (indicator) {
            const currentLang = LanguageConfig.getCurrent();
            indicator.textContent = currentLang.name;
        }
    }

    updateLanguageUI() {
        const currentLang = LanguageConfig.getCurrent();

        // Update page title
        document.title = `Gesture-Based Structured Code Editor - ${currentLang.name}`;

        // Update main title
        const mainTitle = document.getElementById('main-title');
        if (mainTitle) {
            mainTitle.textContent = `⚡ Gesture-Based Structured Code Editor - ${currentLang.name}`;
        }

        // Update output panel header
        const outputHeader = document.querySelector('.output-panel .panel-header');
        if (outputHeader && !outputHeader.querySelector('#language-indicator')) {
            outputHeader.textContent = `${currentLang.name} Output`;
        }

        // Update editor panel header
        const editorHeader = document.querySelector('.code-panel .panel-header');
        if (editorHeader) {
            editorHeader.textContent = `Editor - Build your ${currentLang.name} ${currentLang.name === 'JavaScript' ? 'application' : 'shader'}`;
        }
    }

    exportToFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}
