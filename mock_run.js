const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (path) {
    if (path === 'vscode') {
        return {
            window: {
                activeTextEditor: null,
                registerTreeDataProvider: () => {},
                createWebviewPanel: () => {},
                createStatusBarItem: () => { return { show: () => {}, dispose: () => {} } }
            },
            workspace: {
                workspaceFolders: null,
                onDidSaveTextDocument: () => {},
            },
            commands: {
                registerCommand: () => {},
            },
            languages: {
                registerCodeLensProvider: () => {},
            },
            EventEmitter: class {},
            TreeItem: class {},
            TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
            ThemeIcon: class {},
            ThemeColor: class {},
            Uri: { file: () => {} },
            ViewColumn: { One: 1 },
            StatusBarAlignment: { Left: 1, Right: 2 }
        };
    }
    return originalRequire.call(this, path);
};

try {
    require('./out/extension.js');
    console.log("Success requiring extension.js");
} catch (e) {
    console.error("Error requiring extension.js:");
    console.error(e);
}
