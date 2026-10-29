using RealTime.Api.Contracts;

namespace RealTime.Api.Hubs;

public interface IProgressClient
{
    Task JobProgress(JobProgress progress);
    Task JobCompleted(JobResult result);
}
