import { forwardRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { LinkProvider, type LinkComponentProps } from '@cloudflare/kumo';

const AppLink = forwardRef<HTMLAnchorElement, LinkComponentProps>(
	function AppLink({ href, to, ...rest }, ref) {
		const destination = href ?? to;
		const isExternal =
			destination?.startsWith('http') &&
			new URL(destination).origin !== window.location.origin;

		if (isExternal) {
			return <a ref={ref} href={destination} {...rest} />;
		}

		return <Link ref={ref} to={destination ?? ''} {...rest} />;
	},
);

export function AppLinkProvider({ children }: { children: ReactNode }) {
	return <LinkProvider component={AppLink}>{children}</LinkProvider>;
}
