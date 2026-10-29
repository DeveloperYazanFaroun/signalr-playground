import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from './core/auth.service';
import { ChatHubService } from './core/signalr/chat-hub.service';
import { ProgressHubService } from './core/signalr/progress-hub.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-full bg-slate-100">
      <nav class="flex h-14 items-center justify-between bg-slate-900 px-6 text-white">
        <span class="font-semibold">SignalR Real-Time Lab</span>
        @if (auth.isLoggedIn()) {
          <div class="flex items-center gap-6 text-sm">
            <a routerLink="/chat" routerLinkActive="text-indigo-300">Chat</a>
            <a routerLink="/live-ops" routerLinkActive="text-indigo-300">Live Ops</a>
            <span class="text-slate-400">{{ auth.userName() }}</span>
            <button class="rounded bg-slate-700 px-3 py-1 hover:bg-slate-600" (click)="logout()">Logout</button>
          </div>
        }
      </nav>
      <main class="p-5"><router-outlet /></main>
    </div>
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly chat = inject(ChatHubService);
  private readonly progress = inject(ProgressHubService);
  private readonly router = inject(Router);

  logout(): void {
    // Stop hubs so the next user gets a fresh connection with a fresh token.
    forkJoin([this.chat.stop(), this.progress.stop()]).subscribe(() => {
      this.auth.logout();
      this.router.navigate(['/login']);
    });
  }
}
