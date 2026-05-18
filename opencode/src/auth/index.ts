// Shim: @/auth
export namespace Auth {
  export type Info = { type: string; key?: string }
  export async function get(_providerID: string): Promise<Info | undefined> {
    return undefined
  }
  export async function set(_providerID: string, _info: Info) {}
  export async function remove(_providerID: string) {}
}
