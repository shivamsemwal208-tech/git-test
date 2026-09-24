import type { DemoAssessment, ScenarioId } from '../types/risk'

export const scenarioOptions: Array<{ id: ScenarioId; label: string; detail: string }> = [
  { id: 'normal', label: 'Normal', detail: 'Low rainfall and stable ground conditions' },
  { id: 'heavy-rain', label: 'Heavy Rain', detail: 'Sustained rainfall requires monitoring' },
  { id: 'extreme-rain', label: 'Extreme Rain', detail: 'Rapid runoff conditions are building' },
  { id: 'critical-flood', label: 'Critical Flood', detail: 'Saturated terrain and intense rainfall' },
]

const sharedTerrain = [
  { label: 'Elevation', value: '1,450 m', detail: 'Terrain baseline', icon: 'mountain' as const },
  { label: 'Slope', value: '34°', detail: 'Steep terrain', icon: 'triangle' as const },
  { label: 'Distance to river', value: '400 m', detail: 'River corridor', icon: 'route' as const },
]

export const demoAssessments: Record<ScenarioId, DemoAssessment> = {
  normal: {
    scenarioId: 'normal', scenarioLabel: 'Normal', location: 'Dehradun, Uttarakhand', coordinates: '30.3165° N, 78.0322° E', probability: 18, riskLevel: 'LOW',
    summary: 'Conditions are currently stable in this simulated scenario.', warningTitle: 'Normal monitoring status', warningAction: 'Continue to monitor official weather and local authority updates.', updatedAt: 'Demo scenario · 10 Sep 2026, 09:30 IST',
    weatherMetrics: [
      { label: 'Current rainfall', value: '6 mm/h', detail: 'Light rainfall', icon: 'rain' },
      { label: 'Rainfall · 3h', value: '18 mm', detail: 'Accumulated rainfall', icon: 'cloud-rain' },
      { label: 'Rainfall · 24h', value: '42 mm', detail: 'Accumulated rainfall', icon: 'cloud-rain' },
      { label: 'Forecast rainfall', value: '12 mm', detail: 'Next 6 hours', icon: 'rain' },
    ],
    terrainMetrics: [...sharedTerrain, { label: 'Soil moisture', value: '42%', detail: 'Moderate moisture', icon: 'droplets' }],
    riskFactors: [
      { title: 'Light rainfall', description: 'Recent rainfall is below the simulated alert threshold.', severity: 'watch' },
      { title: 'Stable soil condition', description: 'Soil moisture remains within a moderate range.', severity: 'watch' },
    ],
  },
  'heavy-rain': {
    scenarioId: 'heavy-rain', scenarioLabel: 'Heavy Rain', location: 'Dehradun, Uttarakhand', coordinates: '30.3165° N, 78.0322° E', probability: 51, riskLevel: 'MODERATE',
    summary: 'Sustained rainfall is increasing surface runoff in this simulated scenario.', warningTitle: 'Heightened rainfall watch', warningAction: 'Avoid riverbanks where possible and monitor official weather updates.', updatedAt: 'Demo scenario · 10 Sep 2026, 09:30 IST',
    weatherMetrics: [
      { label: 'Current rainfall', value: '38 mm/h', detail: 'Heavy rainfall', icon: 'rain' },
      { label: 'Rainfall · 3h', value: '94 mm', detail: 'Accumulated rainfall', icon: 'cloud-rain' },
      { label: 'Rainfall · 24h', value: '146 mm', detail: 'Accumulated rainfall', icon: 'cloud-rain' },
      { label: 'Forecast rainfall', value: '54 mm', detail: 'Next 6 hours', icon: 'rain' },
    ],
    terrainMetrics: [...sharedTerrain, { label: 'Soil moisture', value: '67%', detail: 'Increasing moisture', icon: 'droplets' }],
    riskFactors: [
      { title: 'Sustained rainfall', description: 'Accumulated rainfall is elevated in the simulated input.', severity: 'elevated' },
      { title: 'Heavy forecast rainfall', description: 'Additional rainfall may intensify runoff conditions.', severity: 'elevated' },
      { title: 'Steep terrain', description: 'Slope can accelerate water movement downhill.', severity: 'watch' },
    ],
  },
  'extreme-rain': {
    scenarioId: 'extreme-rain', scenarioLabel: 'Extreme Rain', location: 'Dehradun, Uttarakhand', coordinates: '30.3165° N, 78.0322° E', probability: 74, riskLevel: 'HIGH',
    summary: 'Intense rainfall and wet ground could lead to rapid runoff in this simulated scenario.', warningTitle: 'High flash-flood risk', warningAction: 'Avoid low-lying areas and river channels. Follow official local guidance.', updatedAt: 'Demo scenario · 10 Sep 2026, 09:30 IST',
    weatherMetrics: [
      { label: 'Current rainfall', value: '68 mm/h', detail: 'Extreme rainfall', icon: 'rain' },
      { label: 'Rainfall · 3h', value: '142 mm', detail: 'Accumulated rainfall', icon: 'cloud-rain' },
      { label: 'Rainfall · 24h', value: '276 mm', detail: 'Accumulated rainfall', icon: 'cloud-rain' },
      { label: 'Forecast rainfall', value: '96 mm', detail: 'Next 6 hours', icon: 'rain' },
    ],
    terrainMetrics: [...sharedTerrain, { label: 'Soil moisture', value: '84%', detail: 'High saturation', icon: 'droplets' }],
    riskFactors: [
      { title: 'Extreme rainfall', description: 'Current simulated intensity may create rapid runoff.', severity: 'major' },
      { title: 'High soil moisture', description: 'Wet ground has less capacity to absorb additional rain.', severity: 'major' },
      { title: 'Close to river', description: 'The selected area is within the simulated river-corridor watch area.', severity: 'elevated' },
    ],
  },
  'critical-flood': {
    scenarioId: 'critical-flood', scenarioLabel: 'Critical Flood', location: 'Dehradun, Uttarakhand', coordinates: '30.3165° N, 78.0322° E', probability: 87, riskLevel: 'CRITICAL',
    summary: 'Intense rainfall, saturated soil, steep terrain, and river proximity combine in this simulated scenario.', warningTitle: 'Critical flood risk', warningAction: 'Avoid low-lying areas and river channels. Follow official emergency instructions immediately.', updatedAt: 'Demo scenario · 10 Sep 2026, 09:30 IST',
    weatherMetrics: [
      { label: 'Current rainfall', value: '82 mm/h', detail: 'Extreme rainfall', icon: 'rain' },
      { label: 'Rainfall · 3h', value: '160 mm', detail: 'Accumulated rainfall', icon: 'cloud-rain' },
      { label: 'Rainfall · 24h', value: '318 mm', detail: 'Accumulated rainfall', icon: 'cloud-rain' },
      { label: 'Forecast rainfall', value: '118 mm', detail: 'Next 6 hours', icon: 'rain' },
    ],
    terrainMetrics: [...sharedTerrain, { label: 'Soil moisture', value: '91%', detail: 'Near saturation', icon: 'droplets' }],
    riskFactors: [
      { title: 'Extreme rainfall', description: 'Very high simulated rainfall can produce rapid surface runoff.', severity: 'major' },
      { title: 'Saturated soil', description: 'Near-saturated ground has limited capacity to absorb water.', severity: 'major' },
      { title: 'Steep terrain', description: 'A 34° slope can accelerate runoff toward lower areas.', severity: 'elevated' },
      { title: 'Close to river', description: 'River proximity increases exposure if water levels rise quickly.', severity: 'elevated' },
    ],
  },
}
