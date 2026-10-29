using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.SignalR;
using Microsoft.IdentityModel.Tokens;
using RealTime.Api.Auth;
using RealTime.Api.Endpoints;
using RealTime.Api.Hubs;
using RealTime.Api.Hubs.Filters;
using RealTime.Api.Services;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ---------------------------------------------------------------------------
// 1) CORS - SignalR's JS client sends credentials, so we cannot use AllowAnyOrigin().
//    SetIsOriginAllowed(_ => true) + AllowCredentials() allows any origin (dev / internal).
// ---------------------------------------------------------------------------
builder.Services.AddCors(options => options.AddPolicy("client", policy => policy
    .SetIsOriginAllowed(_ => true)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));

// ---------------------------------------------------------------------------
// 2) Authentication - JWT bearer.
//    Browsers cannot set an Authorization header on WebSockets/SSE, so the JS client
//    sends the token as ?access_token=... We read it ONLY for hub paths.
// ---------------------------------------------------------------------------
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false; // keep "sub", "name", "role" as-is
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = config["Jwt:Issuer"],
            ValidAudience = config["Jwt:Audience"],
            IssuerSigningKey = TokenService.KeyFrom(config),
            NameClaimType = "name",
            RoleClaimType = "role",
            ClockSkew = TimeSpan.FromSeconds(30),
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    context.Token = accessToken;
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization();

// ---------------------------------------------------------------------------
// 3) SignalR
// ---------------------------------------------------------------------------
builder.Services.AddSignalR(options =>
    {
        options.EnableDetailedErrors = builder.Environment.IsDevelopment(); // never in production
        options.KeepAliveInterval = TimeSpan.FromSeconds(15);     // server ping
        options.ClientTimeoutInterval = TimeSpan.FromSeconds(30); // must be ~2x client keep-alive
        options.MaximumReceiveMessageSize = 64 * 1024;            // 64 KB per incoming message
        options.AddFilter<HubLoggingFilter>();                   // global hub filter
    })
    .AddJsonProtocol(o => o.PayloadSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
    // ADVANCED - scale out across several servers (needs Microsoft.AspNetCore.SignalR.StackExchangeRedis):
    // .AddStackExchangeRedis(config.GetConnectionString("Redis")!, o => o.Configuration.ChannelPrefix = RedisChannel.Literal("realtime"));
    // ADVANCED - binary protocol (needs Microsoft.AspNetCore.SignalR.Protocols.MessagePack):
    // .AddMessagePackProtocol();

builder.Services.AddSingleton<IUserIdProvider, SubjectUserIdProvider>();
builder.Services.AddSingleton<PresenceTracker>();
builder.Services.AddSingleton<MessageCounter>();
builder.Services.AddSingleton<JobQueue>();
builder.Services.AddSingleton<TokenService>();
builder.Services.AddHostedService<JobWorker>();

var app = builder.Build();

// Order matters: CORS -> Authentication -> Authorization -> endpoints
app.UseCors("client");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => "RealTime.Api is running. Hubs: /hubs/chat, /hubs/progress");
app.MapApiEndpoints();

app.MapHub<ChatHub>("/hubs/chat", options =>
{
    options.AllowStatefulReconnects = true; // replay buffered messages after a short drop
});
app.MapHub<ProgressHub>("/hubs/progress");

app.Run();

public partial class Program; // for WebApplicationFactory integration tests
