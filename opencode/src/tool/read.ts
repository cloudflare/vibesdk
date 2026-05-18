// Shim: @/tool/read
export namespace ReadTool {
  export async function init() {
    return {
      execute: async (_args: any, _ctx: any) => ({
        output: "",
        title: "",
        metadata: {},
      }),
    }
  }
}
