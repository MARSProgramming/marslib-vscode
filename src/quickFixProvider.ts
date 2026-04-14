import * as vscode from 'vscode';

/**
 * Provides one-click auto-fixes for every MARSLib ProjectDoctor diagnostic.
 * 
 * Registered as a CodeActionProvider for Java, it watches for diagnostics
 * with `marslib-doctor` source and offers targeted WorkspaceEdit fixes.
 */
export class MARSQuickFixProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== 'marslib-doctor') {
                continue;
            }

            switch (diagnostic.code) {
                case 'MARSLIB_BLOCKING_CALL':
                    actions.push(this.createReplaceAction(
                        document, diagnostic,
                        'Replace with Timer.delay()',
                        'Thread.sleep',
                        'Timer.delay'
                    ));
                    actions.push(this.createInsertImportAction(
                        document, diagnostic,
                        'Add Timer import',
                        'import edu.wpi.first.wpilibj.Timer;'
                    ));
                    break;

                case 'MARSLIB_HUNGARIAN_BANNED': {
                    const text = document.getText(diagnostic.range);
                    const prefix = text.match(/^(m_|f_|s_)/);
                    if (prefix) {
                        const stripped = text.slice(prefix[0].length);
                        const action = new vscode.CodeAction(
                            `Remove '${prefix[0]}' prefix → '${stripped}'`,
                            vscode.CodeActionKind.QuickFix
                        );
                        action.diagnostics = [diagnostic];
                        action.isPreferred = true;
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(document.uri, diagnostic.range, stripped);
                        action.edit = edit;
                        actions.push(action);
                    }
                    break;
                }

                case 'MARSLIB_AMBIGUOUS_NAME': {
                    const action = new vscode.CodeAction(
                        'Rename symbol (F2)',
                        vscode.CodeActionKind.QuickFix
                    );
                    action.diagnostics = [diagnostic];
                    action.command = {
                        command: 'editor.action.rename',
                        title: 'Rename Symbol'
                    };
                    actions.push(action);
                    break;
                }

                case 'MARSLIB_MISSING_AUTOLOG': {
                    const action = new vscode.CodeAction(
                        'Add @AutoLog annotation',
                        vscode.CodeActionKind.QuickFix
                    );
                    action.diagnostics = [diagnostic];
                    action.isPreferred = true;

                    // Find the class line containing 'Inputs' and insert @AutoLog above it
                    const edit = new vscode.WorkspaceEdit();
                    const text = document.getText();
                    const classMatch = text.match(/(\s*)(public\s+)?(?:static\s+)?class\s+\w*Inputs/);
                    if (classMatch) {
                        const pos = document.positionAt(text.indexOf(classMatch[0]));
                        const indent = classMatch[1] || '    ';
                        edit.insert(document.uri, pos, `${indent}@AutoLog\n`);
                    }
                    action.edit = edit;
                    actions.push(action);
                    break;
                }

                case 'MARSLIB_SYSOUT': {
                    const action = new vscode.CodeAction(
                        'Replace with Logger.recordOutput()',
                        vscode.CodeActionKind.QuickFix
                    );
                    action.diagnostics = [diagnostic];
                    action.isPreferred = true;
                    const edit = new vscode.WorkspaceEdit();

                    // Extract the line text to get the println argument
                    const lineText = document.lineAt(diagnostic.range.start.line).text;
                    const printMatch = lineText.match(/System\.out\.println\s*\(\s*(.+)\s*\)\s*;/);
                    if (printMatch) {
                        const arg = printMatch[1].trim();
                        const indent = lineText.match(/^(\s*)/)?.[1] || '';
                        edit.replace(
                            document.uri,
                            document.lineAt(diagnostic.range.start.line).range,
                            `${indent}Logger.recordOutput("Debug", ${arg});`
                        );
                    }
                    action.edit = edit;
                    actions.push(action);
                    break;
                }

                case 'MARSLIB_ALLOCATION_IN_LOOP': {
                    const action = new vscode.CodeAction(
                        'Extract to class field (manual refactor needed)',
                        vscode.CodeActionKind.QuickFix
                    );
                    action.diagnostics = [diagnostic];
                    action.command = {
                        command: 'editor.action.refactor',
                        title: 'Refactor'
                    };
                    actions.push(action);
                    break;
                }

                case 'MARSLIB_INFINITE_LOOP': {
                    const action = new vscode.CodeAction(
                        'Replace with Command-based scheduling',
                        vscode.CodeActionKind.QuickFix
                    );
                    action.diagnostics = [diagnostic];
                    // Open the docs page for command-based programming
                    action.command = {
                        command: 'vscode.open',
                        title: 'Open Docs',
                        arguments: [vscode.Uri.parse('https://MARSProgramming.github.io/MARSLib/tutorials/zero-to-hero/03-command-based/')]
                    };
                    actions.push(action);
                    break;
                }
            }
        }

        return actions;
    }

    private createReplaceAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        title: string,
        search: string,
        replacement: string
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        const edit = new vscode.WorkspaceEdit();
        const lineText = document.lineAt(diagnostic.range.start.line).text;
        const newText = lineText.replace(search, replacement);
        edit.replace(document.uri, document.lineAt(diagnostic.range.start.line).range, newText);
        action.edit = edit;
        return action;
    }

    private createInsertImportAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        title: string,
        importStatement: string
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        const edit = new vscode.WorkspaceEdit();

        // Find the last import line and insert after it
        const text = document.getText();
        const lines = text.split('\n');
        let lastImportLine = 0;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('import ')) {
                lastImportLine = i;
            }
        }

        // Don't add if already imported
        if (!text.includes(importStatement)) {
            const position = new vscode.Position(lastImportLine + 1, 0);
            edit.insert(document.uri, position, importStatement + '\n');
        }

        action.edit = edit;
        return action;
    }
}
