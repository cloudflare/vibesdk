import { GlobalConfigurableSettings } from "../config";
import { AuthRequirement } from "../middleware/auth/routeAuth";
import { AuthUser } from "./auth-types";


export type AppEnv = {
    Bindings: Env;
    Variables: {
        user: AuthUser | null;
        sessionId: string | null;
        config: GlobalConfigurableSettings;
        authLevel: AuthRequirement;
    }
}
