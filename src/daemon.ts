import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

export class BuildConstantsDaemon {
    private lastRunTime: number = 0;
    private readonly COOLDOWN_MS = 5000; // Prevent spamming builds

    constructor(context: vscode.ExtensionContext) {
        const watcher = vscode.workspace.onDidSaveTextDocument((document) => {
            if (document.languageId === 'java' && document.uri.fsPath.includes('src/main/java')) {
                this.triggerGenerate();
            }
        });
        context.subscriptions.push(watcher);
    }

    private triggerGenerate() {
        const now = Date.now();
        if (now - this.lastRunTime < this.COOLDOWN_MS) return;

        const folders = vscode.workspace.workspaceFolders;
        if (!folders) return;

        const cwd = folders[0].uri.fsPath;
        const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

        this.lastRunTime = now;

        // Run silently in background
        exec(`${gradlew} generateVersionFile`, { cwd }, (error, stdout, stderr) => {
            if (error) {
                console.error(`BuildConstantsDaemon error: ${stderr}`);
            } else {
                console.log('BuildConstantsDaemon: Standardized versioning updated.');
            }
        });
    }
}
