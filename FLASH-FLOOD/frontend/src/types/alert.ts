export type AlertSeverity = 'INFO' | 'WATCH' | 'WARNING' | 'HIGH' | 'CRITICAL'
export interface DemoAlert { id: string; severity: AlertSeverity; title: string; timestamp: string; reason: string; action: string; location: string }
