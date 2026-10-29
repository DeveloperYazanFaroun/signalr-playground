using System.Diagnostics;
using Microsoft.AspNetCore.SignalR;
using RealTime.Api.Services;

namespace RealTime.Api.Hubs.Filters;

/// <summary>
/// Hub filters are SignalR's "middleware" around every hub method invocation.
/// Good for logging, timing, auditing, validation and exception translation.
/// </summary>
public sealed class HubLoggingFilter(ILogger<HubLoggingFilter> logger, MessageCounter counter) : IHubFilter
{
    public async ValueTask<object?> InvokeMethodAsync(
        HubInvocationContext context,
        Func<HubInvocationContext, ValueTask<object?>> next)
    {
        var sw = Stopwatch.StartNew();
        var hub = context.Hub.GetType().Name;
        var method = context.HubMethodName;
        var user = context.Context.UserIdentifier;

        try
        {
            var result = await next(context);
            counter.Increment();
            logger.LogInformation("{Hub}.{Method} by {User} took {Elapsed} ms",
                hub, method, user, sw.ElapsedMilliseconds);
            return result;
        }
        catch (HubException)
        {
            throw; // already client-friendly
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "{Hub}.{Method} by {User} failed", hub, method, user);
            // Translate unexpected errors into a safe, readable message for the client.
            throw new HubException($"'{method}' failed. Please try again.");
        }
    }
}
