import React, { Component, type ReactNode } from 'react';

interface Props {
	children: ReactNode;
	slideIndex: number;
}

interface State {
	hasError: boolean;
}

/**
 * Error boundary for slide thumbnails to prevent individual slide errors
 * from crashing the entire thumbnail sidebar
 */
export class ThumbnailErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(): State {
		return { hasError: true };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
		console.error(`Thumbnail render error for slide ${this.props.slideIndex}:`, error, errorInfo);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return (
				<div className="flex items-center justify-center h-full bg-red-500/10 text-red-500 text-xs p-2">
					Error
				</div>
			);
		}

		return this.props.children;
	}
}
