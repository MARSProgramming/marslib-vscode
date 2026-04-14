import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class MARSCommandBinder {
    public static currentPanel: MARSCommandBinder | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (MARSCommandBinder.currentPanel) {
            MARSCommandBinder.currentPanel.panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'marsBinder',
            'MARSLib Command Binder',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(extensionUri.fsPath, 'resources'))]
            }
        );

        MARSCommandBinder.currentPanel = new MARSCommandBinder(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this.panel = panel;
        this.extensionUri = extensionUri;

        this.update();

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        this.panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'bind':
                        await this.bindCommand(message);
                        return;
                }
            },
            null,
            this.disposables
        );
    }

    private async bindCommand(data: any) {
        const { controller, button, action, method, commandStr } = data;
        
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) return;

        const bindingsPath = path.join(folders[0].uri.fsPath, 'src', 'main', 'java', 'frc', 'robot', 'RobotBindings.java');
        if (!fs.existsSync(bindingsPath)) {
            vscode.window.showErrorMessage('RobotBindings.java not found in the expected location.');
            return;
        }

        let content = fs.readFileSync(bindingsPath, 'utf8');

        // Logic to inject the binding before the last closing brace of configureBindings
        const bindingCode = `\n    ${controller}.${method}(\n        ${controller}.${button}(),\n        "${button.toUpperCase()}",\n        "${action}",\n        ${commandStr});\n`;

        // Find the configureBindings method end
        const methodEndIndex = content.lastIndexOf('}');
        if (methodEndIndex === -1) {
            vscode.window.showErrorMessage('Could not find end of RobotBindings class.');
            return;
        }

        // Insert before class close
        content = content.slice(0, methodEndIndex - 1) + bindingCode + content.slice(methodEndIndex - 1);

        fs.writeFileSync(bindingsPath, content);
        vscode.window.showInformationMessage(`Successfully bound ${button} to ${action} in RobotBindings.java`);
    }

    private update() {
        this.panel.webview.html = this.getHtml();
    }

    private getHtml() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: sans-serif; padding: 20px; background: #0A0A0B; color: #E0E0E0; }
        select, input, button { width: 100%; padding: 10px; margin: 10px 0; border-radius: 5px; background: #151518; color: white; border: 1px solid #FF6B00; }
        button { background: #FF6B00; cursor: pointer; font-weight: bold; border: none; }
        label { font-size: 12px; color: #888; text-transform: uppercase; }
        .container { max-width: 400px; margin: auto; }
        h1 { color: #FF6B00; font-size: 1.2rem; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <h1>BATTLE-STATION BINDER</h1>
        <label>Controller</label>
        <select id="controller">
            <option value="controller">Drive Pilot</option>
            <option value="coPilot">Co-Pilot</option>
        </select>
        
        <label>Physical Button</label>
        <select id="button">
            <option value="a">A Button</option>
            <option value="b">B Button</option>
            <option value="x">X Button</option>
            <option value="y">Y Button</option>
            <option value="leftBumper">Left Bumper</option>
            <option value="rightBumper">Right Bumper</option>
            <option value="leftTrigger">Left Trigger</option>
            <option value="rightTrigger">Right Trigger</option>
            <option value="povUp">DPad Up</option>
            <option value="povDown">DPad Down</option>
        </select>

        <label>Trigger Method</label>
        <select id="method">
            <option value="bindOnTrue">On Pressed (Pulse)</option>
            <option value="bindWhileTrue">While Held (Continuous)</option>
            <option value="bindOnFalse">On Released</option>
        </select>

        <label>Action Label (for Logs)</label>
        <input type="text" id="action" placeholder="e.g. Score High">

        <label>Command Instance (Java)</label>
        <input type="text" id="commandStr" placeholder="e.g. shooter.scoreCommand()">

        <button onclick="bind()">INJECT BINDING</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function bind() {
            vscode.postMessage({
                command: 'bind',
                controller: document.getElementById('controller').value,
                button: document.getElementById('button').value,
                action: document.getElementById('action').value,
                method: document.getElementById('method').value,
                commandStr: document.getElementById('commandStr').value
            });
        }
    </script>
</body>
</html>`;
    }

    public dispose() {
        MARSCommandBinder.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const x = this.disposables.pop();
            if (x) x.dispose();
        }
    }
}
