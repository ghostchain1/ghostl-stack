/**
 * EnvironmentSystem — Dynamic sky, weather, and ambient environment for Ghost Universe
 *
 * Controls time-of-day cycle, weather patterns, ambient sound cues,
 * and seasonal effects.  State is replicated to all clients in a world zone.
 */

export type WeatherState = 'clear' | 'cloudy' | 'rainy' | 'stormy' | 'foggy' | 'snowy';
export type Season       = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SkyState {
  sunAngleDeg: number;     // 0 = sunrise, 90 = noon, 180 = sunset, 270 = midnight
  ambientLux:  number;     // 0–100000
  skyColor:    string;     // hex
  fogDensity:  number;     // 0.0–1.0
}

export interface EnvironmentSnapshot {
  worldId:     string;
  timeOfDay:   number;     // seconds since midnight (0–86400)
  weather:     WeatherState;
  season:      Season;
  sky:         SkyState;
  temperature: number;     // °C
  windSpeed:   number;     // m/s
  updatedAt:   number;
}

export interface EnvironmentConfig {
  /** In-game seconds per real second (default: 60 = 1 minute real = 1 hour game) */
  timeScale:    number;
  /** Starting time of day in seconds (default: 28800 = 08:00) */
  startTime:    number;
  /** Starting season */
  startSeason:  Season;
  /** Weather change probability per tick (0.0–1.0) */
  weatherVolatility: number;
}

const SEASON_TEMPS: Record<Season, number> = { spring: 15, summer: 28, autumn: 10, winter: -5 };
const SEASON_ORDER: Season[]               = ['spring', 'summer', 'autumn', 'winter'];

// ─── EnvironmentSystem ────────────────────────────────────────────────────────

export class EnvironmentSystem {
  private worldId:  string;
  private cfg:      EnvironmentConfig;
  private time:     number;     // seconds since midnight
  private weather:  WeatherState = 'clear';
  private seasonIdx: number;
  private dayCount: number = 0;
  private timer?:   ReturnType<typeof setInterval>;
  private subs:     ((snap: EnvironmentSnapshot) => void)[] = [];

  constructor(worldId: string, config: EnvironmentConfig) {
    this.worldId   = worldId;
    this.cfg       = config;
    this.time      = config.startTime;
    this.seasonIdx = SEASON_ORDER.indexOf(config.startSeason);
  }

  /** Start the environment simulation. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000);
  }

  /** Stop simulation. */
  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  /** Get a snapshot of the current environment state. */
  snapshot(): EnvironmentSnapshot {
    return {
      worldId:     this.worldId,
      timeOfDay:   this.time,
      weather:     this.weather,
      season:      SEASON_ORDER[this.seasonIdx % 4]!,
      sky:         this.computeSky(),
      temperature: SEASON_TEMPS[SEASON_ORDER[this.seasonIdx % 4]!]!,
      windSpeed:   this.computeWindSpeed(),
      updatedAt:   Date.now(),
    };
  }

  /** Subscribe to environment changes (called every in-game hour). */
  subscribe(fn: (snap: EnvironmentSnapshot) => void): () => void {
    this.subs.push(fn);
    return () => { this.subs = this.subs.filter(s => s !== fn); };
  }

  /** Override weather (e.g. for special events). */
  setWeather(weather: WeatherState): void {
    this.weather = weather;
    this.notify();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private tick(): void {
    const prevHour = Math.floor(this.time / 3600);
    this.time = (this.time + this.cfg.timeScale) % 86400;
    const newHour = Math.floor(this.time / 3600);

    // New in-game day
    if (newHour < prevHour) {
      this.dayCount++;
      if (this.dayCount % 90 === 0) this.seasonIdx++;

      // Potentially change weather
      if (Math.random() < this.cfg.weatherVolatility) {
        this.weather = this.rollWeather();
      }
    }

    // Notify subscribers every in-game hour
    if (newHour !== prevHour) this.notify();
  }

  private notify(): void {
    const snap = this.snapshot();
    for (const fn of this.subs) fn(snap);
  }

  private computeSky(): SkyState {
    const angle  = (this.time / 86400) * 360;
    const noon   = 90;
    const delta  = Math.abs(angle - noon);     // 0 = noon, 90 = dusk/dawn, 180 = midnight
    const t      = 1 - Math.min(delta, 180) / 180;
    const lux    = Math.round(t * 100000);
    const r      = Math.round(10   + t * 135);
    const g      = Math.round(10   + t * 206);
    const b      = Math.round(50   + t * 235);
    const toHex  = (n: number) => Math.min(255, n).toString(16).padStart(2, '0');
    return { sunAngleDeg: angle, ambientLux: lux, skyColor: `#${toHex(r)}${toHex(g)}${toHex(b)}`, fogDensity: this.weather === 'foggy' ? 0.7 : 0.0 };
  }

  private computeWindSpeed(): number {
    const base: Record<WeatherState, number> = { clear: 2, cloudy: 5, rainy: 10, stormy: 25, foggy: 1, snowy: 8 };
    return base[this.weather] ?? 3;
  }

  private rollWeather(): WeatherState {
    const season = SEASON_ORDER[this.seasonIdx % 4]!;
    const weights: [WeatherState, number][] = season === 'winter'
      ? [['clear', 30], ['cloudy', 30], ['snowy', 30], ['stormy', 10]]
      : [['clear', 50], ['cloudy', 25], ['rainy', 15], ['foggy', 7], ['stormy', 3]];

    let roll = Math.random() * 100;
    for (const [w, wt] of weights) {
      roll -= wt;
      if (roll <= 0) return w;
    }
    return 'clear';
  }
}
