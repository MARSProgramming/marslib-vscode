import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export async function generateSubsystem() {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open. Open the MARSLib robot project first.');
        return;
    }

    const subsystemName = await vscode.window.showInputBox({
        prompt: 'Enter Subsystem Name (e.g., Shooter)',
        placeHolder: 'Shooter'
    });

    if (!subsystemName) {
        return; // User cancelled
    }

    // Capitalize first letter
    const name = subsystemName.charAt(0).toUpperCase() + subsystemName.slice(1);
    
    // Default location: src/main/java/frc/robot/subsystems/
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const subsystemDir = path.join(workspaceRoot, 'src', 'main', 'java', 'frc', 'robot', 'subsystems', name.toLowerCase());

    if (!fs.existsSync(subsystemDir)) {
        fs.mkdirSync(subsystemDir, { recursive: true });
    } else {
        vscode.window.showWarningMessage(`Directory for subsystem ${name.toLowerCase()} already exists.`);
    }

    const files = [
        {
            filename: `${name}.java`,
            content: `package frc.robot.subsystems.${name.toLowerCase()};

import edu.wpi.first.wpilibj2.command.SubsystemBase;
import org.littletonrobotics.junction.Logger;

public class ${name} extends SubsystemBase {
    private final ${name}IO io;
    private final ${name}IOInputsAutoLogged inputs = new ${name}IOInputsAutoLogged();

    public ${name}(${name}IO io) {
        this.io = io;
        System.out.println("[Init] Creating ${name}");
    }

    @Override
    public void periodic() {
        io.updateInputs(inputs);
        Logger.processInputs("${name}", inputs);
    }
}
`
        },
        {
            filename: `${name}IO.java`,
            content: `package frc.robot.subsystems.${name.toLowerCase()};

import org.littletonrobotics.junction.AutoLog;

public interface ${name}IO {
    @AutoLog
    class ${name}IOInputs {
        public double positionRad = 0.0;
        public double velocityRadPerSec = 0.0;
        public double appliedVolts = 0.0;
        public double[] currentAmps = new double[] {};
    }

    /** Updates the set of loggable inputs. */
    default void updateInputs(${name}IOInputs inputs) {}
    
    /** Run open loop at the specified voltage. */
    default void setVoltage(double volts) {}
}
`
        },
        {
            filename: `${name}IOReal.java`,
            content: `package frc.robot.subsystems.${name.toLowerCase()};

public class ${name}IOReal implements ${name}IO {
    
    public ${name}IOReal() {
        // Initialize Real Hardware (e.g., TalonFX, SparkMax)
    }

    @Override
    public void updateInputs(${name}IOInputs inputs) {
        // Read from real hardware
    }
    
    @Override
    public void setVoltage(double volts) {
        // Set real hardware voltage
    }
}
`
        },
        {
            filename: `${name}IOSim.java`,
            content: `package frc.robot.subsystems.${name.toLowerCase()};

public class ${name}IOSim implements ${name}IO {
    
    public ${name}IOSim() {
        // Initialize Dyn4j Simulation Physics
    }

    @Override
    public void updateInputs(${name}IOInputs inputs) {
        // Update physics state
    }
    
    @Override
    public void setVoltage(double volts) {
        // Apply physics forces
    }
}
`
        }
    ];

    for (const file of files) {
        const filePath = path.join(subsystemDir, file.filename);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, file.content, 'utf8');
        }
    }

    vscode.window.showInformationMessage(`✅ Successfully generated ${name} Subsystem IO layer.`);
}
