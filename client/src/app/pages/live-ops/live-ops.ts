import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { EMPTY, interval, map, merge, scan, switchMap, take } from 'rxjs';
import { JobProgress, JobResult, ReadingsSummary } from '../../core/models';
import { hubErrorMessage } from '../../core/signalr/hub-client';
import { ProgressHubService } from '../../core/signalr/progress-hub.service';
import { ConnectionBadge } from '../../shared/connection-badge';

interface JobView { jobId: string; name: string; percent: number; status: string; done: boolean; ok?: boolean; }

@Component({
  selector: 'app-live-ops',
  imports: [ReactiveFormsModule, DecimalPipe, ConnectionBadge],
  template: `
    <div class="grid gap-4 lg:grid-cols-2">
      <!-- Jobs: HTTP to start, SignalR (IHubContext) for progress -->
      <section class="rounded-2xl bg-white p-5 shadow">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold">Background jobs</h2>
          <app-connection-badge label="Progress" [state]="hub.state()" />
        </div>
        <form [formGroup]="jobForm" (ngSubmit)="startJob()" class="mb-4 flex gap-2">
          <input formControlName="name" placeholder="Job name" class="flex-1 rounded-lg border border-slate-300 px-3 py-2" />
          <input formControlName="steps" type="number" min="1" max="100" class="w-20 rounded-lg border border-slate-300 px-3 py-2" />
          <button class="rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-50" [disabled]="jobForm.invalid">Start</button>
        </form>
        @for (job of jobs(); track job.jobId) {
          <div class="mb-3">
            <div class="mb-1 flex justify-between text-sm">
              <span class="font-medium">{{ job.name }}</span>
              <span [class]="job.done ? (job.ok ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-500'">
                {{ job.done ? (job.ok ? 'Completed' : 'Failed') : job.status }}
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full bg-indigo-500 transition-all duration-300" [style.width.%]="job.percent"></div>
            </div>
          </div>
        } @empty { <p class="text-sm text-slate-400">No jobs yet. Start one - open a second tab to see both tabs update.</p> }
      </section>

      <!-- Server -> client streaming -->
      <section class="rounded-2xl bg-white p-5 shadow">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold">Live metrics (stream)</h2>
          <button class="rounded-lg px-4 py-2 text-white" [class]="streaming() ? 'bg-rose-600' : 'bg-emerald-600'"
                  (click)="streaming.set(!streaming())">
            {{ streaming() ? 'Stop stream' : 'Start stream' }}
          </button>
        </div>
        @if (latest(); as m) {
          <div class="mb-4 grid grid-cols-3 gap-3 text-center">
            <div class="rounded-xl bg-slate-50 p-3"><p class="text-xs text-slate-500">CPU</p><p class="text-xl font-semibold">{{ m.cpuPercent | number: '1.1-1' }}%</p></div>
            <div class="rounded-xl bg-slate-50 p-3"><p class="text-xs text-slate-500">Chat connections</p><p class="text-xl font-semibold">{{ m.activeConnections }}</p></div>
            <div class="rounded-xl bg-slate-50 p-3"><p class="text-xs text-slate-500">Hub calls</p><p class="text-xl font-semibold">{{ m.messagesSent }}</p></div>
          </div>
        }
        <div class="flex h-24 items-end gap-1">
          @for (v of cpuHistory(); track $index) {
            <div class="flex-1 rounded-t bg-indigo-400" [style.height.%]="v"></div>
          }
        </div>
      </section>

      <!-- Client -> server streaming -->
      <section class="rounded-2xl bg-white p-5 shadow lg:col-span-2">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">Upload readings (client -> server stream)</h2>
            <p class="text-sm text-slate-500">Sends 20 random values, one every 100 ms, then the server returns a summary.</p>
          </div>
          <button class="rounded-lg bg-indigo-600 px-4 py-2 text-white" (click)="upload()">Upload</button>
        </div>
        @if (summary(); as s) {
          <p class="mt-3 text-sm">Count {{ s.count }} · Min {{ s.min | number: '1.1-1' }} · Max {{ s.max | number: '1.1-1' }} · Avg {{ s.average }}</p>
        }
      </section>
      @if (error()) { <p class="text-sm text-rose-600 lg:col-span-2">{{ error() }}</p> }
    </div>
  `,
})
export class LiveOps {
  protected readonly hub = inject(ProgressHubService);
  protected readonly error = signal<string | null>(null);
  protected readonly streaming = signal(false);
  protected readonly summary = signal<ReadingsSummary | null>(null);

  protected readonly jobForm = new FormGroup({
    name: new FormControl('Import patients.xlsx', { nonNullable: true, validators: [Validators.required] }),
    steps: new FormControl(10, { nonNullable: true, validators: [Validators.min(1), Validators.max(100)] }),
  });

  /** Reduce progress + completion events into a map keyed by jobId. */
  protected readonly jobs = toSignal(
    merge(
      this.hub.progress$.pipe(
        map((p: JobProgress) => ({
          jobId: p.jobId,
          apply: (prev?: JobView): JobView => ({ jobId: p.jobId, name: p.name, percent: p.percent, status: p.status, done: prev?.done ?? false }),
        })),
      ),
      this.hub.completed$.pipe(
        map((r: JobResult) => ({
          jobId: r.jobId,
          apply: (prev?: JobView): JobView => ({ jobId: r.jobId, name: r.name, percent: r.succeeded ? 100 : (prev?.percent ?? 0), status: r.error ?? 'Done', done: true, ok: r.succeeded }),
        })),
      ),
    ).pipe(
      scan((byId, e) => new Map(byId).set(e.jobId, e.apply(byId.get(e.jobId))), new Map<string, JobView>()),
      map((byId) => [...byId.values()].reverse()),
    ),
    { initialValue: [] as JobView[] },
  );

  /** switchMap on the toggle: turning it off unsubscribes -> server stream is cancelled. */
  private readonly metric$ = toObservable(this.streaming).pipe(switchMap((on) => (on ? this.hub.metrics(1000) : EMPTY)));
  protected readonly latest = toSignal(this.metric$);
  protected readonly cpuHistory = toSignal(
    this.metric$.pipe(scan((h, m) => [...h, m.cpuPercent].slice(-30), [] as number[])),
    { initialValue: [] as number[] },
  );

  constructor() {
    this.hub.start().pipe(takeUntilDestroyed()).subscribe({ error: (e) => this.error.set(`Connection failed: ${hubErrorMessage(e)}`) });
  }

  startJob(): void {
    const { name, steps } = this.jobForm.getRawValue();
    this.hub.startJob(name, steps).subscribe({ error: () => this.error.set('Could not start the job.') });
  }

  upload(): void {
    const readings$ = interval(100).pipe(take(20), map(() => Math.round(Math.random() * 1000) / 10));
    this.hub.uploadReadings(readings$).subscribe({
      next: (s) => this.summary.set(s),
      error: (e) => this.error.set(hubErrorMessage(e)),
    });
  }
}
