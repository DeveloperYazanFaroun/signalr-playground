import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, forkJoin, map, merge, of, share, switchMap, tap } from 'rxjs';
import { ChatMessage, PrivateMessage, SystemNotice, TypingEvent } from '../models';
import { HubClient } from './hub-client';

@Injectable({ providedIn: 'root' })
export class ChatHubService extends HubClient {
  // ---- server -> client events (shared so many subscribers = one handler) ----
  readonly messages$ = this.on<ChatMessage>('ReceiveMessage').pipe(share());
  readonly privateMessages$ = this.on<PrivateMessage>('ReceivePrivate').pipe(share());
  readonly notices$ = this.on<SystemNotice>('SystemNotice').pipe(share());
  readonly typing$ = this.on<[string, string]>('UserTyping', true).pipe(
    map(([room, user]): TypingEvent => ({ room, user })),
    share(),
  );

  // ---- state kept by the service ----
  private readonly joined = signal<ReadonlySet<string>>(new Set());
  readonly joinedRooms = this.joined.asReadonly();
  readonly onlineUsers = signal<string[]>([]);

  constructor() {
    super('/hubs/chat', { statefulReconnect: true });

    const presence$ = merge(
      this.on<string[]>('OnlineUsers').pipe(map((users) => () => users)),
      this.on<string>('UserOnline').pipe(map((u) => (list: string[]) => [...new Set([...list, u])].sort())),
      this.on<string>('UserOffline').pipe(map((u) => (list: string[]) => list.filter((x) => x !== u))),
    );

    presence$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((update) => this.onlineUsers.update(update));

    // A reconnect usually means a NEW connection id -> group membership is gone. Rejoin.
    this.reconnected$
      .pipe(
        switchMap(() => this.rejoinAll()),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe();
  }

  joinRoom(room: string): Observable<void> {
    return this.invoke('JoinRoom', room).pipe(
      tap(() => this.joined.update((s) => new Set(s).add(room))),
    );
  }

  leaveRoom(room: string): Observable<void> {
    return this.invoke('LeaveRoom', room).pipe(
      tap(() =>
        this.joined.update((s) => {
          const next = new Set(s);
          next.delete(room);
          return next;
        }),
      ),
    );
  }

  /** invoke() -> we get the saved message back as an acknowledgement. */
  sendToRoom(room: string, text: string): Observable<ChatMessage> {
    return this.invoke<ChatMessage>('SendToRoom', room, text);
  }

  sendPrivate(toUser: string, text: string): Observable<void> {
    return this.invoke('SendPrivate', toUser, text);
  }

  typing(room: string): Observable<void> {
    return this.send('Typing', room);
  }

  broadcast(text: string): Observable<void> {
    return this.invoke('Broadcast', text);
  }

  private rejoinAll(): Observable<unknown> {
    const rooms = [...this.joined()];
    return rooms.length ? forkJoin(rooms.map((r) => this.invoke('JoinRoom', r))) : of(null);
  }
}
