import { Blueprint, ScreenshotAnalysisSchema, ScreenshotAnalysisType } from '../schemas';
import { createSystemMessage, createMultiModalUserMessage } from '../inferutils/common';
import { executeInference } from '../inferutils/infer';
import { PROMPT_UTILS } from '../prompts';
import { ScreenshotData } from '../core/types';
import { AgentOperation, OperationOptions } from './common';
import { OperationError } from '../utils/operationError';

export interface ScreenshotAnalysisInput {
    screenshotData: ScreenshotData,
}

const SYSTEM_PROMPT = `You are a UI/UX Quality Assurance Specialist at Cloudflare. Your task is to analyze application screenshots against blueprint specifications and identify visual issues.

## ANALYSIS PRIORITIES:
1. **Missing Elements** - Blueprint components not visible
2. **Layout Issues** - Misaligned, overlapping, or broken layouts
3. **Responsive Problems** - Mobile/desktop rendering issues
4. **Visual Bugs** - Broken styling, incorrect colors, missing images

## EXAMPLE ANALYSES:

**Example 1 - Game UI:**
Blueprint: "Score display in top-right, game board centered, control buttons below"
Screenshot: Shows score in top-left, buttons missing
Analysis:
- hasIssues: true
- issues: ["Score positioned incorrectly", "Control buttons not visible"]
- matchesBlueprint: false
- deviations: ["Score placement", "Missing controls"]

**Example 2 - Dashboard:**
Blueprint: "3-column layout with sidebar, main content, and metrics panel"
Screenshot: Shows proper 3-column layout, all elements visible
Analysis:
- hasIssues: false
- issues: []
- matchesBlueprint: true
- deviations: []

## OUTPUT FORMAT:
Return JSON with exactly these fields:
- hasIssues: boolean
- issues: string[] (specific problems found)
- uiCompliance: { matchesBlueprint: boolean, deviations: string[] }
- suggestions: string[] (improvement recommendations)`;

const USER_PROMPT = `Analyze this screenshot against the blueprint requirements.

**Blueprint Context:**
{{blueprint}}

**Viewport:** {{viewport}}

**Analysis Required:**
- Compare visible elements against blueprint specifications
- Check layout, spacing, and component positioning
- Identify any missing or broken UI elements
- Assess responsive design for the given viewport size
- Note any visual bugs or rendering issues

Provide specific, actionable feedback focused on blueprint compliance.`

const userPromptFormatter = (screenshotData: { viewport: { width: number; height: number }; }, blueprint: Blueprint) => {
    const prompt = PROMPT_UTILS.replaceTemplateVariables(USER_PROMPT, {
        blueprint: JSON.stringify(blueprint, null, 2),
        viewport: `${screenshotData.viewport.width}x${screenshotData.viewport.height}`
    });
    return PROMPT_UTILS.verifyPrompt(prompt);
}

export class ScreenshotAnalysisOperation extends AgentOperation<ScreenshotAnalysisInput, ScreenshotAnalysisType> {
    async execute(
        input: ScreenshotAnalysisInput,
        options: OperationOptions
    ): Promise<ScreenshotAnalysisType> {
        const { screenshotData } = input;
        const { env, context, logger } = options;
        try {
            logger.info('Analyzing screenshot from preview', {
                url: screenshotData.url,
                viewport: screenshotData.viewport,
                hasScreenshotData: !!screenshotData.screenshot,
                screenshotDataLength: screenshotData.screenshot?.length || 0
            });
    
            if (!screenshotData.screenshot) {
                throw new Error('No screenshot data available for analysis');
            }

            // Create multi-modal messages
            const messages = [
                createSystemMessage(SYSTEM_PROMPT),
                createMultiModalUserMessage(
                    userPromptFormatter(screenshotData, context.blueprint),
                    screenshotData.screenshot, // The base64 data URL or image URL
                    'high' // Use high detail for better analysis
                )
            ];
    
            const { object: analysisResult } = await executeInference({
                env: env,
                messages,
                schema: ScreenshotAnalysisSchema,
                agentActionName: 'screenshotAnalysis',
                context: options.inferenceContext,
                retryLimit: 3
            });
    
            if (!analysisResult) {
                logger.warn('Screenshot analysis returned no result');
                throw new Error('No analysis result');
            }
    
            logger.info('Screenshot analysis completed', {
                hasIssues: analysisResult.hasIssues,
                issueCount: analysisResult.issues.length,
                matchesBlueprint: analysisResult.uiCompliance.matchesBlueprint
            });
    
            // Log detected UI issues
            if (analysisResult.hasIssues) {
                logger.warn('UI issues detected in screenshot', {
                    issues: analysisResult.issues,
                    deviations: analysisResult.uiCompliance.deviations
                });
            }
    
            return analysisResult;
        } catch (error) {
            OperationError.logAndThrow(logger, "screenshot analysis", error);
        }
    }
}