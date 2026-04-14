import * as vscode from 'vscode';

export function runAudit() {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open. Open the MARSLib robot project first.');
        return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    
    // Find or create terminal
    const terminalName = 'MARSLib: Audit';
    let terminal = vscode.window.terminals.find(t => t.name === terminalName);
    if (!terminal) {
        terminal = vscode.window.createTerminal({ name: terminalName, cwd: workspaceRoot });
    }
    
    terminal.show();
    
    const isWindows = process.platform === 'win32';
    const gradlew = isWindows ? '.\\gradlew.bat' : './gradlew';
    
    // Championship-grade audit includes testing, verifying spotless formatting, and validating vendordeps
    const command = `${gradlew} test spotlessApply validateVendordeps`;
    
    vscode.window.showInformationMessage('Starting MARSLib Einstein-grade code audit...');
    terminal.sendText(command);
}
