import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface MechanismConfig {
    type: 'rotary' | 'linear' | 'flywheel';
    motor: 'TalonFX' | 'SparkMax' | 'SparkFlex';
    sensor: 'Integrated' | 'CANcoder' | 'ThroughBore';
    includeSysId: boolean;
}

/**
 * Multi-step wizard for generating AdvantageKit-compliant subsystem IO layers.
 * 
 * Generates 4 files per subsystem:
 * - SubsystemIO.java (interface + AutoLog inputs)
 * - SubsystemIOReal.java (hardware implementation)
 * - SubsystemIOSim.java (simulation implementation)
 * - Subsystem.java (subsystem with logging)
 */
export async function generateSubsystem() {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder open. Open the MARSLib robot project first.');
        return;
    }

    // Step 1: Subsystem Name
    const subsystemName = await vscode.window.showInputBox({
        prompt: 'Step 1/5: Enter Subsystem Name',
        placeHolder: 'e.g., Shooter, Elevator, Intake',
        validateInput: (value) => {
            if (!value) { return 'Name is required'; }
            if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) { return 'Use PascalCase (letters and numbers only)'; }
            return null;
        }
    });
    if (!subsystemName) { return; }

    const name = subsystemName.charAt(0).toUpperCase() + subsystemName.slice(1);

    // Step 2: Mechanism Type
    const mechType = await vscode.window.showQuickPick([
        { label: '$(symbol-property) Rotary Mechanism', description: 'Arms, wrists, turrets — position + velocity control', value: 'rotary' as const },
        { label: '$(arrow-both) Linear Mechanism', description: 'Elevators, telescopes — position + velocity control', value: 'linear' as const },
        { label: '$(sync~spin) Flywheel', description: 'Shooters, intakes — velocity control only', value: 'flywheel' as const },
    ], { title: `Step 2/5: ${name} — Mechanism Type`, placeHolder: 'Select the mechanism type' });
    if (!mechType) { return; }

    // Step 3: Motor Controller
    const motorType = await vscode.window.showQuickPick([
        { label: '$(zap) TalonFX (Falcon 500 / Kraken)', description: 'CTRE Phoenix 6 motor controller', value: 'TalonFX' as const },
        { label: '$(zap) SparkMax (NEO / NEO 550)', description: 'REV Robotics SparkMax', value: 'SparkMax' as const },
        { label: '$(zap) SparkFlex (Vortex)', description: 'REV Robotics SparkFlex', value: 'SparkFlex' as const },
    ], { title: `Step 3/5: ${name} — Motor Controller`, placeHolder: 'Select the motor controller' });
    if (!motorType) { return; }

    // Step 4: Sensor Type
    const sensorType = await vscode.window.showQuickPick([
        { label: '$(pulse) Integrated Encoder', description: 'Built-in motor encoder', value: 'Integrated' as const },
        { label: '$(broadcast) CANcoder', description: 'CTRE CANcoder absolute encoder', value: 'CANcoder' as const },
        { label: '$(broadcast) REV Through Bore', description: 'REV Through Bore absolute encoder', value: 'ThroughBore' as const },
    ], { title: `Step 4/5: ${name} — Sensor`, placeHolder: 'Select the feedback sensor' });
    if (!sensorType) { return; }

    // Step 5: SysId
    const sysIdChoice = await vscode.window.showQuickPick([
        { label: '$(beaker) Yes — Include SysId routine', description: 'Adds characterization commands for tuning', value: true },
        { label: '$(circle-slash) No — Skip SysId', description: 'Basic subsystem without characterization', value: false },
    ], { title: `Step 5/5: ${name} — System Identification`, placeHolder: 'Include SysId characterization routine?' });
    if (sysIdChoice === undefined) { return; }

    const config: MechanismConfig = {
        type: mechType.value,
        motor: motorType.value,
        sensor: sensorType.value,
        includeSysId: sysIdChoice.value,
    };

    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const subsystemDir = path.join(workspaceRoot, 'src', 'main', 'java', 'frc', 'robot', 'subsystems', name.toLowerCase());

    if (fs.existsSync(subsystemDir)) {
        const overwrite = await vscode.window.showWarningMessage(
            `Directory '${name.toLowerCase()}/' already exists. Overwrite?`, 'Overwrite', 'Cancel'
        );
        if (overwrite !== 'Overwrite') { return; }
    }

    fs.mkdirSync(subsystemDir, { recursive: true });

    const files = [
        { filename: `${name}IO.java`, content: generateIO(name, config) },
        { filename: `${name}IOReal.java`, content: generateIOReal(name, config) },
        { filename: `${name}IOSim.java`, content: generateIOSim(name, config) },
        { filename: `${name}.java`, content: generateSubsystemClass(name, config) },
    ];

    for (const file of files) {
        fs.writeFileSync(path.join(subsystemDir, file.filename), file.content, 'utf8');
    }

    // Open the subsystem file for the user
    const mainFile = path.join(subsystemDir, `${name}.java`);
    const doc = await vscode.workspace.openTextDocument(mainFile);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(
        `✅ Generated ${name} (${config.type}, ${config.motor}, ${config.sensor})${config.includeSysId ? ' with SysId' : ''}`
    );
}

function getUnits(type: string): { pos: string; vel: string; posUnit: string; velUnit: string } {
    switch (type) {
        case 'linear':
            return { pos: 'positionMeters', vel: 'velocityMetersPerSec', posUnit: 'meters', velUnit: 'm/s' };
        case 'flywheel':
            return { pos: 'positionRotations', vel: 'velocityRotationsPerSec', posUnit: 'rotations', velUnit: 'rot/s' };
        default:
            return { pos: 'positionRad', vel: 'velocityRadPerSec', posUnit: 'radians', velUnit: 'rad/s' };
    }
}

function getMotorImports(motor: string): string {
    switch (motor) {
        case 'TalonFX':
            return `import com.ctre.phoenix6.hardware.TalonFX;
import com.ctre.phoenix6.configs.TalonFXConfiguration;
import com.ctre.phoenix6.controls.VoltageOut;
import com.ctre.phoenix6.signals.NeutralModeValue;`;
        case 'SparkMax':
            return `import com.revrobotics.CANSparkMax;
import com.revrobotics.CANSparkLowLevel.MotorType;
import com.revrobotics.RelativeEncoder;`;
        case 'SparkFlex':
            return `import com.revrobotics.CANSparkFlex;
import com.revrobotics.CANSparkLowLevel.MotorType;
import com.revrobotics.RelativeEncoder;`;
        default:
            return '';
    }
}

function generateIO(name: string, config: MechanismConfig): string {
    const u = getUnits(config.type);
    return `package frc.robot.subsystems.${name.toLowerCase()};

import org.littletonrobotics.junction.AutoLog;

/**
 * Hardware abstraction interface for the ${name} ${config.type} mechanism.
 *
 * <p>Units: position in ${u.posUnit}, velocity in ${u.velUnit}.
 */
public interface ${name}IO {
    @AutoLog
    class ${name}IOInputs {
        /** Current ${config.type} position in ${u.posUnit}. */
        public double ${u.pos} = 0.0;
        /** Current ${config.type} velocity in ${u.velUnit}. */
        public double ${u.vel} = 0.0;
        /** Voltage applied to the motor in volts. */
        public double appliedVolts = 0.0;
        /** Stator current draw in amps. */
        public double[] currentAmps = new double[] {};
        /** Motor temperature in degrees Celsius. */
        public double[] temperatureCelsius = new double[] {};
    }

    /** Updates the set of loggable inputs. */
    default void updateInputs(${name}IOInputs inputs) {}

    /** Run open loop at the specified voltage. */
    default void setVoltage(double volts) {}

    /** Stop the motor immediately. */
    default void stop() {}
}
`;
}

function generateIOReal(name: string, config: MechanismConfig): string {
    const u = getUnits(config.type);
    const imports = getMotorImports(config.motor);

    let motorField = '';
    let motorInit = '';
    let updateBody = '';
    let setVoltageBody = '';
    let stopBody = '';

    if (config.motor === 'TalonFX') {
        motorField = `    private final TalonFX motor;
    private final VoltageOut voltageRequest = new VoltageOut(0);`;
        motorInit = `        motor = new TalonFX(canId);

        var motorConfig = new TalonFXConfiguration();
        motorConfig.MotorOutput.NeutralMode = NeutralModeValue.Brake;
        // TODO: Configure stator/supply current limits from Constants
        motor.getConfigurator().apply(motorConfig);`;
        updateBody = `        inputs.${u.pos} = motor.getPosition().getValueAsDouble();
        inputs.${u.vel} = motor.getVelocity().getValueAsDouble();
        inputs.appliedVolts = motor.getMotorVoltage().getValueAsDouble();
        inputs.currentAmps = new double[] {motor.getStatorCurrent().getValueAsDouble()};
        inputs.temperatureCelsius = new double[] {motor.getDeviceTemp().getValueAsDouble()};`;
        setVoltageBody = `        motor.setControl(voltageRequest.withOutput(volts));`;
        stopBody = `        motor.stopMotor();`;
    } else {
        const sparkClass = config.motor === 'SparkMax' ? 'CANSparkMax' : 'CANSparkFlex';
        motorField = `    private final ${sparkClass} motor;
    private final RelativeEncoder encoder;`;
        motorInit = `        motor = new ${sparkClass}(canId, MotorType.kBrushless);
        encoder = motor.getEncoder();

        motor.restoreFactoryDefaults();
        motor.setIdleMode(${sparkClass}.IdleMode.kBrake);
        // TODO: Configure current limits from Constants
        motor.burnFlash();`;
        updateBody = `        inputs.${u.pos} = encoder.getPosition();
        inputs.${u.vel} = encoder.getVelocity();
        inputs.appliedVolts = motor.getAppliedOutput() * motor.getBusVoltage();
        inputs.currentAmps = new double[] {motor.getOutputCurrent()};
        inputs.temperatureCelsius = new double[] {motor.getMotorTemperature()};`;
        setVoltageBody = `        motor.setVoltage(volts);`;
        stopBody = `        motor.stopMotor();`;
    }

    return `package frc.robot.subsystems.${name.toLowerCase()};

${imports}

/**
 * Real hardware implementation for ${name} using ${config.motor}.
 */
public class ${name}IOReal implements ${name}IO {
${motorField}

    /**
     * Creates a new ${name}IOReal.
     *
     * @param canId the CAN bus ID of the ${config.motor}
     */
    public ${name}IOReal(int canId) {
${motorInit}
    }

    @Override
    public void updateInputs(${name}IOInputs inputs) {
${updateBody}
    }

    @Override
    public void setVoltage(double volts) {
${setVoltageBody}
    }

    @Override
    public void stop() {
${stopBody}
    }
}
`;
}

function generateIOSim(name: string, config: MechanismConfig): string {
    const u = getUnits(config.type);
    const simClass = config.type === 'flywheel'
        ? 'FlywheelSim'
        : config.type === 'linear'
            ? 'ElevatorSim'
            : 'SingleJointedArmSim';

    return `package frc.robot.subsystems.${name.toLowerCase()};

import edu.wpi.first.math.system.plant.DCMotor;
import edu.wpi.first.wpilibj.simulation.*;

/**
 * Simulation implementation for ${name}.
 *
 * <p>Uses WPILib ${simClass} for physics modeling.
 * Replace with dyn4j bodies for higher fidelity if needed.
 */
public class ${name}IOSim implements ${name}IO {
    // TODO: Replace with actual ${simClass} instance and configure parameters
    private double appliedVolts = 0.0;
    private double simPosition = 0.0;
    private double simVelocity = 0.0;

    public ${name}IOSim() {
        // TODO: Initialize ${simClass} with physical parameters from Constants
    }

    @Override
    public void updateInputs(${name}IOInputs inputs) {
        // TODO: Step the sim model forward by 0.020s
        inputs.${u.pos} = simPosition;
        inputs.${u.vel} = simVelocity;
        inputs.appliedVolts = appliedVolts;
        inputs.currentAmps = new double[] {0.0};
        inputs.temperatureCelsius = new double[] {25.0};
    }

    @Override
    public void setVoltage(double volts) {
        appliedVolts = volts;
        // TODO: Apply voltage to sim model
    }

    @Override
    public void stop() {
        appliedVolts = 0.0;
    }
}
`;
}

function generateSubsystemClass(name: string, config: MechanismConfig): string {
    const u = getUnits(config.type);
    const sysIdBlock = config.includeSysId ? `
    /**
     * Returns a command that runs a SysId quasistatic characterization routine.
     *
     * @param direction the direction to run the routine
     * @return the characterization command
     */
    public Command sysIdQuasistatic(SysIdRoutine.Direction direction) {
        return sysIdRoutine.quasistatic(direction);
    }

    /**
     * Returns a command that runs a SysId dynamic characterization routine.
     *
     * @param direction the direction to run the routine
     * @return the characterization command
     */
    public Command sysIdDynamic(SysIdRoutine.Direction direction) {
        return sysIdRoutine.dynamic(direction);
    }
` : '';

    const sysIdImports = config.includeSysId
        ? `import edu.wpi.first.wpilibj2.command.Command;
import edu.wpi.first.wpilibj2.command.sysid.SysIdRoutine;
import edu.wpi.first.units.Units;
`
        : '';

    const sysIdField = config.includeSysId
        ? `    private final SysIdRoutine sysIdRoutine;
`
        : '';

    const sysIdInit = config.includeSysId
        ? `
        sysIdRoutine = new SysIdRoutine(
            new SysIdRoutine.Config(),
            new SysIdRoutine.Mechanism(
                (voltage) -> io.setVoltage(voltage.in(Units.Volts)),
                null, // Use AdvantageKit logging instead of WPILib default log
                this
            )
        );`
        : '';

    return `package frc.robot.subsystems.${name.toLowerCase()};

import edu.wpi.first.wpilibj2.command.SubsystemBase;
import org.littletonrobotics.junction.Logger;
${sysIdImports}
/**
 * ${name} subsystem with AdvantageKit IO abstraction.
 *
 * <p>Supports hardware, simulation, and replay modes via the IO interface pattern.
 */
public class ${name} extends SubsystemBase {
    private final ${name}IO io;
    private final ${name}IOInputsAutoLogged inputs = new ${name}IOInputsAutoLogged();
${sysIdField}
    /**
     * Creates a new ${name} subsystem.
     *
     * @param io the hardware IO implementation (real, sim, or replay)
     */
    public ${name}(${name}IO io) {
        this.io = io;${sysIdInit}
    }

    @Override
    public void periodic() {
        io.updateInputs(inputs);
        Logger.processInputs("${name}", inputs);
    }

    /** Run open loop at the specified voltage. */
    public void setVoltage(double volts) {
        io.setVoltage(volts);
    }

    /** Stop the mechanism immediately. */
    public void stop() {
        io.stop();
    }

    /** Returns the current position in ${u.posUnit}. */
    public double getPosition() {
        return inputs.${u.pos};
    }

    /** Returns the current velocity in ${u.velUnit}. */
    public double getVelocity() {
        return inputs.${u.vel};
    }
${sysIdBlock}}
`;
}
