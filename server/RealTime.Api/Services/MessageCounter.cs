namespace RealTime.Api.Services;

/// <summary>Counts successful hub invocations (shown in the live metrics stream).</summary>
public sealed class MessageCounter
{
    private long _total;
    public long Total => Interlocked.Read(ref _total);
    public void Increment() => Interlocked.Increment(ref _total);
}
