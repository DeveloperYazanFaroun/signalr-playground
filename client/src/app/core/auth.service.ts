import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { API_URL } from './config';
import { TokenResponse } from './models';

const STORAGE_KEY = 'rt.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(API_URL);

  private readonly session = signal<TokenResponse | null>(this.restore());

  readonly token = computed(() => this.session()?.accessToken ?? null);
  readonly userName = computed(() => this.session()?.userName ?? null);
  readonly isLoggedIn = computed(() => this.token() !== null);

  login(userName: string): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>(`${this.apiUrl}/api/auth/token`, { userName })
      .pipe(tap((res) => this.save(res)));
  }

  logout(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    this.session.set(null);
  }

  private save(res: TokenResponse): void {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(res));
    this.session.set(res);
  }

  private restore(): TokenResponse | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const res = raw ? (JSON.parse(raw) as TokenResponse) : null;
      return res && new Date(res.expiresAt) > new Date() ? res : null;
    } catch {
      return null;
    }
  }
}

/** Adds the bearer token to normal HTTP calls (SignalR uses accessTokenFactory instead). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};

export const authGuard: CanActivateFn = () =>
  inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/login']);
