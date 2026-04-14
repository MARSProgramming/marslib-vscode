import * as vscode from 'vscode';
import { exec } from 'child_process';

/**
 * Status bar widget showing RoboRIO connection status and Git sync state.
 * 
 * Polls every 10 seconds to check:
 * - RIO connectivity via ping (address derived from configured team number)
 * - Git ahead/behind count vs. the remote's default branch
 */
export class MARSStatusBar {
    private connectionStatus: vscode.StatusBarItem;
    private gitSyncStatus: vscode.StatusBarItem;
    private isDisposed: boolean = false;

    constructor() {
        this.connectionStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.gitSyncStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        
        this.connectionStatus.text = "$(circle-outline) Checking RIO...";
        this.connectionStatus.tooltip = "RoboRIO connection status";
        this.connectionStatus.show();

        this.gitSyncStatus.text = "$(cloud-download) Checking Sync...";
        this.gitSyncStatus.tooltip = "Git sync status with remote";
        this.gitSyncStatus.show();

        this.startPolling();
    }

    /**
     * Derives the roboRIO mDNS hostname from the team number.
     * Standard format: roborio-XXXX-frc.local
     */
    private getRioAddress(): string {
        const config = vscode.workspace.getConfiguration('marslib');
        const override = config.get<string>('rioAddress', '');
        if (override && override.length > 0) {
            return override;
        }
        const teamNumber = config.get<number>('teamNumber', 2614);
        return `roborio-${teamNumber}-frc.local`;
    }

    private async startPolling() {
        while (!this.isDisposed) {
            await this.updateConnectionStatus();
            await this.updateGitStatus();
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }

    private async updateConnectionStatus() {
        const host = this.getRioAddress();
        const pingCmd = process.platform === 'win32'
            ? `ping -n 1 -w 1000 ${host}`
            : `ping -c 1 -W 1 ${host}`;

        exec(pingCmd, (error) => {
            if (this.isDisposed) {
                return;
            }
            if (error) {
                this.connectionStatus.text = "$(error) RIO: Disconnected";
                this.connectionStatus.tooltip = `Cannot reach ${host}`;
                this.connectionStatus.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            } else {
                this.connectionStatus.text = "$(pass-filled) RIO: Connected";
                this.connectionStatus.tooltip = `Connected to ${host}`;
                this.connectionStatus.backgroundColor = undefined;
            }
        });
    }

    private async updateGitStatus() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            return;
        }

        const cwd = folders[0].uri.fsPath;

        // Detect the default remote branch instead of hardcoding origin/master
        exec('git remote show origin', { cwd, timeout: 10000 }, (fetchErr, stdout) => {
            if (fetchErr || this.isDisposed) {
                return;
            }

            // Parse "HEAD branch: main" from the output
            const branchMatch = stdout.match(/HEAD branch:\s*(.+)/);
            const defaultBranch = branchMatch ? branchMatch[1].trim() : 'main';
            const remoteBranch = `origin/${defaultBranch}`;

            // Check how many commits we are behind
            exec(`git rev-list --count HEAD..${remoteBranch}`, { cwd }, (err, behindOut) => {
                if (err || this.isDisposed) {
                    return;
                }

                const behind = parseInt(behindOut.trim()) || 0;

                // Also check ahead count
                exec(`git rev-list --count ${remoteBranch}..HEAD`, { cwd }, (err2, aheadOut) => {
                    if (err2 || this.isDisposed) {
                        return;
                    }

                    const ahead = parseInt(aheadOut.trim()) || 0;

                    if (behind > 0 && ahead > 0) {
                        this.gitSyncStatus.text = `$(git-compare) ${ahead}↑ ${behind}↓`;
                        this.gitSyncStatus.tooltip = `${ahead} ahead, ${behind} behind ${remoteBranch}`;
                        this.gitSyncStatus.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                    } else if (behind > 0) {
                        this.gitSyncStatus.text = `$(cloud-download) ${behind} Behind`;
                        this.gitSyncStatus.tooltip = `${behind} commits behind ${remoteBranch}`;
                        this.gitSyncStatus.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                    } else if (ahead > 0) {
                        this.gitSyncStatus.text = `$(cloud-upload) ${ahead} Ahead`;
                        this.gitSyncStatus.tooltip = `${ahead} commits ahead of ${remoteBranch} — push when ready`;
                        this.gitSyncStatus.backgroundColor = undefined;
                    } else {
                        this.gitSyncStatus.text = "$(check) Synced";
                        this.gitSyncStatus.tooltip = `Up to date with ${remoteBranch}`;
                        this.gitSyncStatus.backgroundColor = undefined;
                    }
                });
            });
        });
    }

    public dispose() {
        this.isDisposed = true;
        this.connectionStatus.dispose();
        this.gitSyncStatus.dispose();
    }
}
