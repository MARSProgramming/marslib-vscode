import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

export class MARSStatusBar {
    private connectionStatus: vscode.StatusBarItem;
    private gitSyncStatus: vscode.StatusBarItem;
    private isDisposed: boolean = false;

    constructor() {
        this.connectionStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.gitSyncStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        
        this.connectionStatus.text = "$(circle-outline) Checking RIO...";
        this.connectionStatus.tooltip = "Click to ping RIO manually";
        this.connectionStatus.command = 'marslib.manualPing';
        this.connectionStatus.show();

        this.gitSyncStatus.text = "$(cloud-download) Checking Sync...";
        this.gitSyncStatus.tooltip = "Distance from origin/master";
        this.gitSyncStatus.show();

        this.startPolling();
    }

    private async startPolling() {
        while (!this.isDisposed) {
            await this.updateConnectionStatus();
            await this.updateGitStatus();
            await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10s
        }
    }

    private async updateConnectionStatus() {
        // Try to ping the RIO (standard IP or mDNS)
        const host = 'roborio-2614-frc.local'; // Standard MARS naming
        exec(`ping -n 1 -w 1000 ${host}`, (error) => {
            if (error) {
                this.connectionStatus.text = "$(error) RIO: Disconnected";
                this.connectionStatus.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            } else {
                this.connectionStatus.text = "$(pass-filled) RIO: Connected";
                this.connectionStatus.backgroundColor = undefined;
            }
        });
    }

    private async updateGitStatus() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) return;

        const cwd = folders[0].uri.fsPath;
        // Fetch origin to ensure we have latest data
        exec('git fetch origin', { cwd }, (fetchErr) => {
            if (fetchErr) return;

            // Check how many commits we are behind origin/master
            exec('git rev-list --count HEAD..origin/master', { cwd }, (err, stdout) => {
                if (err) return;
                const count = parseInt(stdout.trim());
                if (count > 0) {
                    this.gitSyncStatus.text = `$(cloud-download) ${count} Behind`;
                    this.gitSyncStatus.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                } else {
                    this.gitSyncStatus.text = "$(cloud-upload) Synced";
                    this.gitSyncStatus.backgroundColor = undefined;
                }
            });
        });
    }

    public dispose() {
        this.isDisposed = true;
        this.connectionStatus.dispose();
        this.gitSyncStatus.dispose();
    }
}
