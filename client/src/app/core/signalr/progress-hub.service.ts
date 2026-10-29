import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, share } from 'rxjs';
import { API_URL } from '../config';
import { JobAccepted, JobProgress, JobResult, ReadingsSummary, ServerMetric } from '../models';
import { HubClient } from './hub-client';

@Injectable({ providedIn: 'root' })
export class ProgressHubService extends HubClient {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_URL);

  readonly progress$ = this.on<JobProgress>('JobProgress').pipe(share());
  readonly completed$ = this.on<JobResult>('JobCompleted').pipe(share());

  constructor() {
    super('/hubs/progress');
  }

  /** Starts a job over plain HTTP; progress comes back over SignalR. */
  startJob(name: string, totalSteps: number): Observable<JobAccepted> {
    return this.http.post<JobAccepted>(`${this.api}/api/jobs`, { name, totalSteps });
  }

  /** Server -> client stream. Unsubscribe to stop it. */
  metrics(intervalMs = 1000): Observable<ServerMetric> {
    return this.stream<ServerMetric>('StreamMetrics', intervalMs);
  }

  /** Client -> server stream. Completes when the server returns the summary. */
  uploadReadings(readings$: Observable<number>): Observable<ReadingsSummary> {
    return this.upload<ReadingsSummary, number>('UploadReadings', readings$);
  }
}
