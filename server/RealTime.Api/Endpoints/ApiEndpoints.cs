using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;
using RealTime.Api.Auth;
using RealTime.Api.Contracts;
using RealTime.Api.Hubs;
using RealTime.Api.Services;

namespace RealTime.Api.Endpoints;

public static class ApiEndpoints
{
    public static IEndpointRouteBuilder MapApiEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api");

        // DEV-ONLY login: returns a JWT for any user name.
        api.MapPost("/auth/token", (TokenRequest request, TokenService tokens) =>
        {
            var name = request.UserName?.Trim();
            if (string.IsNullOrWhiteSpace(name) || name.Length > 30)
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["userName"] = ["User name is required and must be 30 characters or fewer."]
                });

            return Results.Ok(tokens.Issue(name));
        });

        api.MapGet("/rooms", () => ChatHub.Rooms);

        api.MapGet("/presence", (PresenceTracker presence) => presence.OnlineUsers())
            .RequireAuthorization();

        // Start a long-running job; progress arrives over SignalR, not HTTP.
        api.MapPost("/jobs", async (StartJobRequest request, ClaimsPrincipal user, JobQueue queue) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Job name is required."] });
            if (request.TotalSteps is < 1 or > 100)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["totalSteps"] = ["TotalSteps must be between 1 and 100."] });

            var userId = user.FindFirstValue(JwtRegisteredClaimNames.Sub)!;
            var job = new QueuedJob(Guid.NewGuid(), request.Name.Trim(), request.TotalSteps, userId);
            await queue.EnqueueAsync(job);

            return Results.Accepted($"/api/jobs/{job.JobId}", new JobAccepted(job.JobId, job.Name));
        }).RequireAuthorization();

        return app;
    }
}
