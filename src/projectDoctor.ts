import * as vscode from 'vscode';

/**
 * ProjectDoctor provides real-time linting of "Elite Coding Standards" 
 * defined in the MARSLib framework.
 */
export class ProjectDoctor {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('marslib-doctor');
    }

    /**
     * Scans the document for violations and updates the "Problems" tab.
     */
    public refreshDiagnostics(document: vscode.TextDocument): void {
        const diagnostics: vscode.Diagnostic[] = [];

        // Only scan Java files
        if (document.languageId !== 'java') {
            return;
        }

        const text = document.getText();

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            const line = document.lineAt(lineIndex);
            const lineText = line.text;
            
            // Rule 1: Thread.sleep (Critical Error)
            if (lineText.includes('Thread.sleep')) {
                const start = lineText.indexOf('Thread.sleep');
                const range = new vscode.Range(lineIndex, start, lineIndex, start + 12);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    'Critical Error: Thread.sleep() found. Blocking the main thread is lethal in FRC. Use Command-Based schedules or Timer.delay() instead.',
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = 'MARSLIB_BLOCKING_CALL';
                diagnostics.push(diagnostic);
            }

            // Rule 2: Hungarian Notation / m_ prefix (Standard Violation)
            const hungarianRegex = /\b(m_|f_|s_)([a-zA-Z0-9]+)\b/g;
            let match;
            while ((match = hungarianRegex.exec(lineText)) !== null) {
                const start = match.index;
                const range = new vscode.Range(lineIndex, start, lineIndex, start + match[0].length);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    'Elite Coding Standard Violation: Hungarian notation (m_, f_, s_) is banned. Use descriptive camelCase names without prefixes.',
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostic.code = 'MARSLIB_HUNGARIAN_BANNED';
                diagnostics.push(diagnostic);
            }

            // Rule 3: Single Character Variables (Ambiguity Violation)
            // Looking for declarations: type name = ... or type name;
            const singleCharRegex = /\b(int|double|float|long|boolean|String|var)\s+([a-zA-Z])\b(?!\.)\s*[=;]/g;
            let scMatch;
            while ((scMatch = singleCharRegex.exec(lineText)) !== null) {
                const varName = scMatch[2];
                if (!['i', 'j', 'k', 'e'].includes(varName.toLowerCase())) {
                    const start = lineText.indexOf(varName, scMatch.index + scMatch[1].length);
                    const range = new vscode.Range(lineIndex, start, lineIndex, start + 1);
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        'Elite Coding Standard Violation: Single-character variable names are banned (except i, j, k, e). Use descriptive names indicating units (e.g., velocityMetersPerSecond).',
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.code = 'MARSLIB_AMBIGUOUS_NAME';
                    diagnostics.push(diagnostic);
                }
            }
        }

        // Rule 4: Missing @AutoLog in IO Inputs classes
        if (document.fileName.toLowerCase().includes('io') || document.fileName.toLowerCase().includes('inputs')) {
            if (lineIndexCount(text, 'class') > 0 && lineIndexCount(text, 'Inputs') > 0 && !text.includes('@AutoLog')) {
                const range = new vscode.Range(0, 0, 0, 0);
                const diagnostic = new vscode.Diagnostic(
                    range,
                    'Missing @AutoLog: IO Inputs classes should be annotated with @AutoLog for AdvantageKit telemetry.',
                    vscode.DiagnosticSeverity.Warning
                );
                diagnostics.push(diagnostic);
            }
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
            this.diagnosticCollection
        );
    }
}

function lineIndexCount(text: string, search: string): number {
    return text.split(search).length - 1;
}
