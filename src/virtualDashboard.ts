import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { NetworkTables, NetworkTablesTypeInfos } from 'ntcore-ts-client';

export class MARSVirtualDashboard {
    public static currentPanel: MARSVirtualDashboard | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];
    private nt: NetworkTables;

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (MARSVirtualDashboard.currentPanel) {
            MARSVirtualDashboard.currentPanel.panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'marsDashboard',
            'MARSLib Virtual Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(extensionUri.fsPath, 'resources'))]
            }
        );

        MARSVirtualDashboard.currentPanel = new MARSVirtualDashboard(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        
        const address = '127.0.0.1';
        this.nt = NetworkTables.getInstanceByURI(address);

        this.update();

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Start NT Connection
        this.setupNT(address);
    }

    private setupNT(address: string) {
        this.nt.addRobotConnectionListener((connected: boolean) => {
            if (this.panel.visible) {
                this.panel.webview.postMessage({ type: 'status', connected, address });
            }
        }, true);

        // Subscriptions - Use correct type info constants
        const batteryTopic = this.nt.createTopic('/Battery/Voltage', NetworkTablesTypeInfos.kDouble, 0);
        const timeTopic = this.nt.createTopic('/MatchInfo/MatchTime', NetworkTablesTypeInfos.kDouble, 0);
        const poseXTopic = this.nt.createTopic('/Odometry/Robot/X', NetworkTablesTypeInfos.kDouble, 0);
        const poseYTopic = this.nt.createTopic('/Odometry/Robot/Y', NetworkTablesTypeInfos.kDouble, 0);
        const poseRotTopic = this.nt.createTopic('/Odometry/Robot/Rotation', NetworkTablesTypeInfos.kDouble, 0);
        const modeTopic = this.nt.createTopic('/Swerve/State', NetworkTablesTypeInfos.kString, 'IDLE');
        const faultTopic = this.nt.createTopic('/Faults/ActiveCount', NetworkTablesTypeInfos.kDouble, 0);

        setInterval(() => {
            if (!this.panel.visible) return;
            
            this.panel.webview.postMessage({
                type: 'update',
                values: {
                    battery: batteryTopic.getValue(),
                    time: timeTopic.getValue(),
                    poseX: poseXTopic.getValue(),
                    poseY: poseYTopic.getValue(),
                    poseRot: poseRotTopic.getValue(),
                    mode: modeTopic.getValue(),
                    faults: faultTopic.getValue()
                }
            });
        }, 100);
    }

    private update() {
        this.panel.webview.html = this.getHtml();
    }

    private getHtml() {
        const filePath = path.join(this.extensionUri.fsPath, 'resources', 'dashboard-ui.html');
        return fs.readFileSync(filePath, 'utf8');
    }

    public dispose() {
        MARSVirtualDashboard.currentPanel = undefined;
        this.panel.dispose();
        // The NT instance is shared/singleton in most implementations, 
        // but we ensure we stop tracking if needed.
        while (this.disposables.length) {
            const x = this.disposables.pop();
            if (x) x.dispose();
        }
    }
}
