import { scenarioFixtures } from '../data/demo-scenarios'
import type { DemoAlert } from '../types/alert'
import type { DemoRoute } from '../types/evacuation'
import type { DemoLocation } from '../types/location'
import type { SafePlace } from '../types/safe-place'
import type { SeismicEvent } from '../types/seismic'
import type { ScenarioId } from '../types/risk'

/** Demo-only adapter. Replace with future API service implementations; no HTTP calls occur here. */
export const demoCommandService = {
  assessment(location: DemoLocation, scenarioId: ScenarioId) {
    const scenario = scenarioFixtures[scenarioId]
    const terrain = { elevation: location.elevation, slope: location.id === 'rishikesh' ? 18 : location.id === 'nainital' ? 29 : 34, aspect: 'South-east', soilMoisture: Math.min(96, scenario.weather.humidity - 5), riverDistance: location.id === 'rishikesh' ? 280 : 400, drainage: scenarioId === 'normal' ? 'Stable' : 'Rapid runoff watch', historical: location.id === 'dehradun' ? 'Seasonal exposure' : 'Historical context pending', exposure: scenario.riskLevel === 'CRITICAL' ? 'Elevated' : 'Monitoring' }
    return { ...scenario, location, terrain, warning: `${scenario.riskLevel} flood risk — simulation`, predictionStatus: null, reason: null, missingFeatures: [], modelVersion: null, modelStatus: 'Not connected — demo scenario logic only', contributingFactors: [], explanation: null, historical: null, disclaimer: null }
  },
  safePlaces(location: DemoLocation): SafePlace[] {
    return [
      { id: `${location.id}-relief`, name: `${location.name} Community Relief Centre`, category: 'Relief centre', distanceKm: 2.1, elevationM: location.elevation + 350, status: 'Available', accessibility: 'Illustrative access status', latitude: location.latitude + 0.018, longitude: location.longitude + 0.014 },
      { id: `${location.id}-school`, name: `${location.name} Assembly School`, category: 'Designated shelter', distanceKm: 3.4, elevationM: location.elevation + 190, status: 'Monitor access', accessibility: 'Verify with authorities', latitude: location.latitude - 0.012, longitude: location.longitude + 0.021 },
      { id: `${location.id}-hall`, name: `${location.name} Community Hall`, category: 'Emergency assembly point', distanceKm: 4.2, elevationM: location.elevation + 270, status: 'Available', accessibility: 'Illustrative access status', latitude: location.latitude + 0.027, longitude: location.longitude - 0.017 },
    ]
  },
  alerts(location: DemoLocation, scenarioId: ScenarioId): DemoAlert[] {
    const scenario = scenarioFixtures[scenarioId]
    const severity = scenario.riskLevel === 'CRITICAL' ? 'CRITICAL' : scenario.riskLevel === 'HIGH' ? 'HIGH' : scenario.riskLevel === 'MODERATE' ? 'WATCH' : 'INFO'
    return [{ id: 'risk', severity, title: `Flood risk ${scenario.riskLevel === 'LOW' ? 'status' : 'increased'}`, timestamp: 'Simulation update · 09:30 IST', reason: scenario.factors.join(' + '), action: scenario.action, location: location.name }, { id: 'terrain', severity: 'WATCH', title: 'Terrain and runoff watch', timestamp: 'Simulation update · 09:30 IST', reason: 'Terrain indicators are illustrative demo values.', action: 'Review the terrain and map panels for context.', location: location.name }]
  },
  seismic(location: DemoLocation): SeismicEvent[] { return [{ id: 'seismic-demo-1', magnitude: 4.8, depthKm: 12, distanceKm: 48, time: 'Simulation record · 08:45 IST', latitude: location.latitude + 0.23, longitude: location.longitude + 0.18, status: 'MONITORING', note: 'Illustrative event for secondary-hazard awareness.' }] },
  route(location: DemoLocation, safePlace: SafePlace): DemoRoute { return { id: 'demo-route', destinationId: safePlace.id, distanceKm: safePlace.distanceKm, destinationElevationM: safePlace.elevationM, status: 'Illustrative route', warning: 'Suggested lower-risk route based on available demo data; not guaranteed safe.', reason: 'Higher elevation and demonstration hazard avoidance.', coordinates: [[location.latitude, location.longitude], [location.latitude + 0.006, location.longitude + 0.005], [safePlace.latitude, safePlace.longitude]] } },
}
