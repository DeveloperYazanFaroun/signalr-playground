// Mirrors RealTime.Api/Contracts/Models.cs (camelCase JSON).

export interface ChatMessage { id: string; room: string; from: string; text: string; sentAt: string; }
export interface PrivateMessage { id: string; from: string; to: string; text: string; sentAt: string; }
export interface SystemNotice { room: string; text: string; at: string; }
export interface TypingEvent { room: string; user: string; }

export interface JobAccepted { jobId: string; name: string; }
export interface JobProgress { jobId: string; name: string; step: number; totalSteps: number; percent: number; status: string; }
export interface JobResult { jobId: string; name: string; succeeded: boolean; duration: string; error: string | null; }

export interface ServerMetric { at: string; cpuPercent: number; activeConnections: number; messagesSent: number; }
export interface ReadingsSummary { count: number; min: number; max: number; average: number; }

export interface TokenResponse { accessToken: string; userName: string; expiresAt: string; }
