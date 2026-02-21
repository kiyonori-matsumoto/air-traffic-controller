/**
 * PID (Proportional-Integral-Derivative) コントローラ
 * 制御対象の値を目標値（セットポイント）に近づけるためのフィードバック制御を行います。
 * オートパイロットの高度維持や進路維持などに使用されます。
 */
export class PIDController {
  /** 比例ゲイン (Proportional Gain): 現在の偏差に比例して出力を決定します。値が大きいほど反応が速くなりますが、大きすぎると発散（振動）します。 */
  private kp: number;
  /** 積分ゲイン (Integral Gain): 過去の偏差の累積に比例して出力を決定します。目標値とのわずかなズレ（定常偏差）を解消するために重要です。 */
  private ki: number;
  /** 微分ゲイン (Derivative Gain): 偏差の変化率（勢い）に比例して出力を決定します。変化を予測してブレーキをかける役割をし、オーバーシュートを抑えて安定させます。 */
  private kd: number;

  /** 出力の最小値（物理的な制限など） */
  private minOutput: number;
  /** 出力の最大値（物理的な制限など） */
  private maxOutput: number;

  /** 誤差の積分値（過去の誤差の積み出し） */
  private integral: number = 0;
  /** 前回の誤差（微分計算 = 変化率の算出に使用） */
  private prevError: number = 0;

  /**
   * PIDコントローラのインスタンスを生成します。
   * @param kp 比例ゲイン
   * @param ki 積分ゲイン
   * @param kd 微分ゲイン
   * @param minOutput 出力の最小クランプ値
   * @param maxOutput 出力の最大クランプ値
   */
  constructor(
    kp: number,
    ki: number,
    kd: number,
    minOutput: number,
    maxOutput: number,
  ) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
    this.minOutput = minOutput;
    this.maxOutput = maxOutput;
  }

  /**
   * 現在の誤差に基づいて制御出力を計算します。
   * @param error 現在の誤差 (目標値 - 現在値)
   * @param dt 前回からの経過時間（秒）
   * @returns 計算された出力値 (minOutputからmaxOutputの範囲に制限されます)
   */
  public update(error: number, dt: number): number {
    if (dt <= 0) return 0;

    // P (Proportional): 比例項。現在の誤差に単純に比例して直そうとします。
    const p = this.kp * error;

    // I (Integral): 積分項。過去の誤差を積み上げ、目標に届かない「わずかなズレ」をじわじわ直します。
    this.integral += error * dt;
    const i = this.ki * this.integral;

    // D (Derivative): 微分項。誤差の変化の勢いを見て、行き過ぎ（オーバーシュート）を防ぐブレーキの役割をします。
    const derivative = (error - this.prevError) / dt;
    const d = this.kd * derivative;

    this.prevError = error;

    let output = p + i + d;

    // Clamping & Anti-Windup
    // 出力が最大/最小を超えないようにクランプします。
    if (output > this.maxOutput) {
      output = this.maxOutput;
      // メモ: ここで積分値の増加を止めるなどのアンチワインドアップ処理を入れるとより安定します。
    } else if (output < this.minOutput) {
      output = this.minOutput;
    }

    return output;
  }

  /**
   * コントローラの内部状態（積分値、前回誤差）をリセットします。
   * 制御対象が変わった際や、長時間停止した後に制御を再開する場合に呼び出します。
   */
  public reset() {
    this.integral = 0;
    this.prevError = 0;
  }
}
