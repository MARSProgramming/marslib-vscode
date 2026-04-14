import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * TreeDataProvider to display CAN IDs found in Constants files.
 */
export class CANIdManager implements vscode.TreeDataProvider<CANItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CANItem | undefined | void> = new vscode.EventEmitter<CANItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<CANItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor() {
        // Initialization if needed
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CANItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CANItem): Promise<CANItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const items: CANItem[] = [];

        if (!element) {
            // Root: List Constants files
            const constantsFiles = await this.findConstantsFiles(root);
            const allIds = new Map<number, string[]>();

            for (const file of constantsFiles) {
                const basename = path.basename(file);
                const ids = this.parseIdsFromFile(file);
                
                if (ids.length > 0) {
                    const fileItem = new CANItem(
                        basename,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'file'
                    );
                    fileItem.ids = ids;
                    items.push(fileItem);

                    // Track for conflict detection
                    for (const idObj of ids) {
                        if (!allIds.has(idObj.value)) {
                            allIds.set(idObj.value, []);
                        }
                        allIds.get(idObj.value)!.push(`${basename}: ${idObj.name}`);
                    }
                }
            }

            // Flag conflicts
            this.flagConflicts(items, allIds);
            return items;
        } else {
            // Leaf: List IDs in a file
            return element.ids.map(id => {
                const item = new CANItem(
                    `${id.name}: ${id.value}`,
                    vscode.TreeItemCollapsibleState.None,
                    'id'
                );
                if (id.hasConflict) {
                    item.description = '⚠️ CONFLICT';
                    item.tooltip = `Multiple devices assigned to ID ${id.value}:\n${id.conflictList?.join('\n')}`;
                    item.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
                } else {
                    item.iconPath = new vscode.ThemeIcon('circuit-board');
                }
                return item;
            });
        }
    }

    private async findConstantsFiles(root: string): Promise<string[]> {
        const pattern = new vscode.RelativePattern(root, '**/constants/*Constants.java');
        const uris = await vscode.workspace.findFiles(pattern);
        return uris.map(u => u.fsPath);
    }

    private parseIdsFromFile(filePath: string): Array<{ name: string, value: number, hasConflict: boolean, conflictList?: string[] }> {
        const content = fs.readFileSync(filePath, 'utf8');
        const ids: Array<{ name: string, value: number, hasConflict: boolean }> = [];
        
        // Match: public static final int NAME_ID = 5;
        const regex = /public\s+static\s+final\s+int\s+([a-zA-Z0-9_]+_ID)\s*=\s*([0-9]+)\s*;/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            ids.push({
                name: match[1],
                value: parseInt(match[2]),
                hasConflict: false
            });
        }
        return ids;
    }

    private flagConflicts(fileItems: CANItem[], allIds: Map<number, string[]>) {
        for (const fileItem of fileItems) {
            let fileHasConflict = false;
            for (const idObj of fileItem.ids) {
                const owners = allIds.get(idObj.value);
                if (owners && owners.length > 1) {
                    idObj.hasConflict = true;
                    idObj.conflictList = owners;
                    fileHasConflict = true;
                }
            }
            if (fileHasConflict) {
                fileItem.description = '⚠️ ID CONFLICT';
                fileItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('notificationsWarningIcon.foreground'));
            }
        }
    }
}

class CANItem extends vscode.TreeItem {
    public ids: Array<{ name: string, value: number, hasConflict: boolean, conflictList?: string[] }> = [];

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'file' | 'id'
    ) {
        super(label, collapsibleState);
        this.contextValue = type;
    }
}
