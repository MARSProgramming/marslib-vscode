import * as vscode from 'vscode';
import { generateSubsystem } from './subsystemGenerator';
import { runAudit } from './auditRunner';
import { setupEnvironment } from './environmentSetup';
import { ProjectDoctor } from './projectDoctor';
import { MARSQuickFixProvider } from './quickFixProvider';
import { MARSCodeLensProvider } from './codeLensProvider';
import { CANIdManager } from './canIdManager';
import { openLatestLog } from './logLauncher';
import { MARSStatusBar } from './statusBar';
import { BuildConstantsDaemon } from './daemon';
import { generatePhysicsTest } from './testGenerator';
import { DeployManager, DeployHistoryProvider } from './deployManager';
import { PathPlannerProvider } from './pathplannerProvider';
import { SimLauncher } from './simLauncher';

// Lazy-loaded modules (heavy dependencies bundled via esbuild)
type LazyVirtualDashboard = typeof import('./virtualDashboard');
type LazyCommandBinder = typeof import('./commandBinder');
type LazyCANBusVisualizer = typeof import('./canBusVisualizer');

// Helper to run gradlew commands in a VS Code terminal
function runGradlewCommand(command: string, terminalName: string) {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open. Open the MARSLib robot project first.');
        return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    
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
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private simLauncher: SimLauncher) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        const items = [
            this.createCommandItem('Build Robot Code', 'marslib.build', 'tools'),
            this.createCommandItem('Deploy Robot Code', 'marslib.deploy', 'rocket'),
            this.createCommandItem('Simulate Robot Code', 'marslib.simulate', 'play'),
            this.createCommandItem('Sim + AdvantageScope', 'marslib.simWithScope', 'play-circle'),
            this.createCommandItem('Generate Subsystem (Wizard)', 'marslib.generateSubsystem', 'file-add'),
            this.createCommandItem('Generate Physics Test', 'marslib.generateTest', 'beaker'),
            this.createCommandItem('Run MARSLib Audit', 'marslib.audit', 'check-all'),
            this.createCommandItem('Setup Development Environment', 'marslib.setupEnvironment', 'settings-gear'),
            this.createCommandItem('Open Latest Log (AdvantageScope)', 'marslib.openLog', 'graph'),
            this.createCommandItem('Open Virtual Dashboard', 'marslib.openDashboard', 'dashboard'),
            this.createCommandItem('Open CAN Bus Map', 'marslib.openCANMap', 'circuit-board'),
            this.createCommandItem('Open Command Binder', 'marslib.openBinder', 'list-ordered'),
        ];

        return Promise.resolve(items.filter(Boolean) as vscode.TreeItem[]);
    }

    private createCommandItem(label: string, commandId: string, icon: string): vscode.TreeItem {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.command = { command: commandId, title: label };
        item.iconPath = new vscode.ThemeIcon(icon);
        return item;
    }
}

export function activate(context: vscode.ExtensionContext) {
    try {
        console.log('MARSLib VS Code extension v2.0.0 activating...');

        // ─── Core Modules ────────────────────────────────────────────
        const simLauncher = new SimLauncher();
        context.subscriptions.push({ dispose: () => simLauncher.dispose() });

        const deployManager = new DeployManager(context);

        // ─── Sidebar: Commands ───────────────────────────────────────
        const actionProvider = new MarslibActionProvider(simLauncher);
        context.subscriptions.push(
            vscode.window.createTreeView('marslib-actions', { treeDataProvider: actionProvider })
        );

        // ─── Sidebar: CAN IDs ────────────────────────────────────────
        let refreshCANIdsDisposable: vscode.Disposable | undefined;
        try {
            const canIdManager = new CANIdManager();
            context.subscriptions.push(
                vscode.window.createTreeView('marslib-canids', { treeDataProvider: canIdManager })
            );
            refreshCANIdsDisposable = vscode.commands.registerCommand('marslib.refreshCANIds', () => canIdManager.refresh());
        } catch (e) {
            console.error('Failed to initialize CAN ID Manager', e);
        }

        // ─── Sidebar: PathPlanner ────────────────────────────────────
        try {
            const ppProvider = new PathPlannerProvider();
            context.subscriptions.push(
                vscode.window.createTreeView('marslib-pathplanner', { treeDataProvider: ppProvider })
            );
            context.subscriptions.push(
                vscode.commands.registerCommand('marslib.refreshPaths', () => ppProvider.refresh())
            );
        } catch (e) {
            console.error('Failed to initialize PathPlanner Provider', e);
        }

        // ─── Sidebar: Deploy History ─────────────────────────────────
        try {
            const deployHistoryProvider = new DeployHistoryProvider(deployManager);
            context.subscriptions.push(
                vscode.window.createTreeView('marslib-deploy-history', { treeDataProvider: deployHistoryProvider })
            );
            context.subscriptions.push(
                vscode.commands.registerCommand('marslib.refreshDeployHistory', () => deployHistoryProvider.refresh())
            );
        } catch (e) {
            console.error('Failed to initialize Deploy History Provider', e);
        }

        // ─── Project Doctor (Real-time Linter) ───────────────────────
        try {
            const projectDoctor = new ProjectDoctor();
            projectDoctor.subscribeToEvents(context);
        } catch (e) {
            console.error('Failed to initialize Project Doctor', e);
        }

        // ─── Quick Fix Provider ──────────────────────────────────────
        try {
            context.subscriptions.push(
                vscode.languages.registerCodeActionsProvider(
                    { language: 'java' },
                    new MARSQuickFixProvider(),
                    { providedCodeActionKinds: MARSQuickFixProvider.providedCodeActionKinds }
                )
            );
        } catch (e) {
            console.error('Failed to initialize Quick Fix Provider', e);
        }

        // ─── Code Lens Provider ──────────────────────────────────────
        try {
            context.subscriptions.push(
                vscode.languages.registerCodeLensProvider({ language: 'java' }, new MARSCodeLensProvider())
            );
        } catch (e) {
            console.error('Failed to initialize Code Lens Provider', e);
        }

        // ─── Status Bar ─────────────────────────────────────────────
        try {
            context.subscriptions.push(new MARSStatusBar());
        } catch (e) {
            console.error('Failed to initialize Status Bar', e);
        }

        // ─── Background Daemon ───────────────────────────────────────
        try {
            new BuildConstantsDaemon(context);
        } catch (e) {
            console.error('Failed to initialize Daemon', e);
        }

        // ─── Commands ────────────────────────────────────────────────
        context.subscriptions.push(
            vscode.commands.registerCommand('marslib.build', () => {
                runGradlewCommand('build', 'MARSLib: Build');
            }),

            vscode.commands.registerCommand('marslib.deploy', async () => {
                await deployManager.deploy();
            }),

            vscode.commands.registerCommand('marslib.simulate', () => {
                runGradlewCommand('simulateJava', 'MARSLib: Simulate');
            }),

            vscode.commands.registerCommand('marslib.simWithScope', () => {
                simLauncher.launchSimWithScope();
            }),

            vscode.commands.registerCommand('marslib.toggleSimMode', () => {
                simLauncher.toggle();
                actionProvider.refresh();
            }),

            vscode.commands.registerCommand('marslib.generateSubsystem', async () => {
                await generateSubsystem();
            }),

            vscode.commands.registerCommand('marslib.audit', () => {
                runAudit();
            }),

            vscode.commands.registerCommand('marslib.setupEnvironment', async () => {
                await setupEnvironment();
            }),

            vscode.commands.registerCommand('marslib.openLog', async () => {
                await openLatestLog();
            }),

            vscode.commands.registerCommand('marslib.openDashboard', () => {
                try {
                    const { MARSVirtualDashboard } = require('./virtualDashboard') as LazyVirtualDashboard;
                    MARSVirtualDashboard.createOrShow(context.extensionUri);
                } catch (e) {
                    vscode.window.showErrorMessage('Failed to open Virtual Dashboard.');
                    console.error('Dashboard load error:', e);
                }
            }),

            vscode.commands.registerCommand('marslib.generateTest', async () => {
                await generatePhysicsTest();
            }),

            vscode.commands.registerCommand('marslib.openBinder', () => {
                try {
                    const { MARSCommandBinder } = require('./commandBinder') as LazyCommandBinder;
                    MARSCommandBinder.createOrShow(context.extensionUri);
                } catch (e) {
                    vscode.window.showErrorMessage('Failed to open Command Binder.');
                    console.error('Command Binder load error:', e);
                }
            }),

            vscode.commands.registerCommand('marslib.openCANMap', () => {
                try {
                    const { CANBusVisualizer } = require('./canBusVisualizer') as LazyCANBusVisualizer;
                    CANBusVisualizer.createOrShow(context.extensionUri);
                } catch (e) {
                    vscode.window.showErrorMessage('Failed to open CAN Bus Map.');
                    console.error('CAN Bus Map load error:', e);
                }
            })
        );

        if (refreshCANIdsDisposable) {
            context.subscriptions.push(refreshCANIdsDisposable);
        }

        console.log('MARSLib VS Code extension v2.0.0 activated successfully.');
    } catch (e) {
        console.error('Critical failure during MARSLib extension activation', e);
    }
}

export function deactivate() {
    // Cleanup if needed
}
