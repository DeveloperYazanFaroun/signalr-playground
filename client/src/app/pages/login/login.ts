import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  template: `
    <div class="mx-auto mt-24 max-w-sm rounded-2xl bg-white p-8 shadow">
      <h1 class="mb-1 text-2xl font-semibold text-slate-900">Real-Time Lab</h1>
      <p class="mb-6 text-sm text-slate-500">Dev login: any name. Use <b>admin</b> to get the Admin role.</p>
      <form [formGroup]="form" (ngSubmit)="login()" class="space-y-4">
        <input formControlName="userName" placeholder="Your name"
               class="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
        @if (error()) { <p class="text-sm text-rose-600">{{ error() }}</p> }
        <button type="submit" [disabled]="form.invalid || busy()"
                class="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {{ busy() ? 'Signing in...' : 'Sign in' }}
        </button>
      </form>
    </div>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = new FormGroup({
    userName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(30)] }),
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  login(): void {
    this.busy.set(true);
    this.auth
      .login(this.form.getRawValue().userName)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => this.router.navigate(['/chat']),
        error: () => this.error.set('Could not sign in. Is RealTime.Api running on http://localhost:5000?'),
      });
  }
}
