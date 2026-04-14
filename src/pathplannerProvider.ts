import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * PathPlanner integration for the MARSLib sidebar.
 * 
 * Provides:
 * - Tree view of all .path and .auto files
 * - Named command validation (cross-references Java source vs .auto files)
 * - Click to open path files in PathPlanner GUI
 */
export class PathPlannerProvider implements vscode.TreeDataProvider<PathItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<PathItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: PathItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PathItem): Promise<PathItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        const root = vscode.workspace.workspaceFolders[0].uri.fsPath;

        if (!element) {
            // Root level: categories
            const items: PathItem[] = [];

            // Paths section
            const pathsItem = new PathItem('Paths', vscode.TreeItemCollapsibleState.Expanded, 'category');
            pathsItem.iconPath = new vscode.ThemeIcon('compass');
            items.push(pathsItem);

            // Autos section
            const autosItem = new PathItem('Autonomous Routines', vscode.TreeItemCollapsibleState.Expanded, 'category');
            autosItem.iconPath = new vscode.ThemeIcon('play-circle');
            items.push(autosItem);

            // Validation section
            const validationItem = new PathItem('Named Command Validation', vscode.TreeItemCollapsibleState.Collapsed, 'category');
            validationItem.iconPath = new vscode.ThemeIcon('checklist');
            items.push(validationItem);

            return items;
        }

        if (element.label === 'Paths') {
            return this.listFiles(root, 'paths', '.path');
        }

        if (element.label === 'Autonomous Routines') {
            return this.listFiles(root, 'autos', '.auto');
        }

        if (element.label === 'Named Command Validation') {
            return this.validateNamedCommands(root);
        }

        return [];
    }

    private listFiles(root: string, subdir: string, extension: string): PathItem[] {
        const dir = path.join(root, 'src', 'main', 'deploy', 'pathplanner', subdir);
        if (!fs.existsSync(dir)) {
            const empty = new PathItem(`No ${extension} files found`, vscode.TreeItemCollapsibleState.None, 'empty');
            empty.iconPath = new vscode.ThemeIcon('info');
            return [empty];
        }

        const files = fs.readdirSync(dir).filter(f => f.endsWith(extension));
        if (files.length === 0) {
            const empty = new PathItem(`No ${extension} files found`, vscode.TreeItemCollapsibleState.None, 'empty');
            empty.iconPath = new vscode.ThemeIcon('info');
            return [empty];
        }

        return files.map(f => {
            const item = new PathItem(
                f.replace(extension, ''),
                vscode.TreeItemCollapsibleState.None,
                'file'
            );
            item.resourceUri = vscode.Uri.file(path.join(dir, f));
            item.iconPath = new vscode.ThemeIcon(extension === '.path' ? 'debug-line-by-line' : 'play');
            item.command = {
                command: 'vscode.open',
                title: 'Open',
                arguments: [vscode.Uri.file(path.join(dir, f))]
            };
            item.tooltip = path.join(dir, f);
            return item;
        });
    }

    /**
     * Cross-references NamedCommands.registerCommand() calls in Java source
     * against command names used in .auto files.
     */
    private validateNamedCommands(root: string): PathItem[] {
        const items: PathItem[] = [];

        // 1. Find all registered named commands from Java source
        const registeredCommands = this.findRegisteredCommands(root);

        // 2. Find all command references in .auto files
        const referencedCommands = this.findAutoCommandReferences(root);

        // 3. Cross-reference
        const allCommands = new Set([...registeredCommands.keys(), ...referencedCommands]);

        if (allCommands.size === 0) {
            const empty = new PathItem('No named commands found', vscode.TreeItemCollapsibleState.None, 'empty');
            empty.iconPath = new vscode.ThemeIcon('info');
            return [empty];
        }

        for (const cmd of allCommands) {
            const isRegistered = registeredCommands.has(cmd);
            const isReferenced = referencedCommands.has(cmd);

            const item = new PathItem(cmd, vscode.TreeItemCollapsibleState.None, 'validation');

            if (isRegistered && isReferenced) {
                item.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
                item.description = '✓ Registered & used';
            } else if (isRegistered && !isReferenced) {
                item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
                item.description = 'Registered but unused in any .auto';
            } else if (!isRegistered && isReferenced) {
                item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
                item.description = '❌ Referenced in .auto but NOT registered!';
            }

            if (isRegistered) {
                const loc = registeredCommands.get(cmd);
                if (loc) {
                    item.command = {
                        command: 'vscode.open',
                        title: 'Go to registration',
                        arguments: [vscode.Uri.file(loc.file), { selection: new vscode.Range(loc.line, 0, loc.line, 0) }]
                    };
                }
            }

            items.push(item);
        }

        return items;
    }

    private findRegisteredCommands(root: string): Map<string, { file: string; line: number }> {
        const commands = new Map<string, { file: string; line: number }>();
        const srcDir = path.join(root, 'src', 'main', 'java');

        if (!fs.existsSync(srcDir)) {
            return commands;
        }

        this.walkJavaFiles(srcDir, (filePath) => {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                // Match: NamedCommands.registerCommand("commandName", ...)
                const regex = /NamedCommands\.registerCommand\s*\(\s*"([^"]+)"/g;
                let match;
                while ((match = regex.exec(lines[i])) !== null) {
                    commands.set(match[1], { file: filePath, line: i });
                }
            }
        });

        return commands;
    }

    private findAutoCommandReferences(root: string): Set<string> {
        const commands = new Set<string>();
        const autosDir = path.join(root, 'src', 'main', 'deploy', 'pathplanner', 'autos');

        if (!fs.existsSync(autosDir)) {
            return commands;
        }

        const files = fs.readdirSync(autosDir).filter(f => f.endsWith('.auto'));
        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(autosDir, file), 'utf8');
                const json = JSON.parse(content);
                this.extractCommandNames(json, commands);
            } catch {
                // Skip unparseable files
            }
        }

        return commands;
    }

    private extractCommandNames(obj: any, commands: Set<string>): void {
        if (!obj || typeof obj !== 'object') { return; }

        // PathPlanner auto files use "type": "named" with "data": {"name": "commandName"}
        if (obj.type === 'named' && obj.data?.name) {
            commands.add(obj.data.name);
        }

        // Recurse
        for (const value of Object.values(obj)) {
            if (Array.isArray(value)) {
                value.forEach(item => this.extractCommandNames(item, commands));
            } else if (typeof value === 'object') {
                this.extractCommandNames(value, commands);
            }
        }
    }

    private walkJavaFiles(dir: string, callback: (filePath: string) => void): void {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && entry.name !== 'build' && entry.name !== 'node_modules') {
                    this.walkJavaFiles(fullPath, callback);
                } else if (entry.isFile() && entry.name.endsWith('.java')) {
                    callback(fullPath);
                }
            }
        } catch {
            // Skip inaccessible directories
        }
    }
}

class PathItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'category' | 'file' | 'validation' | 'empty'
    ) {
        super(label, collapsibleState);
        this.contextValue = type;
    }
}
