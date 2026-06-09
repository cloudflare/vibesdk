export function isProd(env: Env) {
    return env.ENVIRONMENT === 'prod' || env.ENVIRONMENT === 'production';
}

export function isDev(env: Env) {
    return env.ENVIRONMENT === 'dev' || env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'local';
}
