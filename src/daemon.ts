import * as vscode from 'vscode';
import { exec } from 'child_process';

/**
 * Background daemon that triggers lightweight Gradle tasks when Java source files are saved.
 * 
 * Runs `compileJava` (which includes generateVersionFile as a dependency) instead of
 * calling generateVersionFile directly, since that task chain may require git context
 * that fails when run in isolation.
 * 
 * Uses a cooldown to prevent spamming builds on rapid saves.
 */
export class BuildConstantsDaemon {
    private lastRunTime = 0;
    private readonly COOLDOWN_MS = 15000; // 15s cooldown to prevent build spam
    private isRunning = false;

    constructor(context: vscode.ExtensionContext) {
        const watcher = vscode.workspace.onDidSaveTextDocument((document) => {
            // Only trigger on Java source files in the main source set
            if (document.languageId === 'java' && document.uri.fsPath.includes('src/main/java')) {
                this.triggerBackgroundBuild();
            }
        });
        context.subscriptions.push(watcher);
    }

    private triggerBackgroundBuild() {
        const now = Date.now();
        if (now - this.lastRunTime < this.COOLDOWN_MS || this.isRunning) {
            return;
        }

        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            return;
        }

        const cwd = folders[0].uri.fsPath;
        const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';

        this.lastRunTime = now;
        this.isRunning = true;

        // Run compileJava silently — this triggers generateVersionFile and annotation processing
        // as part of the normal build chain, avoiding isolated task execution issues
        exec(`${gradlew} compileJava --quiet`, { cwd, timeout: 60000 }, (error, _stdout, stderr) => {
            this.isRunning = false;
            if (error) {
                // Only log, don't show notifications — this is a background task
                console.warn(`BuildConstantsDaemon: Background compile failed: ${stderr?.substring(0, 200)}`);
            }
        });
    }
}
