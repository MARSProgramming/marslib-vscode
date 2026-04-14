import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

/**
 * Finds the most recently modified log file in the workspace and opens it.
 */
export async function openLatestLog() {
    if (!vscode.workspace.workspaceFolders) {
        return;
    }

    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const logFolders = [root, path.join(root, 'logs'), path.join(root, 'deploy')];
    
    let latestFile: string | null = null;
    let latestMtime = 0;

    for (const folder of logFolders) {
        if (!fs.existsSync(folder)) continue;
        
        const files = fs.readdirSync(folder);
        for (const file of files) {
            if (file.endsWith('.wpilog') || file.endsWith('.rlog')) {
                const fullPath = path.join(folder, file);
                const stats = fs.statSync(fullPath);
                if (stats.mtimeMs > latestMtime) {
                    latestMtime = stats.mtimeMs;
                    latestFile = fullPath;
                }
            }
        }
    }

    if (!latestFile) {
        vscode.window.showWarningMessage('No .wpilog or .rlog files found in the workspace.');
        return;
    }

    const uri = vscode.Uri.file(latestFile);
    vscode.window.showInformationMessage(`Opening latest log: ${path.basename(latestFile)}`);

    // Attempt to open with AdvantageScope if possible, otherwise reveal in explorer
    // We try to run 'advantagescope' command first
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? `start "" "${latestFile}"` : `open "${latestFile}"`;

    // We can also try to specifically target AdvantageScope if the user has it registered as the default handler
    // for .wpilog files, which is common.
    exec(cmd, (error) => {
        if (error) {
            // Default to revealing in explorer if open fails
            vscode.commands.executeCommand('revealFileInOS', uri);
        }
    });
}
