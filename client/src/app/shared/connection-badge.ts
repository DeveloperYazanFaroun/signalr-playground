import { Component, computed, input } from '@angular/core';
import { HubConnectionState } from '@microsoft/signalr';

@Component({
  selector: 'app-connection-badge',
  template: `
    <span class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium" [class]="style().box">
      <span class="h-2 w-2 rounded-full" [class]="style().dot"></span>
      {{ label() }}: {{ state() }}
    </span>
  `,
})
export class ConnectionBadge {
  readonly state = input.required<HubConnectionState>();
  readonly label = input('Hub');

  protected readonly style = computed(() => {
    switch (this.state()) {
      case HubConnectionState.Connected:
        return { box: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' };
      case HubConnectionState.Connecting:
      case HubConnectionState.Reconnecting:
        return { box: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500 animate-pulse' };
      default:
        return { box: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' };
    }
  });
}
