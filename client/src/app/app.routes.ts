import { Routes } from '@angular/router';
import { authGuard } from './core/auth.service';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login').then((m) => m.Login) },
  { path: 'chat', canActivate: [authGuard], loadComponent: () => import('./pages/chat/chat').then((m) => m.Chat) },
  { path: 'live-ops', canActivate: [authGuard], loadComponent: () => import('./pages/live-ops/live-ops').then((m) => m.LiveOps) },
  { path: '', pathMatch: 'full', redirectTo: 'chat' },
  { path: '**', redirectTo: 'chat' },
];
