using System.Threading.Channels;

namespace RealTime.Api.Services;

public sealed record QueuedJob(Guid JobId, string Name, int TotalSteps, string UserId);

/// <summary>Simple in-memory background queue (Channel&lt;T&gt;).</summary>
public sealed class JobQueue
{
    private readonly Channel<QueuedJob> _channel =
        Channel.CreateBounded<QueuedJob>(new BoundedChannelOptions(100) { FullMode = BoundedChannelFullMode.Wait });

    public ValueTask EnqueueAsync(QueuedJob job, CancellationToken ct = default) => _channel.Writer.WriteAsync(job, ct);

    public IAsyncEnumerable<QueuedJob> ReadAllAsync(CancellationToken ct) => _channel.Reader.ReadAllAsync(ct);
}
