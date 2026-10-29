using Microsoft.AspNetCore.SignalR;
using Microsoft.IdentityModel.JsonWebTokens;

namespace RealTime.Api.Auth;

/// <summary>
/// Tells SignalR which claim identifies a user. This value becomes
/// <c>Context.UserIdentifier</c> and is what <c>Clients.User(id)</c> targets.
/// (Default provider uses ClaimTypes.NameIdentifier.)
/// </summary>
public sealed class SubjectUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection) =>
        connection.User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
}
