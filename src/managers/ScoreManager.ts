export class ScoreManager {
  private score: number = 0;
  private safeLandings: number = 0;
  private successfulHandoffs: number = 0;
  private separationViolations: number = 0;
  private nearMisses: number = 0;

  // Constants
  private readonly POINTS_LANDING = 100;
  private readonly POINTS_HANDOFF = 50;
  private readonly PENALTY_SEPARATION = 200;
  private readonly PENALTY_NEAR_MISS = 500;

  constructor(private onScoreChange: (score: number) => void) {}

  public addLandingScore(efficiencyBonus: number = 0) {
    const points = this.POINTS_LANDING + efficiencyBonus;
    this.score += points;
    this.safeLandings++;
    this.onScoreChange(this.score);
  }

  public addHandoffScore() {
    this.score += this.POINTS_HANDOFF;
    this.successfulHandoffs++;
    this.onScoreChange(this.score);
  }

  public reportSeparationViolation() {
    this.score -= this.PENALTY_SEPARATION;
    this.separationViolations++;
    this.onScoreChange(this.score);
  }

  public reportNearMiss() {
    this.score -= this.PENALTY_NEAR_MISS;
    this.nearMisses++;
    this.onScoreChange(this.score);
  }

  public getScore(): number {
    return this.score;
  }

  public getStats() {
    return {
      score: this.score,
      safeLandings: this.safeLandings,
      successfulHandoffs: this.successfulHandoffs,
      separationViolations: this.separationViolations,
      nearMisses: this.nearMisses,
    };
  }
}
