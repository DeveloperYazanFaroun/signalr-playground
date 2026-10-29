using System.Diagnostics;
using Microsoft.AspNetCore.SignalR;
using RealTime.Api.Contracts;
using RealTime.Api.Hubs;

namespace RealTime.Api.Services;

/// <summary>
/// Background worker that pushes progress to the user who started the job.
/// This is the CareConnect "ImportProgressHub / DispenseDownloadHub" pattern:
/// code OUTSIDE a hub talks to clients through IHubContext&lt;THub, TClient&gt;.
/// </summary>
public sealed class JobWorker(
    JobQueue queue,
    IHubContext<ProgressHub, IProgressClient> hub,
    ILogger<JobWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var job in queue.ReadAllAsync(stoppingToken))
        {
            // Run jobs concurrently; don't block the queue on one slow job.
            _ = Task.Run(() => RunAsync(job, stoppingToken), stoppingToken);
        }
    }

    private async Task RunAsync(QueuedJob job, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var client = hub.Clients.User(job.UserId); // every tab of that user gets updates

        try
        {
            for (var step = 1; step <= job.TotalSteps; step++)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(400), ct); // simulate work

                var percent = (int)Math.Round(step * 100.0 / job.TotalSteps);
                await client.JobProgress(new JobProgress(
                    job.JobId, job.Name, step, job.TotalSteps, percent, $"Processing step {step} of {job.TotalSteps}"));
            }

            await client.JobCompleted(new JobResult(job.JobId, job.Name, true, sw.Elapsed, null));
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // app shutting down
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Job {JobId} failed", job.JobId);
            await client.JobCompleted(new JobResult(job.JobId, job.Name, false, sw.Elapsed, "The job failed. See server logs."));
        }
    }
}
