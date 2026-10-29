using System.Collections.Concurrent;

namespace RealTime.Api.Services;

/// <summary>
/// Tracks which users are online. A user can have many connections
/// (several tabs / devices), so we count connections per user.
/// NOTE: in-memory = single server only. With several servers, move this to Redis.
/// </summary>
public sealed class PresenceTracker
{
    private readonly ConcurrentDictionary<string, HashSet<string>> _online = new(StringComparer.OrdinalIgnoreCase);

    /// <returns>true if this is the user's FIRST connection (they just came online).</returns>
    public bool Connected(string user, string connectionId)
    {
        var connections = _online.GetOrAdd(user, _ => []);
        lock (connections)
        {
            connections.Add(connectionId);
            return connections.Count == 1;
        }
    }

    /// <returns>true if this was the user's LAST connection (they just went offline).</returns>
    public bool Disconnected(string user, string connectionId)
    {
        if (!_online.TryGetValue(user, out var connections)) return false;
        lock (connections)
        {
            connections.Remove(connectionId);
            if (connections.Count > 0) return false;
            _online.TryRemove(user, out _);
            return true;
        }
    }

    public IReadOnlyList<string> OnlineUsers() => [.. _online.Keys.Order()];

    public int ConnectionCount => _online.Values.Sum(c => { lock (c) return c.Count; });
}
