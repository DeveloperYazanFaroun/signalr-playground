using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using RealTime.Api.Contracts;
using RealTime.Api.Services;

namespace RealTime.Api.Hubs;

/// <summary>
/// Progress + streaming hub.
/// - Job progress is PUSHED from outside the hub (JobWorker) through IHubContext.
/// - StreamMetrics shows SERVER -> CLIENT streaming (IAsyncEnumerable).
/// - UploadReadings shows CLIENT -> SERVER streaming.
/// </summary>
[Authorize]
public sealed class ProgressHub(PresenceTracker presence, MessageCounter counter) : Hub<IProgressClient>
{
    public async IAsyncEnumerable<ServerMetric> StreamMetrics(
        int intervalMs,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        intervalMs = Math.Clamp(intervalMs, 250, 5000);
        var random = Random.Shared;

        // The token is cancelled when the client disposes the subscription or disconnects.
        while (!cancellationToken.IsCancellationRequested)
        {
            yield return new ServerMetric(
                DateTimeOffset.UtcNow,
                Math.Round(20 + random.NextDouble() * 60, 1),
                presence.ConnectionCount,
                counter.Total);

            await Task.Delay(intervalMs, cancellationToken);
        }
    }

    public async Task<ReadingsSummary> UploadReadings(IAsyncEnumerable<double> readings)
    {
        int count = 0; double min = double.MaxValue, max = double.MinValue, sum = 0;

        await foreach (var value in readings)
        {
            count++; sum += value;
            min = Math.Min(min, value); max = Math.Max(max, value);
        }

        return count == 0
            ? new ReadingsSummary(0, 0, 0, 0)
            : new ReadingsSummary(count, min, max, Math.Round(sum / count, 2));
    }
}
