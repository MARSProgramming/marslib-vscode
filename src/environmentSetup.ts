import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

/**
 * Complete list of MARSLib vendordeps with their canonical download URLs.
 * URLs are sourced from each vendordep's `jsonUrl` field.
 */
const VENDORDEPS = [
    {
        name: 'AdvantageKit',
        url: 'https://github.com/Mechanical-Advantage/AdvantageKit/releases/latest/download/AdvantageKit.json'
    },
    {
        name: 'Phoenix6',
        url: 'https://maven.ctr-electronics.com/release/com/ctre/phoenix6/latest/Phoenix6-frc2026-latest.json'
    },
    {
        name: 'REVLib',
        url: 'https://software-metadata.revrobotics.com/REVLib-2026.json'
    },
    {
        name: 'PathplannerLib',
        url: 'https://3015rangerrobotics.github.io/pathplannerlib/PathplannerLib.json'
    },
    {
        name: 'PhotonLib',
        url: 'https://maven.photonvision.org/repository/internal/org/photonvision/photonlib-json/1.0/photonlib-json-1.0.json'
    },
    {
        name: 'LimelightLib',
        url: 'https://limelightvision.github.io/limelightlib-wpijava/LimelightLib.json'
    },
    {
        name: 'maple-sim',
        url: 'https://shenzhen-robotics-alliance.github.io/maple-sim/vendordep/maple-sim.json'
    },
    {
        name: 'QuestNav',
        url: 'https://questnav.gg/QuestNav.json'
    }
];

/**
 * WPILibNewCommands has no remote jsonUrl — it ships with GradleRIO.
 * We embed its content directly so the setup is always complete.
 */
const WPILIB_NEW_COMMANDS = {
    fileName: 'WPILibNewCommands.json',
    name: 'WPILib-New-Commands',
    version: '1.0.0',
    uuid: '111e20f7-815e-48f8-9dd6-e675ce75b266',
    frcYear: '2026',
    mavenUrls: [],
    jsonUrl: '',
    javaDependencies: [
        {
            groupId: 'edu.wpi.first.wpilibNewCommands',
            artifactId: 'wpilibNewCommands-java',
            version: 'wpilib'
        }
    ],
    jniDependencies: [],
    cppDependencies: [
        {
            groupId: 'edu.wpi.first.wpilibNewCommands',
            artifactId: 'wpilibNewCommands-cpp',
            version: 'wpilib',
            libName: 'wpilibNewCommands',
            headerClassifier: 'headers',
            sourcesClassifier: 'sources',
            sharedLibrary: true,
            skipInvalidPlatforms: true,
            binaryPlatforms: [
                'linuxathena', 'linuxarm32', 'linuxarm64',
                'windowsx86-64', 'windowsx86', 'linuxx86-64', 'osxuniversal'
            ]
        }
    ]
};

const MAX_REDIRECTS = 5;

/**
 * Downloads a file via HTTPS with proper redirect following.
 * Handles GitHub's redirect chains (raw.githubusercontent.com → CDN).
 */
async function downloadFile(url: string, dest: string, redirectCount: number = 0): Promise<void> {
    if (redirectCount > MAX_REDIRECTS) {
        throw new Error(`Too many redirects (>${MAX_REDIRECTS}) for ${url}`);
    }

    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            // Follow redirects (301, 302, 303, 307, 308)
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let redirectUrl = res.headers.location;
                // Handle relative redirects
                if (redirectUrl.startsWith('/')) {
                    const parsed = new URL(url);
                    redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
                }
                downloadFile(redirectUrl, dest, redirectCount + 1).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
                return;
            }

            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => {
                file.close();

                // Validate the downloaded file is valid JSON
                try {
                    const content = fs.readFileSync(dest, 'utf8');
                    JSON.parse(content);
                    resolve();
                } catch {
                    fs.unlinkSync(dest);
                    reject(new Error(`Downloaded file is not valid JSON: ${path.basename(dest)}`));
                }
            });
            file.on('error', (err) => {
                fs.unlinkSync(dest);
                reject(err);
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

    // Verify this looks like an FRC project
    const buildGradle = path.join(workspaceRoot, 'build.gradle');
    if (!fs.existsSync(buildGradle)) {
        const proceed = await vscode.window.showWarningMessage(
            'No build.gradle found. This may not be an FRC project. Continue anyway?',
            'Continue', 'Cancel'
        );
        if (proceed !== 'Continue') {
            return;
        }
    }

    const vendordepsDir = path.join(workspaceRoot, 'vendordeps');
    if (!fs.existsSync(vendordepsDir)) {
        fs.mkdirSync(vendordepsDir, { recursive: true });
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Setting up MARSLib Environment",
        cancellable: true
    }, async (progress, token) => {
        const results: { name: string; success: boolean; error?: string }[] = [];

        // 1. Download remote vendordeps
        for (let i = 0; i < VENDORDEPS.length; i++) {
            if (token.isCancellationRequested) {
                return;
            }

            const dep = VENDORDEPS[i];
            progress.report({
                message: `Downloading ${dep.name} (${i + 1}/${VENDORDEPS.length + 1})...`,
                increment: Math.floor(60 / (VENDORDEPS.length + 1))
            });

            const dest = path.join(vendordepsDir, `${dep.name}.json`);
            try {
                await downloadFile(dep.url, dest);
                results.push({ name: dep.name, success: true });
            } catch (err: any) {
                results.push({ name: dep.name, success: false, error: err.message });
            }
        }

        // 2. Write WPILibNewCommands (no download needed — bundled with WPILib)
        progress.report({ message: 'Writing WPILibNewCommands...', increment: Math.floor(60 / (VENDORDEPS.length + 1)) });
        try {
            const dest = path.join(vendordepsDir, 'WPILibNewCommands.json');
            fs.writeFileSync(dest, JSON.stringify(WPILIB_NEW_COMMANDS, null, 2) + '\n', 'utf8');
            results.push({ name: 'WPILibNewCommands', success: true });
        } catch (err: any) {
            results.push({ name: 'WPILibNewCommands', success: false, error: err.message });
        }

        // 3. Install git hooks
        progress.report({ message: 'Configuring Git hooks...', increment: 10 });
        try {
            const gitDir = path.join(workspaceRoot, '.git');
            if (fs.existsSync(gitDir)) {
                const { execSync } = require('child_process');
                // Use the project's installGitHooks gradle task if available, otherwise set hooks path
                const hooksDir = path.join(gitDir, 'hooks');
                if (!fs.existsSync(hooksDir)) {
                    fs.mkdirSync(hooksDir, { recursive: true });
                }

                // Write pre-commit hook that runs spotless + tests
                const hookFile = path.join(hooksDir, 'pre-commit');
                const hookContent = `#!/bin/sh
echo "Running spotlessApply and tests on staged files before commit..."

# Get list of staged files
staged_files=$(git diff --cached --name-only --diff-filter=ACM | grep '\\.java$')

# If no java files are staged, just exit and allow commit
if [ -z "$staged_files" ]; then
    exit 0
fi

# Apply spotless and run tests
./gradlew spotlessApply test
if [ $? -ne 0 ]; then
  echo "Tests or formatting failed. Please fix before committing."
  exit 1
fi

# Re-stage only the files that were originally staged, in case spotless modified them
for file in $staged_files; do
    if [ -f "$file" ]; then
        git add "$file"
    fi
done
`;
                fs.writeFileSync(hookFile, hookContent, 'utf8');
                // Make executable on non-Windows
                if (process.platform !== 'win32') {
                    execSync(`chmod +x "${hookFile}"`);
                }
            }
        } catch (err) {
            console.error('Failed to set git hooks:', err);
        }

        // 4. Run initial Gradle sync (build only — avoid generateVersionFile which depends on eventDeploy)
        progress.report({ message: 'Running Gradle sync...', increment: 20 });
        const terminalName = 'MARSLib: Setup';
        let terminal = vscode.window.terminals.find(t => t.name === terminalName);
        if (!terminal) {
            terminal = vscode.window.createTerminal({ name: terminalName, cwd: workspaceRoot });
        }

        const isWindows = process.platform === 'win32';
        const gradlew = isWindows ? '.\\gradlew.bat' : './gradlew';
        terminal.sendText(`${gradlew} build`);
        terminal.show();

        // Report results
        const failed = results.filter(r => !r.success);
        const succeeded = results.filter(r => r.success);

        if (failed.length > 0) {
            const failedNames = failed.map(f => `${f.name}: ${f.error}`).join('\n');
            vscode.window.showWarningMessage(
                `Setup partially complete. ${succeeded.length}/${results.length} vendordeps installed. Failed: ${failed.map(f => f.name).join(', ')}`,
                'Show Details'
            ).then(selection => {
                if (selection === 'Show Details') {
                    const channel = vscode.window.createOutputChannel('MARSLib Setup');
                    channel.appendLine('=== MARSLib Environment Setup Results ===\n');
                    channel.appendLine(`✅ Succeeded (${succeeded.length}):`);
                    succeeded.forEach(s => channel.appendLine(`  • ${s.name}`));
                    channel.appendLine(`\n❌ Failed (${failed.length}):`);
                    failed.forEach(f => channel.appendLine(`  • ${f.name}: ${f.error}`));
                    channel.show();
                }
            });
        }
    });

    vscode.window.showInformationMessage('✅ MARSLib Environment Setup Complete!');
}
