// Shim: @/util/token
export const Token = {
  estimate(text: string): number {
    return Math.ceil(text.length / 4)
  }
}
