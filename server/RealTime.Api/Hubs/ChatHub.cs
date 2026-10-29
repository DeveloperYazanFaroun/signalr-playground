using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using RealTime.Api.Contracts;
using RealTime.Api.Services;

namespace RealTime.Api.Hubs;

/// <summary>
/// Chat hub: rooms (groups), private messages (users), presence and typing indicators.
/// Hubs are TRANSIENT: a new instance per invocation. Never store state in fields.
/// </summary>
[Authorize]
public sealed class ChatHub(PresenceTracker presence, ILogger<ChatHub> logger) : Hub<IChatClient>
{
    public static readonly string[] Rooms = ["general", "dispensing", "support"];
    private const int MaxMessageLength = 500;

    private string UserName => Context.UserIdentifier
        ?? throw new HubException("Unauthenticated connection.");

    private static string GroupName(string room) => $"room:{room.ToLowerInvariant()}";

    // ---------------- Lifetime events ----------------

    public override async Task OnConnectedAsync()
    {
        var cameOnline = presence.Connected(UserName, Context.ConnectionId);
        logger.LogInformation("{User} connected ({ConnectionId})", UserName, Context.ConnectionId);

        if (cameOnline)
            await Clients.Others.UserOnline(UserName);

        await Clients.Caller.OnlineUsers(presence.OnlineUsers());
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // SignalR removes the connection from all groups automatically.
        var wentOffline = presence.Disconnected(UserName, Context.ConnectionId);
        if (wentOffline)
            await Clients.Others.UserOffline(UserName);

        logger.LogInformation(exception, "{User} disconnected ({ConnectionId})", UserName, Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    // ---------------- Client -> Server methods ----------------

    public async Task JoinRoom(string room)
    {
        EnsureRoomExists(room);
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(room));
        await Clients.Group(GroupName(room))
            .SystemNotice(new SystemNotice(room, $"{UserName} joined #{room}", DateTimeOffset.UtcNow));
    }

    public async Task LeaveRoom(string room)
    {
        EnsureRoomExists(room);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(room));
        await Clients.Group(GroupName(room))
            .SystemNotice(new SystemNotice(room, $"{UserName} left #{room}", DateTimeOffset.UtcNow));
    }

    /// <summary>Returns the stored message so the caller can use invoke() and get an ack.</summary>
    public async Task<ChatMessage> SendToRoom(string room, string text)
    {
        EnsureRoomExists(room);
        text = ValidateText(text);

        var message = new ChatMessage(Guid.NewGuid(), room, UserName, text, DateTimeOffset.UtcNow);
        await Clients.Group(GroupName(room)).ReceiveMessage(message);
        return message;
    }

    public async Task SendPrivate(string toUser, string text)
    {
        text = ValidateText(text);
        if (string.Equals(toUser, UserName, StringComparison.OrdinalIgnoreCase))
            throw new HubException("You cannot send a private message to yourself.");

        var message = new PrivateMessage(Guid.NewGuid(), UserName, toUser, text, DateTimeOffset.UtcNow);

        // Clients.Users targets EVERY connection of each user (all tabs/devices).
        await Clients.Users(toUser, UserName).ReceivePrivate(message);
    }

    public Task Typing(string room) =>
        Clients.OthersInGroup(GroupName(room)).UserTyping(room, UserName);

    [Authorize(Roles = "Admin")]
    public Task Broadcast(string text) =>
        Clients.All.SystemNotice(new SystemNotice("*", $"[ADMIN] {ValidateText(text)}", DateTimeOffset.UtcNow));

    // ---------------- Helpers ----------------

    private static void EnsureRoomExists(string room)
    {
        // HubException messages ARE sent to the client, other exceptions are hidden.
        if (!Rooms.Contains(room, StringComparer.OrdinalIgnoreCase))
            throw new HubException($"Room '{room}' does not exist. Available rooms: {string.Join(", ", Rooms)}.");
    }

    private static string ValidateText(string text)
    {
        text = text?.Trim() ?? string.Empty;
        if (text.Length == 0) throw new HubException("Message text is required.");
        if (text.Length > MaxMessageLength)
            throw new HubException($"Message text must be {MaxMessageLength} characters or fewer.");
        return text;
    }
}
