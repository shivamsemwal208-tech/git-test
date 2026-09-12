export interface WeatherSnapshot { temperature: number; humidity: number; currentRainfall: number; rainfall1h: number; rainfall3h: number; rainfall6h: number; rainfall24h: number; forecastRainfall: number; precipitationProbability: number; windSpeed: number; windDirection: string; pressure: number; hourlyRainfall: number[] }

/**
 * Risk-assessment weather as consumed by the command UI. Values are nullable
 * because live provider values (and the ML windows) are honestly unavailable
 * until measured — a missing value is shown as "Unavailable", never as 0.
 */
export interface CommandWeatherValue {
  temperature: number | null
  humidity: number | null
  currentRainfall: number | null
  rainfall1h: number | null
  rainfall3h: number | null
  rainfall6h: number | null
  rainfall24h: number | null
  /** ML/augmented windows — present on live ML risk responses, absent from demo fixtures. */
  rainfall72h?: number | null
  rainfall7d?: number | null
  antecedentRainfall7d?: number | null
  forecastRainfall: number | null
  precipitationProbability: number | null
  windSpeed: number | null
  windDirection: string | null
  pressure: number | null
  soilMoisture?: number | null
  soilMoisture0to7cm?: number | null
  hourlyRainfall: number[] | null
}
