using RealTime.Api.Contracts;

namespace RealTime.Api.Hubs;

/// <summary>
/// Strongly-typed client contract: every method here is something the SERVER
/// calls on the CLIENT. The method name is the event name the client subscribes to
/// with connection.on('ReceiveMessage', ...). No more magic strings on the server.
/// </summary>
public interface IChatClient
{
    Task ReceiveMessage(ChatMessage message);
    Task ReceivePrivate(PrivateMessage message);
    Task SystemNotice(SystemNotice notice);
    Task UserTyping(string room, string user);
    Task UserOnline(string user);
    Task UserOffline(string user);
    Task OnlineUsers(IReadOnlyList<string> users);
}
