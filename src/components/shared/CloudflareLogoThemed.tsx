import { CloudflareLogo, CloudflareLogoProps } from '@cloudflare/kumo';
import { useTheme } from '@/contexts/theme-context';

export function CloudflareLogoThemed(props: CloudflareLogoProps) {
	const { resolvedTheme } = useTheme();

	return (
		<CloudflareLogo
			variant="glyph"
			color={resolvedTheme === 'dark' ? 'white' : 'black'}
			{...props}
		/>
	);
}
