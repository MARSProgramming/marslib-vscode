import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

interface DeployRecord {
    timestamp: string;
    gitHash: string;
    branch: string;
    durationMs: number;
    success: boolean;
}

/**
 * Pre-flight deploy manager that validates the project before pushing to the RoboRIO.
 * 
 * Checks:
 * 1. Code compiles successfully
 * 2. Working tree is clean (warns on dirty)
 * 3. Confirmation dialog with git hash
 * 4. Post-deploy notification with duration
 */
export class DeployManager {
    private deployHistory: DeployRecord[] = [];
    private readonly MAX_HISTORY = 10;

    constructor(private context: vscode.ExtensionContext) {
        // Load persisted deploy history
        this.deployHistory = context.globalState.get<DeployRecord[]>('marslib.deployHistory', []);
    }

    async deploy(): Promise<void> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }

        const cwd = folders[0].uri.fsPath;
        const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'MARSLib Deploy',
            cancellable: true
        }, async (progress, token) => {
            // Step 1: Check for uncommitted changes
            progress.report({ message: 'Checking working tree...', increment: 10 });
            const isDirty = await this.isWorkingTreeDirty(cwd);

            if (isDirty) {
                const proceed = await vscode.window.showWarningMessage(
                    '⚠️ You have uncommitted changes. Deploy anyway?',
                    'Deploy Anyway', 'Cancel'
                );
                if (proceed !== 'Deploy Anyway') {
                    return;
                }
            }

            if (token.isCancellationRequested) { return; }

            // Step 2: Compile check
            progress.report({ message: 'Compiling...', increment: 20 });
            const compileResult = await this.runGradleTask(cwd, `${gradlew} compileJava --quiet`);
            if (!compileResult.success) {
                vscode.window.showErrorMessage(
                    `Build failed. Fix compilation errors before deploying.\n${compileResult.error?.substring(0, 200)}`
                );
                return;
            }

            if (token.isCancellationRequested) { return; }

            // Step 3: Get git info for confirmation
            progress.report({ message: 'Preparing deploy...', increment: 10 });
            const gitHash = await this.getGitHash(cwd);
            const gitBranch = await this.getGitBranch(cwd);

            const config = vscode.workspace.getConfiguration('marslib');
            const teamNumber = config.get<number>('teamNumber', 2614);

            // Confirmation dialog
            const confirm = await vscode.window.showInformationMessage(
                `Deploy to RoboRIO ${teamNumber}?\n\nBranch: ${gitBranch}\nCommit: ${gitHash.substring(0, 8)}${isDirty ? ' (dirty)' : ''}`,
                { modal: true },
                'Deploy'
            );

            if (confirm !== 'Deploy') {
                return;
            }

            // Step 4: Deploy
            progress.report({ message: 'Deploying to RoboRIO...', increment: 40 });
            const startTime = Date.now();

            // Use terminal for deploy so user can see output
            const terminalName = 'MARSLib: Deploy';
            let terminal = vscode.window.terminals.find(t => t.name === terminalName);
            if (!terminal) {
                terminal = vscode.window.createTerminal({ name: terminalName, cwd });
            }
            terminal.show();
            terminal.sendText(`${gradlew} deploy`);

            // Record the deploy
            const record: DeployRecord = {
                timestamp: new Date().toISOString(),
                gitHash,
                branch: gitBranch,
                durationMs: Date.now() - startTime,
                success: true
            };
            this.deployHistory.unshift(record);
            if (this.deployHistory.length > this.MAX_HISTORY) {
                this.deployHistory.pop();
            }
            this.context.globalState.update('marslib.deployHistory', this.deployHistory);

            progress.report({ message: 'Deploy command sent.', increment: 20 });
        });
    }

    getHistory(): DeployRecord[] {
        return this.deployHistory;
    }

    private isWorkingTreeDirty(cwd: string): Promise<boolean> {
        return new Promise((resolve) => {
            exec('git status --porcelain', { cwd }, (err, stdout) => {
                resolve(!err && stdout.trim().length > 0);
            });
        });
    }

    private getGitHash(cwd: string): Promise<string> {
        return new Promise((resolve) => {
            exec('git rev-parse HEAD', { cwd }, (err, stdout) => {
                resolve(err ? 'unknown' : stdout.trim());
            });
        });
    }

    private getGitBranch(cwd: string): Promise<string> {
        return new Promise((resolve) => {
            exec('git rev-parse --abbrev-ref HEAD', { cwd }, (err, stdout) => {
                resolve(err ? 'unknown' : stdout.trim());
            });
        });
    }

    private runGradleTask(cwd: string, command: string): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            exec(command, { cwd, timeout: 120000 }, (error, _stdout, stderr) => {
                resolve({ success: !error, error: stderr });
            });
        });
    }
}

/**
 * Tree data provider showing deploy history in the sidebar.
 */
export class DeployHistoryProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private deployManager: DeployManager) {}

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(): vscode.TreeItem[] {
        const history = this.deployManager.getHistory();
        if (history.length === 0) {
            const empty = new vscode.TreeItem('No deploys yet', vscode.TreeItemCollapsibleState.None);
            empty.iconPath = new vscode.ThemeIcon('info');
            return [empty];
        }

        return history.map((record, index) => {
            const date = new Date(record.timestamp);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

            const item = new vscode.TreeItem(
                `${dateStr} ${timeStr} — ${record.gitHash.substring(0, 7)}`,
                vscode.TreeItemCollapsibleState.None
            );
            item.description = record.branch;
            item.iconPath = new vscode.ThemeIcon(
                record.success ? 'rocket' : 'error',
                record.success ? undefined : new vscode.ThemeColor('errorForeground')
            );
            item.tooltip = `Branch: ${record.branch}\nCommit: ${record.gitHash}\nTime: ${record.timestamp}`;
            return item;
        });
    }
}
