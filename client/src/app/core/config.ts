import { InjectionToken } from '@angular/core';

/** Base URL of RealTime.Api. In CareConnect this would be the Ocelot gateway URL. */
export const API_URL = new InjectionToken<string>('API_URL', {
  providedIn: 'root',
  factory: () => 'http://localhost:5000',
});
