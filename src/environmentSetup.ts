import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const VENDORDEPS = [
    {
        name: 'MARSLib',
        url: 'https://raw.githubusercontent.com/MARSLib/MARSLib/main/MARSLib.json'
    },
    {
        name: 'AdvantageKit',
        url: 'https://raw.githubusercontent.com/LittletonRobotics/AdvantageKit/main/vendordeps/AdvantageKit.json'
    },
    {
        name: 'Phoenix6',
        url: 'https://maven.ctr-electronics.com/release/com/ctre/phoenix6/latest/Phoenix6-frc2025-latest.json'
    },
    {
        name: 'REVLib',
        url: 'https://software-metadata.revrobotics.com/REVLib-2025.json'
    },
    {
        name: 'PathplannerLib',
        url: 'https://3015rangerrobotics.github.io/pathplannerlib/PathplannerLib.json'
    },
    {
        name: 'maple-sim',
        url: 'https://raw.githubusercontent.com/MARSLib/maple-sim/main/vendordeps/maple-sim.json'
    }
];

async function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                // Handle redirects
                downloadFile(res.headers.location!, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to download: ${res.statusCode}`));
                return;
            }
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

export async function setupEnvironment() {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open. Open the MARSLib robot project first.');
        return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const vendordepsDir = path.join(workspaceRoot, 'vendordeps');

    if (!fs.existsSync(vendordepsDir)) {
        fs.mkdirSync(vendordepsDir, { recursive: true });
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Setting up MARSLib Environment",
        cancellable: false
    }, async (progress) => {
        // 1. Download Vendordeps
        let count = 0;
        for (const dep of VENDORDEPS) {
            count++;
            progress.report({ 
                message: `Downloading ${dep.name}...`, 
                increment: Math.floor(60 / VENDORDEPS.length) 
            });
            const dest = path.join(vendordepsDir, `${dep.name}.json`);
            try {
                await downloadFile(dep.url, dest);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to download ${dep.name}: ${err}`);
            }
        }

        // 2. Setup Git Hooks
        progress.report({ message: "Configuring Git hooks...", increment: 10 });
        try {
            const { execSync } = require('child_process');
            // Try to set git hooks if .git directory exists
            if (fs.existsSync(path.join(workspaceRoot, '.git'))) {
                execSync('git config core.hooksPath .githooks', { cwd: workspaceRoot });
            }
        } catch (err) {
            console.error('Failed to set git hooks:', err);
        }

        // 3. Run initialization Gradle tasks
        progress.report({ message: "Initializing project (Gradle)...", increment: 30 });
        const terminalName = 'MARSLib: Setup';
        let terminal = vscode.window.terminals.find(t => t.name === terminalName);
        if (!terminal) {
            terminal = vscode.window.createTerminal({ name: terminalName, cwd: workspaceRoot });
        }
        
        const isWindows = process.platform === 'win32';
        const gradlew = isWindows ? '.\\gradlew.bat' : './gradlew';
        terminal.sendText(`${gradlew} generateVersionFile spotlessApply`);
        terminal.show();
    });

    vscode.window.showInformationMessage('✅ MARSLib Environment Setup Complete!');
}
