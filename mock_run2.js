const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (path) {
    if (path === 'vscode') {
        const vscode = {
            window: {
                activeTextEditor: null,
                registerTreeDataProvider: (id, provider) => {
                    console.log(`  [MOCK] registerTreeDataProvider('${id}') called`);
                    return { dispose: () => {} };
                },
                createTreeView: (id, options) => {
                    console.log(`  [MOCK] createTreeView('${id}') called — provider: ${options.treeDataProvider ? 'YES' : 'NO'}`);
                    return { dispose: () => {} };
                },
                createWebviewPanel: () => ({ webview: { html: '', onDidReceiveMessage: () => ({}) }, onDidDispose: () => ({}), reveal: () => {}, dispose: () => {} }),
                createStatusBarItem: () => ({ show: () => {}, dispose: () => {}, text: '', tooltip: '', command: '', backgroundColor: undefined }),
                createTerminal: () => ({ show: () => {}, sendText: () => {} }),
                showErrorMessage: (msg) => console.log(`  [MOCK] showErrorMessage: ${msg}`),
                showInformationMessage: (msg) => console.log(`  [MOCK] showInfoMessage: ${msg}`),
                terminals: []
            },
            workspace: {
                workspaceFolders: null,
                onDidSaveTextDocument: () => ({ dispose: () => {} }),
                onDidChangeTextDocument: () => ({ dispose: () => {} }),
                onDidOpenTextDocument: () => ({ dispose: () => {} }),
                onDidCloseTextDocument: () => ({ dispose: () => {} }),
                findFiles: async () => []
            },
            commands: {
                registerCommand: (id, handler) => {
                    console.log(`  [MOCK] registerCommand('${id}') registered`);
                    return { dispose: () => {} };
                },
                executeCommand: () => {}
            },
            languages: {
                registerCodeLensProvider: () => ({ dispose: () => {} }),
                createDiagnosticCollection: () => ({ set: () => {}, clear: () => {} })
            },
            EventEmitter: class EventEmitter {
                constructor() { this._listeners = []; }
                get event() { return (listener) => { this._listeners.push(listener); return { dispose: () => {} }; }; }
                fire(data) { this._listeners.forEach(l => l(data)); }
            },
            TreeItem: class TreeItem {
                constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; }
            },
            TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
            ThemeIcon: class ThemeIcon { constructor(id) { this.id = id; } },
            ThemeColor: class ThemeColor { constructor(id) { this.id = id; } },
            Uri: { file: (p) => ({ fsPath: p }) },
            ViewColumn: { One: 1 },
            StatusBarAlignment: { Left: 1, Right: 2 },
            RelativePattern: class { constructor(base, pattern) {} },
            Range: class { constructor(a, b, c, d) {} },
            Diagnostic: class { constructor(range, msg, sev) { this.range = range; this.message = msg; this.severity = sev; } },
            DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 }
        };
        return vscode;
    }
    return originalRequire.call(this, path);
};

try {
    const ext = require('./out/extension.js');
    console.log('\n=== STEP 1: Module loaded successfully ===\n');
    
    const context = { 
        subscriptions: [], 
        extensionUri: { fsPath: __dirname } 
    };
    
    ext.activate(context);
    console.log(`\n=== STEP 2: activate() completed ===`);
    console.log(`  Total subscriptions registered: ${context.subscriptions.length}`);
    console.log('\n=== ALL GOOD — Extension activates without errors ===');
} catch (e) {
    console.error('\n=== FATAL ERROR ===');
    console.error(e);
}
