import * as vscode from 'vscode';

/**
 * Simulation-aware launcher that provides:
 * - One-click "Sim + Scope" compound command
 * - Sim mode toggle in the status bar
 * - Auto-detection of sim process
 */
export class SimLauncher {
    private simToggle: vscode.StatusBarItem;
    private isSimMode = false;

    constructor() {
        this.simToggle = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
        this.updateToggleAppearance();
        this.simToggle.command = 'marslib.toggleSimMode';
        this.simToggle.show();
    }

    private updateToggleAppearance() {
        if (this.isSimMode) {
            this.simToggle.text = '$(vm-active) Sim Mode';
            this.simToggle.tooltip = 'Click to switch to Deploy mode';
            this.simToggle.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        } else {
            this.simToggle.text = '$(vm-outline) Deploy Mode';
            this.simToggle.tooltip = 'Click to switch to Simulation mode';
            this.simToggle.backgroundColor = undefined;
        }
    }

    toggle(): void {
        this.isSimMode = !this.isSimMode;
        this.updateToggleAppearance();

        const modeLabel = this.isSimMode ? 'Simulation' : 'Deploy';
        vscode.window.showInformationMessage(`MARSLib: Switched to ${modeLabel} mode.`);
    }

    getIsSimMode(): boolean {
        return this.isSimMode;
    }

    /**
     * Launches simulation and opens AdvantageScope simultaneously.
     * Uses separate terminals so both can run in parallel.
     */
    launchSimWithScope(): void {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }

        const cwd = folders[0].uri.fsPath;
        const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';

        // Terminal 1: Simulation
        let simTerminal = vscode.window.terminals.find(t => t.name === 'MARSLib: Simulate');
        if (!simTerminal) {
            simTerminal = vscode.window.createTerminal({ name: 'MARSLib: Simulate', cwd });
        }
        simTerminal.show();
        simTerminal.sendText(`${gradlew} simulateJava`);

        // Terminal 2: AdvantageScope (try to launch it)
        this.launchAdvantageScope();

        // Create output channel for sim logs
        const outputChannel = vscode.window.createOutputChannel('MARSLib Simulation');
        outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] Simulation started.`);
        outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] AdvantageScope launch attempted.`);
        outputChannel.appendLine('---');
        outputChannel.appendLine('Monitor the Simulate terminal for live output.');
    }

    private launchAdvantageScope(): void {
        const { exec } = require('child_process');

        // Try common AdvantageScope install locations
        if (process.platform === 'win32') {
            // Windows: Check common install paths
            const paths = [
                `"${process.env.LOCALAPPDATA}\\Programs\\advantagescope\\AdvantageScope.exe"`,
                `"${process.env.PROGRAMFILES}\\AdvantageScope\\AdvantageScope.exe"`,
                'advantagescope' // If in PATH
            ];

            let launched = false;
            for (const p of paths) {
                exec(`start "" ${p}`, (error: any) => {
                    if (!error && !launched) {
                        launched = true;
                    }
                });
                if (launched) { break; }
            }
        } else if (process.platform === 'darwin') {
            exec('open -a AdvantageScope');
        } else {
            exec('advantagescope');
        }
    }

    dispose(): void {
        this.simToggle.dispose();
    }
}
