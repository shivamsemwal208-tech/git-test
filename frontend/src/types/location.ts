export type LocationStatus = 'DEMO' | 'ARBITRARY';

export interface DemoLocation {
  id: string;
  name: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  elevation: number;
  status: LocationStatus;
}
