// Minimal type declarations for @3d-dice/dice-box (no official types shipped).
declare module '@3d-dice/dice-box' {
  export interface DiceBoxConfig {
    assetPath: string;
    id?: string;
    gravity?: number;
    mass?: number;
    friction?: number;
    restitution?: number;
    angularDamping?: number;
    linearDamping?: number;
    spinForce?: number;
    throwForce?: number;
    startingHeight?: number;
    settleTimeout?: number;
    offscreen?: boolean;
    scale?: number;
    lightIntensity?: number;
    theme?: string;
    themeColor?: string;
    onRollComplete?: (results: DieResult[]) => void;
    onDieComplete?: (result: DieResult) => void;
    onBeforeRoll?: () => void;
  }

  export interface DieResult {
    sides: number;
    value: number;
  }

  export default class DiceBox {
    constructor(selector: string, config: DiceBoxConfig);
    init(): Promise<void>;
    roll(notation: string | DiceNotation[]): Promise<DieResult[]>;
    clear(): void;
    hide(): void;
    show(): void;
  }

  export interface DiceNotation {
    qty?: number;
    sides: number;
    theme?: string;
    themeColor?: string;
  }
}
