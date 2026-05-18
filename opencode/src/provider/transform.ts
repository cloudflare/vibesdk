// Shim: @/provider/transform
export namespace ProviderTransform {
  export const OUTPUT_TOKEN_MAX = 32000

  export function options(_input: any) { return {} }
  export function smallOptions(_model: any) { return {} }
  export function schema(_model: any, schema: any) { return schema }
  export function message(prompt: any, _model: any, _options: any) { return prompt }
  export function temperature(_model: any) { return undefined }
  export function topP(_model: any) { return undefined }
  export function topK(_model: any) { return undefined }
  export function maxOutputTokens(model: any) { return model?.limit?.output ?? OUTPUT_TOKEN_MAX }
  export function providerOptions(_model: any, options: any) { return options }
}
