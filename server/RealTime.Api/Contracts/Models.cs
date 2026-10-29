namespace RealTime.Api.Contracts;

// ---------- Chat ----------
public sealed record ChatMessage(Guid Id, string Room, string From, string Text, DateTimeOffset SentAt);

public sealed record PrivateMessage(Guid Id, string From, string To, string Text, DateTimeOffset SentAt);

public sealed record SystemNotice(string Room, string Text, DateTimeOffset At);

// ---------- Jobs / progress ----------
public sealed record StartJobRequest(string Name, int TotalSteps = 10);

public sealed record JobAccepted(Guid JobId, string Name);

public sealed record JobProgress(Guid JobId, string Name, int Step, int TotalSteps, int Percent, string Status);

public sealed record JobResult(Guid JobId, string Name, bool Succeeded, TimeSpan Duration, string? Error);

// ---------- Streaming ----------
public sealed record ServerMetric(DateTimeOffset At, double CpuPercent, int ActiveConnections, long MessagesSent);

public sealed record ReadingsSummary(int Count, double Min, double Max, double Average);

// ---------- Auth ----------
public sealed record TokenRequest(string UserName);

public sealed record TokenResponse(string AccessToken, string UserName, DateTimeOffset ExpiresAt);
