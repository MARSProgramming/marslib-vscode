import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CAN Bus Visualizer — interactive webview showing all CAN devices,
 * their IDs, types, and power distribution mapping.
 */
export class CANBusVisualizer {
    public static currentPanel: CANBusVisualizer | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (CANBusVisualizer.currentPanel) {
            CANBusVisualizer.currentPanel.panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'marsCanBus', 'MARSLib CAN Bus Map',
            column || vscode.ViewColumn.One,
            { enableScripts: true }
        );

        CANBusVisualizer.currentPanel = new CANBusVisualizer(panel);
    }

    private constructor(panel: vscode.WebviewPanel) {
        this.panel = panel;
        this.update();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    private update() {
        const devices = this.scanCANDevices();
        this.panel.webview.html = this.getHtml(devices);
    }

    private scanCANDevices(): CANDevice[] {
        const devices: CANDevice[] = [];
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) { return devices; }

        const root = folders[0].uri.fsPath;
        const srcDir = path.join(root, 'src', 'main', 'java');
        if (!fs.existsSync(srcDir)) { return devices; }

        this.walkJavaFiles(srcDir, (filePath) => {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const fileName = path.basename(filePath, '.java');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // TalonFX
                const talonMatch = line.match(/new\s+TalonFX\s*\(\s*(\d+)\s*(?:,\s*"([^"]*)")?\s*\)/);
                if (talonMatch) {
                    devices.push({
                        name: this.inferName(lines, i, 'TalonFX'),
                        id: parseInt(talonMatch[1]),
                        bus: talonMatch[2] || 'rio',
                        type: 'TalonFX',
                        file: filePath,
                        line: i
                    });
                }

                // CANcoder
                const cancoderMatch = line.match(/new\s+CANcoder\s*\(\s*(\d+)\s*(?:,\s*"([^"]*)")?\s*\)/);
                if (cancoderMatch) {
                    devices.push({
                        name: this.inferName(lines, i, 'CANcoder'),
                        id: parseInt(cancoderMatch[1]),
                        bus: cancoderMatch[2] || 'rio',
                        type: 'CANcoder',
                        file: filePath,
                        line: i
                    });
                }

                // Pigeon2
                const pigeonMatch = line.match(/new\s+Pigeon2\s*\(\s*(\d+)\s*(?:,\s*"([^"]*)")?\s*\)/);
                if (pigeonMatch) {
                    devices.push({
                        name: this.inferName(lines, i, 'Pigeon2'),
                        id: parseInt(pigeonMatch[1]),
                        bus: pigeonMatch[2] || 'rio',
                        type: 'Pigeon2',
                        file: filePath,
                        line: i
                    });
                }

                // SparkMax / SparkFlex
                const sparkMatch = line.match(/new\s+(CANSparkMax|CANSparkFlex)\s*\(\s*(\d+)/);
                if (sparkMatch) {
                    devices.push({
                        name: this.inferName(lines, i, sparkMatch[1]),
                        id: parseInt(sparkMatch[2]),
                        bus: 'rio',
                        type: sparkMatch[1],
                        file: filePath,
                        line: i
                    });
                }

                // PDH
                const pdhMatch = line.match(/new\s+PowerDistribution\s*\(\s*(\d+)/);
                if (pdhMatch) {
                    devices.push({
                        name: 'PDH',
                        id: parseInt(pdhMatch[1]),
                        bus: 'rio',
                        type: 'PDH',
                        file: filePath,
                        line: i
                    });
                }

                // Also match constant-based IDs: new TalonFX(Constants.DRIVE_LEFT_ID)
                const constMatch = line.match(/new\s+(TalonFX|CANcoder|Pigeon2|CANSparkMax|CANSparkFlex)\s*\(\s*([A-Z][A-Za-z0-9_.]*[A-Z_]+)\s*(?:,\s*"([^"]*)")?\s*\)/);
                if (constMatch && !talonMatch && !cancoderMatch && !pigeonMatch && !sparkMatch) {
                    devices.push({
                        name: `${this.inferName(lines, i, constMatch[1])} (${constMatch[2]})`,
                        id: -1,
                        bus: constMatch[3] || 'rio',
                        type: constMatch[1],
                        file: filePath,
                        line: i
                    });
                }
            }
        });

        // Sort by CAN ID
        devices.sort((a, b) => a.id - b.id);
        return devices;
    }

    private inferName(lines: string[], lineIndex: number, fallback: string): string {
        const line = lines[lineIndex];
        // Try to extract variable name from assignment: private final TalonFX driveMotor = new TalonFX(...)
        const assignMatch = line.match(/(?:private|public|protected)?\s*(?:final\s+)?\w+\s+(\w+)\s*=/);
        if (assignMatch) {
            return assignMatch[1];
        }
        // Try field + constructor pattern: this.driveMotor = new TalonFX(...)
        const thisMatch = line.match(/this\.(\w+)\s*=/);
        if (thisMatch) {
            return thisMatch[1];
        }
        return fallback;
    }

    private walkJavaFiles(dir: string, callback: (filePath: string) => void): void {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && entry.name !== 'build') {
                    this.walkJavaFiles(fullPath, callback);
                } else if (entry.isFile() && entry.name.endsWith('.java')) {
                    callback(fullPath);
                }
            }
        } catch { /* skip */ }
    }

    private getHtml(devices: CANDevice[]): string {
        const busGroups = new Map<string, CANDevice[]>();
        for (const dev of devices) {
            const bus = dev.bus;
            if (!busGroups.has(bus)) { busGroups.set(bus, []); }
            busGroups.get(bus)!.push(dev);
        }

        // Check for conflicts
        const idCounts = new Map<string, number>();
        for (const dev of devices) {
            const key = `${dev.bus}:${dev.id}`;
            idCounts.set(key, (idCounts.get(key) || 0) + 1);
        }

        let busHtml = '';
        for (const [bus, devs] of busGroups) {
            busHtml += `<div class="bus-section">
                <h2><span class="bus-icon">⚡</span> CAN Bus: ${bus.toUpperCase()}</h2>
                <div class="device-grid">`;

            for (const dev of devs) {
                const conflict = dev.id >= 0 && (idCounts.get(`${dev.bus}:${dev.id}`) || 0) > 1;
                const typeColor = this.getTypeColor(dev.type);
                const idDisplay = dev.id >= 0 ? dev.id.toString() : '?';

                busHtml += `
                    <div class="device-card ${conflict ? 'conflict' : ''}" title="${dev.file}:${dev.line + 1}">
                        <div class="device-id" style="background: ${typeColor}">${idDisplay}</div>
                        <div class="device-info">
                            <div class="device-name">${dev.name}</div>
                            <div class="device-type">${dev.type}</div>
                            ${conflict ? '<div class="conflict-badge">⚠️ ID CONFLICT</div>' : ''}
                        </div>
                    </div>`;
            }

            busHtml += `</div></div>`;
        }

        if (devices.length === 0) {
            busHtml = '<div class="empty">No CAN devices detected. Open a project with TalonFX, SparkMax, CANcoder, or Pigeon2 instantiations.</div>';
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        :root {
            --mars-orange: #FF6B00;
            --bg: #0A0A0B;
            --card: #151518;
            --text: #E0E0E0;
        }
        body { background: var(--bg); color: var(--text); font-family: 'Inter', -apple-system, sans-serif; padding: 24px; margin: 0; }
        h1 { font-size: 1.3rem; color: var(--mars-orange); margin-bottom: 24px; letter-spacing: 1px; }
        h2 { font-size: 1rem; color: #888; margin: 24px 0 12px; display: flex; align-items: center; gap: 8px; }
        .bus-icon { font-size: 1.2rem; }
        .bus-section { margin-bottom: 32px; }
        .device-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
        .device-card {
            background: var(--card); border-radius: 10px; padding: 14px;
            display: flex; gap: 12px; align-items: center;
            border: 1px solid rgba(255,255,255,0.05);
            transition: transform 0.15s ease, border-color 0.15s ease;
            cursor: default;
        }
        .device-card:hover { transform: translateY(-2px); border-color: rgba(255,107,0,0.3); }
        .device-card.conflict { border-color: #FF3B3B; animation: pulse-border 2s infinite; }
        @keyframes pulse-border { 0%,100% { border-color: #FF3B3B; } 50% { border-color: rgba(255,59,59,0.3); } }
        .device-id {
            width: 40px; height: 40px; border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            font-weight: 800; font-size: 1rem; color: white; flex-shrink: 0;
        }
        .device-name { font-weight: 600; font-size: 0.85rem; }
        .device-type { font-size: 0.7rem; color: #666; margin-top: 2px; }
        .conflict-badge { font-size: 0.65rem; color: #FF3B3B; margin-top: 4px; font-weight: 600; }
        .stats { display: flex; gap: 24px; margin-bottom: 24px; }
        .stat { background: var(--card); padding: 12px 18px; border-radius: 8px; }
        .stat-val { font-size: 1.4rem; font-weight: 700; color: var(--mars-orange); }
        .stat-label { font-size: 0.65rem; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
        .empty { text-align: center; color: #555; padding: 48px; font-size: 0.9rem; }
    </style>
</head>
<body>
    <h1>🔌 CAN BUS TOPOLOGY</h1>
    <div class="stats">
        <div class="stat"><div class="stat-val">${devices.length}</div><div class="stat-label">Devices</div></div>
        <div class="stat"><div class="stat-val">${busGroups.size}</div><div class="stat-label">Buses</div></div>
        <div class="stat"><div class="stat-val">${[...idCounts.values()].filter(c => c > 1).length}</div><div class="stat-label">Conflicts</div></div>
    </div>
    ${busHtml}
</body>
</html>`;
    }

    private getTypeColor(type: string): string {
        switch (type) {
            case 'TalonFX': return '#E74C3C';
            case 'CANSparkMax': case 'CANSparkFlex': return '#3498DB';
            case 'CANcoder': return '#2ECC71';
            case 'Pigeon2': return '#9B59B6';
            case 'PDH': return '#F39C12';
            default: return '#888';
        }
    }

    private dispose() {
        CANBusVisualizer.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const x = this.disposables.pop();
            if (x) { x.dispose(); }
        }
    }
}

interface CANDevice {
    name: string;
    id: number;
    bus: string;
    type: string;
    file: string;
    line: number;
}
