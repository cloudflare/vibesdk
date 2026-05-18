// Shim: @/util/log
export namespace Log {
  export const Default = create({ service: "default" })

  export function create(opts: { service: string }) {
    const prefix = `[${opts.service}]`
    const logger = {
      info: (msg: string, extra?: any) => console.log(prefix, msg, extra ?? ""),
      warn: (msg: string, extra?: any) => console.warn(prefix, msg, extra ?? ""),
      error: (msg: string, extra?: any) => console.error(prefix, msg, extra ?? ""),
      debug: (msg: string, extra?: any) => console.debug(prefix, msg, extra ?? ""),
      tag: (_k: string, _v: string) => logger,
      clone: () => create(opts),
      time: (_msg: string, _extra?: any) => ({ stop: () => {}, [(Symbol as any).dispose]() {} }),
    }
    return logger
  }

  export async function init(_opts?: any) {}
}
