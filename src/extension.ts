import * as vscode from 'vscode';
import { generateSubsystem } from './subsystemGenerator';
import { runAudit } from './auditRunner';
import { setupEnvironment } from './environmentSetup';
import { ProjectDoctor } from './projectDoctor';
import { MARSCodeLensProvider } from './codeLensProvider';
import { CANIdManager } from './canIdManager';
import { openLatestLog } from './logLauncher';
import { MARSStatusBar } from './statusBar';
import { BuildConstantsDaemon } from './daemon';
import { MARSVirtualDashboard } from './virtualDashboard';
import { generatePhysicsTest } from './testGenerator';
import { MARSCommandBinder } from './commandBinder';

// Helper to run gradlew commands in a VS Code terminal
function runGradlewCommand(command: string, terminalName: string) {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open. Open the MARSLib robot project first.');
        return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    
    // Find or create terminal
    let terminal = vscode.window.terminals.find(t => t.name === terminalName);
    if (!terminal) {
        terminal = vscode.window.createTerminal({ name: terminalName, cwd: workspaceRoot });
    }
    
    terminal.show();
    
    const isWindows = process.platform === 'win32';
    const gradlew = isWindows ? '.\\gradlew.bat' : './gradlew';
    
    terminal.sendText(`${gradlew} ${command}`);
}
class MarslibActionProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        } else {
            return Promise.resolve([
                this.createCommandItem('Build Robot Code', 'marslib.build', 'tools'),
                this.createCommandItem('Deploy Robot Code', 'marslib.deploy', 'rocket'),
                this.createCommandItem('Simulate Robot Code', 'marslib.simulate', 'play'),
                this.createCommandItem('Generate Subsystem (AdvantageKit)', 'marslib.generateSubsystem', 'file-add'),
                this.createCommandItem('Run MARSLib Audit', 'marslib.audit', 'check-all'),
                this.createCommandItem('Setup Development Environment', 'marslib.setupEnvironment', 'settings-gear'),
                this.createCommandItem('Open Latest Log (AdvantageScope)', 'marslib.openLog', 'graph'),
                this.createCommandItem('Open Virtual Dashboard', 'marslib.openDashboard', 'dashboard'),
                this.createCommandItem('Generate Physics Test', 'marslib.generateTest', 'beaker'),
                this.createCommandItem('Open Command Binder', 'marslib.openBinder', 'list-ordered')
            ]);
        }
    }

    private createCommandItem(label: string, commandId: string, icon: string): vscode.TreeItem {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.command = {
            command: commandId,
            title: label,
        };
        item.iconPath = new vscode.ThemeIcon(icon);
        return item;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('MARSLib VS Code extension is now active!');

    const actionProvider = new MarslibActionProvider();
    vscode.window.registerTreeDataProvider('marslib-actions', actionProvider);

    const buildDisposable = vscode.commands.registerCommand('marslib.build', () => {
        runGradlewCommand('build', 'MARSLib: Build');
    });

    const deployDisposable = vscode.commands.registerCommand('marslib.deploy', () => {
        runGradlewCommand('deploy', 'MARSLib: Deploy');
    });

    const simulateDisposable = vscode.commands.registerCommand('marslib.simulate', () => {
        runGradlewCommand('simulateJava', 'MARSLib: Simulate');
    });

    const generateSubsystemDisposable = vscode.commands.registerCommand('marslib.generateSubsystem', async () => {
        await generateSubsystem();
    });

    const auditDisposable = vscode.commands.registerCommand('marslib.audit', () => {
        runAudit();
    });

    const setupEnvironmentDisposable = vscode.commands.registerCommand('marslib.setupEnvironment', async () => {
        await setupEnvironment();
    });

    const openLogDisposable = vscode.commands.registerCommand('marslib.openLog', async () => {
        await openLatestLog();
    });

    // Initialize Project Doctor (Real-time Linter)
    const projectDoctor = new ProjectDoctor();
    projectDoctor.subscribeToEvents(context);

    // Initialize Code Lens Provider
    const codeLensProvider = new MARSCodeLensProvider();
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'java' }, codeLensProvider));

    // Initialize CAN ID Manager
    const canIdManager = new CANIdManager();
    vscode.window.registerTreeDataProvider('marslib-canids', canIdManager);
    const refreshCANIdsDisposable = vscode.commands.registerCommand('marslib.refreshCANIds', () => {
        canIdManager.refresh();
    });

    // Initialize Power User Suite
    const statusBar = new MARSStatusBar();
    context.subscriptions.push(statusBar);
    
    const daemon = new BuildConstantsDaemon(context);

    const openDashboardDisposable = vscode.commands.registerCommand('marslib.openDashboard', () => {
        MARSVirtualDashboard.createOrShow(context.extensionUri);
    });

    const generateTestDisposable = vscode.commands.registerCommand('marslib.generateTest', async () => {
        await generatePhysicsTest();
    });

    const openBinderDisposable = vscode.commands.registerCommand('marslib.openBinder', () => {
        MARSCommandBinder.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(
        buildDisposable,
        deployDisposable,
        simulateDisposable,
        generateSubsystemDisposable,
        auditDisposable,
        setupEnvironmentDisposable,
        openLogDisposable,
        refreshCANIdsDisposable,
        openDashboardDisposable,
        generateTestDisposable,
        openBinderDisposable
    );
}

export function deactivate() {}
