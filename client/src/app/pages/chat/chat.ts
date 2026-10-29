import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  EMPTY, Observable, catchError, concat, filter, groupBy, map, merge, mergeMap, of, scan,
  switchMap, throttleTime, timer,
} from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { ChatHubService } from '../../core/signalr/chat-hub.service';
import { hubErrorMessage } from '../../core/signalr/hub-client';
import { ConnectionBadge } from '../../shared/connection-badge';

type FeedItem =
  | { kind: 'message'; id: string; room: string; from: string; text: string; at: string }
  | { kind: 'notice'; id: string; room: string; text: string; at: string }
  | { kind: 'private'; id: string; from: string; to: string; text: string; at: string };

const ROOMS = ['general', 'dispensing', 'support'];

@Component({
  selector: 'app-chat',
  imports: [ReactiveFormsModule, DatePipe, ConnectionBadge],
  template: `
    <div class="grid h-full grid-cols-[16rem_1fr] gap-4">
      <!-- Sidebar -->
      <aside class="space-y-6 rounded-2xl bg-white p-4 shadow">
        <div><app-connection-badge label="Chat" [state]="hub.state()" /></div>

        <section>
          <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Rooms</h2>
          @for (room of rooms; track room) {
            <div class="flex items-center justify-between rounded-lg px-2 py-1"
                 [class.bg-indigo-50]="room === activeRoom() && !privateTo()">
              <button class="text-left text-slate-800" (click)="openRoom(room)"># {{ room }}</button>
              @if (hub.joinedRooms().has(room)) {
                <button class="text-xs text-rose-600 hover:underline" (click)="leave(room)">leave</button>
              } @else {
                <button class="text-xs text-indigo-600 hover:underline" (click)="join(room)">join</button>
              }
            </div>
          }
        </section>

        <section>
          <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Online ({{ hub.onlineUsers().length }})
          </h2>
          @for (user of hub.onlineUsers(); track user) {
            <button class="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-slate-50"
                    [class.bg-indigo-50]="privateTo() === user"
                    [disabled]="user === me()" (click)="privateTo.set(user)">
              <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
              {{ user }} @if (user === me()) { <span class="text-xs text-slate-400">(you)</span> }
            </button>
          }
        </section>
      </aside>

      <!-- Conversation -->
      <section class="flex min-h-0 flex-col rounded-2xl bg-white shadow">
        <header class="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h1 class="font-semibold text-slate-900">
            {{ privateTo() ? '@ ' + privateTo() + ' (private)' : '# ' + activeRoom() }}
          </h1>
          @if (privateTo()) {
            <button class="text-sm text-indigo-600 hover:underline" (click)="privateTo.set(null)">back to room</button>
          }
        </header>

        <div class="flex-1 space-y-2 overflow-y-auto px-5 py-4">
          @for (item of visibleFeed(); track item.id) {
            @switch (item.kind) {
              @case ('notice') {
                <p class="text-center text-xs text-slate-400">{{ item.text }} · {{ item.at | date: 'shortTime' }}</p>
              }
              @default {
                <div class="max-w-[75%] rounded-xl px-3 py-2"
                     [class]="item.from === me() ? 'ml-auto bg-indigo-600 text-white' : 'bg-slate-100 text-slate-900'">
                  <p class="text-xs opacity-70">{{ item.from }} · {{ item.at | date: 'shortTime' }}</p>
                  <p>{{ item.text }}</p>
                </div>
              }
            }
          } @empty {
            <p class="text-center text-sm text-slate-400">No messages yet.</p>
          }
        </div>

        <footer class="border-t border-slate-100 px-5 py-3">
          <p class="h-5 text-xs italic text-slate-500">
            @if (typingText()) { {{ typingText() }} }
          </p>
          @if (error()) { <p class="mb-2 text-sm text-rose-600">{{ error() }}</p> }
          <form class="flex gap-2" [formGroup]="form" (ngSubmit)="sendMessage()">
            <input formControlName="text" placeholder="Type a message..."
                   class="flex-1 rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
            <button type="submit" [disabled]="hub.state() !== 'Connected'"
                    class="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              Send
            </button>
          </form>
        </footer>
      </section>
    </div>
  `,
  host: { class: 'block h-[calc(100vh-6rem)]' },
})
export class Chat {
  protected readonly hub = inject(ChatHubService);
  protected readonly me = inject(AuthService).userName;

  protected readonly rooms = ROOMS;
  protected readonly activeRoom = signal('general');
  protected readonly privateTo = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly text = new FormControl('', { nonNullable: true });
  protected readonly form = new FormGroup({ text: this.text });

  /** All events merged into one feed (RxJS scan = reducer). */
  private readonly feed = toSignal(
    merge(
      this.hub.messages$.pipe(map((m): FeedItem => ({ kind: 'message', id: m.id, room: m.room, from: m.from, text: m.text, at: m.sentAt }))),
      this.hub.notices$.pipe(map((n): FeedItem => ({ kind: 'notice', id: crypto.randomUUID(), room: n.room, text: n.text, at: n.at }))),
      this.hub.privateMessages$.pipe(map((p): FeedItem => ({ kind: 'private', id: p.id, from: p.from, to: p.to, text: p.text, at: p.sentAt }))),
    ).pipe(scan((all, item) => [...all, item].slice(-500), [] as FeedItem[])),
    { initialValue: [] },
  );

  protected readonly visibleFeed = computed(() => {
    const room = this.activeRoom();
    const other = this.privateTo();
    return this.feed().filter((i) =>
      other
        ? i.kind === 'private' && (i.from === other || i.to === other)
        : i.kind !== 'private' && (i.room === room || i.room === '*'),
    );
  });

  /** Typing indicator: per user, show for 3s after the LAST typing event (groupBy + switchMap). */
  private readonly typers = toSignal(
    toObservable(this.activeRoom).pipe(
      switchMap((room) =>
        this.hub.typing$.pipe(
          filter((t) => t.room === room),
          groupBy((t) => t.user),
          mergeMap((byUser$) =>
            byUser$.pipe(
              switchMap((t) => concat(of({ user: t.user, typing: true }), timer(3000).pipe(map(() => ({ user: t.user, typing: false }))))),
            ),
          ),
          scan((set, e) => {
            const next = new Set(set);
            e.typing ? next.add(e.user) : next.delete(e.user);
            return next;
          }, new Set<string>()),
        ),
      ),
    ),
    { initialValue: new Set<string>() },
  );

  protected readonly typingText = computed(() => {
    const users = [...this.typers()];
    if (users.length === 0) return '';
    return users.length === 1 ? `${users[0]} is typing...` : `${users.join(', ')} are typing...`;
  });

  constructor() {
    // Connect, then join the default room.
    this.hub
      .start()
      .pipe(
        switchMap(() => (this.hub.joinedRooms().has('general') ? EMPTY : this.hub.joinRoom('general'))),
        takeUntilDestroyed(),
      )
      .subscribe({ error: (e) => this.error.set(`Connection failed: ${hubErrorMessage(e)}`) });

    // Send "Typing" at most once every 2 seconds while the user types.
    this.text.valueChanges
      .pipe(
        filter((v) => v.trim().length > 0 && !this.privateTo()),
        throttleTime(2000),
        switchMap(() => this.hub.typing(this.activeRoom()).pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  openRoom(room: string): void {
    this.privateTo.set(null);
    this.activeRoom.set(room);
  }

  join(room: string): void {
    this.hub.joinRoom(room).subscribe({ next: () => this.openRoom(room), error: (e) => this.error.set(hubErrorMessage(e)) });
  }

  leave(room: string): void {
    this.hub.leaveRoom(room).subscribe({ error: (e) => this.error.set(hubErrorMessage(e)) });
  }

  sendMessage(): void {
    const text = this.text.value;
    const to = this.privateTo();
    const call$: Observable<unknown> = to
      ? this.hub.sendPrivate(to, text)
      : this.hub.sendToRoom(this.activeRoom(), text);

    this.error.set(null);
    call$.subscribe({
      next: () => this.text.reset(),
      // HubException text from the server, e.g. "Message text is required."
      error: (e) => this.error.set(hubErrorMessage(e)),
    });
  }
}
