<p align="center">
  <img src="resources/mars-logo.png" width="250" alt="MARSLib Logo" />
</p>

# MARSLib VS Code Extension
Official VS Code extension for FRC Team 2614's MARSLib robotics framework. 
Provides elite CI/CD pipelining, code auditing, and AdvantageKit architectural generation directly within the editor.

## Features
- **Sidebar Integration:** A dedicated Activity Bar icon that puts all essential robot commands one click away.
- **AdvantageKit Scaffolding:** Instantly scaffold robust Subsystems (Real/Sim/Interface layers).
- **Code Auditing:** Run automatic formatting checks and the proprietary `marslib-audit` script to ensure championship-grade architectural standards.

## Installation Instructions

Until the extension is published on the official VS Code Marketplace, you can quickly install it manually:

### Option 1: Use the VS Code Interface (Recommended)
1. Navigate to the **Releases** tab on this GitHub repository and download the latest `.vsix` file.
2. Open VS Code and navigate to the **Extensions** view (`Ctrl`+`Shift`+`X`).
3. Click the `...` (More Actions) menu in the top right of the extensions sidebar.
4. Select **Install from VSIX...**
5. Browse for your downloaded `.vsix` file and select it.

### Option 2: Use the Command Line
If you have the VS Code CLI enabled, run the following command to install the extension directly from your terminal:
```bash
code --install-extension marslib-vscode-1.0.0.vsix
```

## Developer Setup
To compile and test the extension locally:
```bash
# Install dependencies
npm install

# Compile the extension packaging tool
npm install -g @vscode/vsce

# Build a new .vsix package
vsce package

# Install the generated .vsix to your local VS Code
code --install-extension marslib-vscode-1.0.0.vsix --force
```
