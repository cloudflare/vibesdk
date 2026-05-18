// Shim: upstream @/flag/flag — all flags default to false/undefined in Workers
export namespace Flag {
  export const OPENCODE_AUTO_SHARE = false
  export const OPENCODE_GIT_BASH_PATH: string | undefined = undefined
  export const OPENCODE_CONFIG: string | undefined = undefined
  export const OPENCODE_PURE = false
  export const OPENCODE_TUI_CONFIG: string | undefined = undefined
  export const OPENCODE_CONFIG_DIR: string | undefined = undefined
  export const OPENCODE_PLUGIN_META_FILE: string | undefined = undefined
  export const OPENCODE_CONFIG_CONTENT: string | undefined = undefined
  export const OPENCODE_DISABLE_AUTOUPDATE = false
  export const OPENCODE_ALWAYS_NOTIFY_UPDATE = false
  export const OPENCODE_DISABLE_PRUNE = false
  export const OPENCODE_DISABLE_TERMINAL_TITLE = false
  export const OPENCODE_SHOW_TTFD = false
  export const OPENCODE_PERMISSION: string | undefined = undefined
  export const OPENCODE_DISABLE_DEFAULT_PLUGINS = false
  export const OPENCODE_DISABLE_LSP_DOWNLOAD = false
  export const OPENCODE_ENABLE_EXPERIMENTAL_MODELS = false
  export const OPENCODE_DB: string | undefined = undefined
  export const OPENCODE_EXPERIMENTAL_WORKSPACES = false
  export const OPENCODE_EXPERIMENTAL_PLAN_MODE = false
  export const OPENCODE_SKIP_MIGRATIONS = false
  export const OPENCODE_DISABLE_CHANNEL_DB = false
  export const OPENCODE_CLIENT = "worker"
}
