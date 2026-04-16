import * as vscode from 'vscode';

/**
 * ProjectDoctor provides real-time linting of "Elite Coding Standards" 
 * defined in the MARSLib framework.
 * 
 * Rules are configurable via the `marslib.projectDoctor.enabled` setting.
 * Each rule has a unique diagnostic code for targeted quick-fix resolution.
 */
export class ProjectDoctor {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('marslib-doctor');
    }

    private isEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('marslib');
        return config.get<boolean>('projectDoctor.enabled', true);
    }

    /**
     * Scans the document for violations and updates the "Problems" tab.
     */
    public refreshDiagnostics(document: vscode.TextDocument): void {
        if (!this.isEnabled()) {
            this.diagnosticCollection.set(document.uri, []);
            return;
        }

        // Only scan Java files
        if (document.languageId !== 'java') {
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();

        // Track if we're inside a periodic() or execute() method for allocation detection
        let insideHotLoop = false;
        let braceDepth = 0;
        let hotLoopBraceStart = 0;

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const line = document.lineAt(lineIndex);
            const lineText = line.text;

            // Track hot loop entry (periodic, execute, updateInputs methods)
            if (/\bpublic\s+void\s+(periodic|execute|updateInputs)\s*\(/.test(lineText)) {
                insideHotLoop = true;
                hotLoopBraceStart = braceDepth;
            }

            // Track brace depth for hot loop detection
            for (const ch of lineText) {
                if (ch === '{') { braceDepth++; }
                if (ch === '}') {
                    braceDepth--;
                    if (insideHotLoop && braceDepth <= hotLoopBraceStart) {
                        insideHotLoop = false;
                    }
                }
            }

            // Rule 1: Thread.sleep (Critical Error)
            if (lineText.includes('Thread.sleep')) {
                const start = lineText.indexOf('Thread.sleep');
                const range = new vscode.Range(lineIndex, start, lineIndex, start + 12);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    'Critical: Thread.sleep() blocks the main robot thread. Use Timer.delay() or Command-Based schedules.',
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = 'MARSLIB_BLOCKING_CALL';
                diagnostic.source = 'marslib-doctor';
                diagnostics.push(diagnostic);
            }

            // Rule 2: Hungarian Notation / m_ prefix
            const hungarianRegex = /\b(m_|f_|s_)([a-zA-Z0-9]+)\b/g;
            let match;
            while ((match = hungarianRegex.exec(lineText)) !== null) {
                const start = match.index;
                const range = new vscode.Range(lineIndex, start, lineIndex, start + match[0].length);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Elite Standard: Hungarian notation '${match[1]}' is banned. Use descriptive camelCase.`,
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = 'MARSLIB_HUNGARIAN_BANNED';
                diagnostic.source = 'marslib-doctor';
                diagnostics.push(diagnostic);
            }

            // Rule 3: Single Character Variables
            const singleCharRegex = /\b(int|double|float|long|boolean|String|var)\s+([a-zA-Z])\b(?!\.)\s*[=;]/g;
            let scMatch;
            while ((scMatch = singleCharRegex.exec(lineText)) !== null) {
                const varName = scMatch[2];
                if (!['i', 'j', 'k', 'e'].includes(varName.toLowerCase())) {
                    const start = lineText.indexOf(varName, scMatch.index + scMatch[1].length);
                    const range = new vscode.Range(lineIndex, start, lineIndex, start + 1);
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Elite Standard: Single-char variable '${varName}' is ambiguous. Use descriptive names with units (e.g., velocityMetersPerSecond).`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.code = 'MARSLIB_AMBIGUOUS_NAME';
                    diagnostic.source = 'marslib-doctor';
                    diagnostics.push(diagnostic);
                }
            }

            // Rule 4: System.out.println — should use Logger
            if (lineText.includes('System.out.println') || lineText.includes('System.err.println')) {
                const target = lineText.includes('System.out.println') ? 'System.out.println' : 'System.err.println';
                const start = lineText.indexOf(target);
                const range = new vscode.Range(lineIndex, start, lineIndex, start + target.length);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    'Use Logger.recordOutput() instead of System.out.println for AdvantageKit replay compatibility.',
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = 'MARSLIB_SYSOUT';
                diagnostic.source = 'marslib-doctor';
                diagnostics.push(diagnostic);
            }

            // Rule 5: Object allocation inside hot loops (periodic/execute)
            if (insideHotLoop) {
                const allocRegex = /\bnew\s+[A-Z][a-zA-Z0-9]*\s*[<([\]]/g;
                let allocMatch;
                while ((allocMatch = allocRegex.exec(lineText)) !== null) {
                    // Ignore common safe patterns (lambda expressions, enum constants)
                    const allocText = lineText.substring(allocMatch.index);
                    if (allocText.startsWith('new double[') || allocText.startsWith('new int[')) {
                        continue; // Primitive arrays are generally fine
                    }
                    const range = new vscode.Range(lineIndex, allocMatch.index, lineIndex, allocMatch.index + allocMatch[0].length);
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        'Zero-Allocation Zone: Object creation inside periodic()/execute() causes GC pressure. Pre-allocate as a class field.',
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.code = 'MARSLIB_ALLOCATION_IN_LOOP';
                    diagnostic.source = 'marslib-doctor';
                    diagnostics.push(diagnostic);
                }

                // Rule 10: getInstance() inside hot loops
                if (lineText.includes('.getInstance()')) {
                    const start = lineText.indexOf('.getInstance()');
                    const range = new vscode.Range(lineIndex, start, lineIndex, start + 14);
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        'Elite Standard Violation: Calling getInstance() or synchronized methods inside a hot loop causes lock contention. Cache the reference in the constructor.',
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.code = 'MARSLIB_SYNC_CONTENTION';
                    diagnostic.source = 'marslib-doctor';
                    diagnostics.push(diagnostic);
                }
            }

            // Rule 6: while(true) infinite loops
            if (/\bwhile\s*\(\s*true\s*\)/.test(lineText)) {
                const start = lineText.indexOf('while');
                const range = new vscode.Range(lineIndex, start, lineIndex, start + 10);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    'Critical: while(true) blocks the robot thread indefinitely. Use Command-Based scheduling.',
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = 'MARSLIB_INFINITE_LOOP';
                diagnostic.source = 'marslib-doctor';
                diagnostics.push(diagnostic);
            }

            // Rule 7: Magic numbers in motor configuration
            const magicNumRegex = /\.(withStatorCurrentLimit|withSupplyCurrentLimit|withMotionMagic|setSmartCurrentLimit|setSecondaryCurrentLimit)\s*\(\s*(\d+\.?\d*)\s*\)/g;
            let magicMatch;
            while ((magicMatch = magicNumRegex.exec(lineText)) !== null) {
                const numStart = lineText.indexOf(magicMatch[2], magicMatch.index);
                const range = new vscode.Range(lineIndex, numStart, lineIndex, numStart + magicMatch[2].length);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Magic number ${magicMatch[2]} in motor config. Extract to a named constant in your Constants class.`,
                    vscode.DiagnosticSeverity.Information
                );
                diagnostic.code = 'MARSLIB_MAGIC_NUMBER';
                diagnostic.source = 'marslib-doctor';
                diagnostics.push(diagnostic);
            }

            // Rule 8: Missing addRequirements in Command constructors
            if (/class\s+\w+\s+extends\s+Command\b/.test(lineText)) {
                // Scan ahead for constructor and check for addRequirements
                let foundConstructor = false;
                let foundAddRequirements = false;
                let scanBraceDepth = 0;
                let inConstructor = false;
                const className = lineText.match(/class\s+(\w+)/)?.[1] || '';

                for (let j = lineIndex; j < Math.min(lineIndex + 50, document.lineCount); j++) {
                    const scanLine = document.lineAt(j).text;
                    if (scanLine.includes(`public ${className}(`)) {
                        foundConstructor = true;
                        inConstructor = true;
                        scanBraceDepth = 0;
                    }
                    if (inConstructor) {
                        for (const ch of scanLine) {
                            if (ch === '{') { scanBraceDepth++; }
                            if (ch === '}') {
                                scanBraceDepth--;
                                if (scanBraceDepth <= 0) {
                                    inConstructor = false;
                                    break;
                                }
                            }
                        }
                        if (scanLine.includes('addRequirements')) {
                            foundAddRequirements = true;
                        }
                    }
                }

                if (foundConstructor && !foundAddRequirements) {
                    const start = lineText.indexOf('class');
                    const range = new vscode.Range(lineIndex, start, lineIndex, start + 5 + className.length + 1);
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Command '${className}' is missing addRequirements() in its constructor. This can cause scheduling conflicts.`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.code = 'MARSLIB_MISSING_REQUIREMENTS';
                    diagnostic.source = 'marslib-doctor';
                    diagnostics.push(diagnostic);
                }
            }
        }

        // Rule 9: Missing @AutoLog in IO Inputs classes
        const classMatch = text.match(/class\s+\w*Inputs\b/);
        if (classMatch && !text.includes('@AutoLog')) {
            const pos = document.positionAt(text.indexOf(classMatch[0]));
            const range = new vscode.Range(pos.line, 0, pos.line, classMatch[0].length);
            const diagnostic = new vscode.Diagnostic(
                range,
                'Missing @AutoLog: IO Inputs classes must be annotated with @AutoLog for AdvantageKit telemetry.',
                vscode.DiagnosticSeverity.Warning
            );
            diagnostic.code = 'MARSLIB_MISSING_AUTOLOG';
            diagnostic.source = 'marslib-doctor';
            diagnostics.push(diagnostic);
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    public subscribeToEvents(context: vscode.ExtensionContext): void {
        if (vscode.window.activeTextEditor) {
            this.refreshDiagnostics(vscode.window.activeTextEditor.document);
        }
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    this.refreshDiagnostics(editor.document);
                }
            })
        );
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => this.refreshDiagnostics(event.document))
        );
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(event => {
                if (event.affectsConfiguration('marslib.projectDoctor')) {
                    // Re-lint all open editors
                    for (const editor of vscode.window.visibleTextEditors) {
                        this.refreshDiagnostics(editor.document);
                    }
                }
            })
        );
        context.subscriptions.push(
            this.diagnosticCollection
        );
    }
}

function occurrenceCount(text: string, search: string): number {
    return text.split(search).length - 1;
}
