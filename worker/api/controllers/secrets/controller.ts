import { BaseController } from '../baseController';
import { ApiResponse, ControllerResponse } from '../types';
import { SecretTemplatesData } from './types';
import { getTemplatesData } from '../../../types/secretsTemplates';

export class SecretsController extends BaseController {

    static async getTemplates(request: Request, _env: Env, _ctx: ExecutionContext): Promise<ControllerResponse<ApiResponse<SecretTemplatesData>>> {
        try {
            const url = new URL(request.url);
            const category = url.searchParams.get('category');
            
            let templates = getTemplatesData();
            
            if (category) {
                templates = templates.filter(template => template.category === category);
            }
            
            const responseData: SecretTemplatesData = { templates };
            return SecretsController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error getting secret templates:', error);
            return SecretsController.createErrorResponse<SecretTemplatesData>('Failed to get secret templates', 500);
        }
    }
}
