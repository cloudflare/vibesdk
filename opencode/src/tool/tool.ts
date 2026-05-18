// Shim: @/tool/tool
export namespace Tool {
  export interface Context {
    sessionID: string
    abort: AbortSignal
    messageID: string
    callID: string
    extra: Record<string, any>
    agent: string
    messages: any[]
    metadata: (val: { title?: string; metadata?: Record<string, any> }) => Promise<void>
    ask: (req: any) => Promise<void>
  }
}
