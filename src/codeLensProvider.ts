import * as vscode from 'vscode';

/**
 * MARSCodeLensProvider injects helpful links and warnings directly into the editor code.
 */
export class MARSCodeLensProvider implements vscode.CodeLensProvider {
    private onDidChangeCodeLensesEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this.onDidChangeCodeLensesEmitter.event;

    constructor() {
        vscode.workspace.onDidChangeConfiguration((_) => {
            this.onDidChangeCodeLensesEmitter.fire();
        });
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];

        // Only for Java files
        if (document.languageId !== 'java') {
            return [];
        }

        const text = document.getText();
        
        // 1. Documentation link above Class definition
        const classRegex = /\bclass\s+([a-zA-Z0-9]+)\b/g;
        let match;
        while ((match = classRegex.exec(text)) !== null) {
            const className = match[1];
            const line = document.lineAt(document.positionAt(match.index).line);
            const range = new vscode.Range(line.lineNumber, 0, line.lineNumber, 0);

            let docUrl = 'https://MARSProgramming.github.io/MARSLib/';
            if (className.toLowerCase().includes('subsystem')) {
                docUrl += 'tutorials/zero-to-hero/03-command-based/';
            } else if (className.toLowerCase().includes('command')) {
                docUrl += 'tutorials/zero-to-hero/03-command-based/';
            }

            codeLenses.push(new vscode.CodeLens(range, {
                title: "📖 Open MARSLib Documentation",
                command: "vscode.open",
                arguments: [vscode.Uri.parse(docUrl)]
            }));
        }

        // 2. Warning above periodic() method
        const periodicRegex = /\bpublic\s+void\s+periodic\s*\(/g;
        while ((match = periodicRegex.exec(text)) !== null) {
            const line = document.lineAt(document.positionAt(match.index).line);
            const range = new vscode.Range(line.lineNumber, 0, line.lineNumber, 0);

            codeLenses.push(new vscode.CodeLens(range, {
                title: "⚠️ Zero-Allocation Zone: Avoid object instantiation here!",
                command: "",
                arguments: []
            }));
        }

        return codeLenses;
    }
}
