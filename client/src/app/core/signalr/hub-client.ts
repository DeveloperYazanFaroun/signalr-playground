import { inject, isDevMode } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  Subject as SignalRSubject,
} from '@microsoft/signalr';
import {
  BehaviorSubject,
  Observable,
  Subject,
  catchError,
  defer,
  from,
  of,
  retry,
  tap,
  throwError,
  timer,
} from 'rxjs';
import { AuthService } from '../auth.service';
import { API_URL } from '../config';

export interface HubClientOptions {
  /** Ask the server to buffer & replay messages during short disconnects (.NET 8+). */
  statefulReconnect?: boolean;
}

/**
 * Reusable RxJS wrapper around a SignalR HubConnection.
 *  - on<T>()     : server -> client events as Observables (handler removed on unsubscribe)
 *  - invoke<T>() : client -> server call that returns a value (Observable)
 *  - send()      : fire-and-forget client -> server call
 *  - stream<T>() : server -> client streaming as an Observable (disposed on unsubscribe)
 *  - state       : connection state as Observable AND Signal
 */
export abstract class HubClient {
  private readonly auth = inject(AuthService);
  private readonly apiUrl = inject(API_URL);

  protected readonly connection: HubConnection;

  private readonly stateSubject = new BehaviorSubject<HubConnectionState>(HubConnectionState.Disconnected);
  private readonly reconnectedSubject = new Subject<string | undefined>();

  readonly state$ = this.stateSubject.asObservable();
  readonly state = toSignal(this.state$, { requireSync: true });
  /** Emits after an automatic reconnect. Groups are lost on reconnect - rejoin here! */
  readonly reconnected$ = this.reconnectedSubject.asObservable();

  protected constructor(hubPath: string, options: HubClientOptions = {}) {
    let builder = new HubConnectionBuilder()
      .withUrl(`${this.apiUrl}${hubPath}`, {
        // Called on every (re)connect, so a refreshed token is always used.
        accessTokenFactory: () => this.auth.token() ?? '',
      })
      // Retry delays (ms) after the connection is LOST. null/end of array = give up.
      .withAutomaticReconnect([0, 2_000, 5_000, 10_000, 30_000])
      .withServerTimeout(30_000) // must match server ClientTimeoutInterval
      .withKeepAliveInterval(15_000) // must match server KeepAliveInterval
      .configureLogging(isDevMode() ? LogLevel.Information : LogLevel.Warning);

    if (options.statefulReconnect) builder = builder.withStatefulReconnect();

    this.connection = builder.build();

    this.connection.onreconnecting(() => this.stateSubject.next(HubConnectionState.Reconnecting));
    this.connection.onreconnected((id) => {
      this.stateSubject.next(HubConnectionState.Connected);
      this.reconnectedSubject.next(id);
    });
    this.connection.onclose(() => this.stateSubject.next(HubConnectionState.Disconnected));
  }

  /**
   * Starts the connection. withAutomaticReconnect() does NOT cover the first start,
   * so we retry it ourselves with exponential back-off.
   */
  start(): Observable<void> {
    if (this.connection.state !== HubConnectionState.Disconnected) return of(void 0);

    this.stateSubject.next(HubConnectionState.Connecting);
    return defer(() => this.connection.start()).pipe(
      retry({ count: 5, delay: (_err, attempt) => timer(Math.min(1_000 * 2 ** attempt, 15_000)) }),
      tap(() => this.stateSubject.next(HubConnectionState.Connected)),
      catchError((err) => {
        this.stateSubject.next(HubConnectionState.Disconnected);
        return throwError(() => err);
      }),
    );
  }

  stop(): Observable<void> {
    return defer(() => this.connection.stop());
  }

  /** Server -> client event. Subscribe BEFORE start() to not miss early messages. */
  protected on<T>(eventName: string): Observable<T>;
  protected on<T extends unknown[]>(eventName: string, multiArgs: true): Observable<T>;
  protected on<T>(eventName: string, multiArgs = false): Observable<T> {
    return new Observable<T>((subscriber) => {
      const handler = (...args: unknown[]) => subscriber.next((multiArgs ? args : args[0]) as T);
      this.connection.on(eventName, handler);
      return () => this.connection.off(eventName, handler);
    });
  }

  /** Client -> server call that waits for the hub method's return value (or HubException). */
  protected invoke<T = void>(methodName: string, ...args: unknown[]): Observable<T> {
    return defer(() => from(this.connection.invoke<T>(methodName, ...args)));
  }

  /** Client -> server call without waiting for completion on the server. */
  protected send(methodName: string, ...args: unknown[]): Observable<void> {
    return defer(() => from(this.connection.send(methodName, ...args)));
  }

  /** Server -> client stream (IAsyncEnumerable / ChannelReader on the server). */
  protected stream<T>(methodName: string, ...args: unknown[]): Observable<T> {
    return new Observable<T>((subscriber) => {
      const subscription = this.connection.stream<T>(methodName, ...args).subscribe({
        next: (value) => subscriber.next(value),
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });
      // Unsubscribing cancels the server-side CancellationToken.
      return () => subscription.dispose();
    });
  }

  /** Client -> server stream: push values from an Observable into a SignalR Subject. */
  protected upload<TResult, TItem>(methodName: string, items$: Observable<TItem>): Observable<TResult> {
    return defer(() => {
      const channel = new SignalRSubject<TItem>();
      const result = this.connection.invoke<TResult>(methodName, channel);
      items$.subscribe({
        next: (item) => channel.next(item),
        error: (err) => channel.error(err),
        complete: () => channel.complete(),
      });
      return from(result);
    });
  }
}

/** Reads the readable message out of a HubException ("...HubException: <message>"). */
export function hubErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const marker = 'HubException: ';
  const i = raw.indexOf(marker);
  return i >= 0 ? raw.slice(i + marker.length) : raw;
}
