import { type Components } from 'react-markdown';

/**
 * ReactMarkdown component overrides that disable image rendering. Model and
 * user-authored markdown can contain `![](url)` which renders an outbound
 * `<img>` request; this is an invisible data-exfiltration channel for prompt
 * injection. Rendering images as null breaks that channel while preserving all
 * other markdown.
 */
export const NO_IMAGE_MARKDOWN_COMPONENTS: Components = {
	img: () => null,
};
