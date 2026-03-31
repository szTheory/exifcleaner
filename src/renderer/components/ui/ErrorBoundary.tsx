import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
	children: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error("[ErrorBoundary] Caught error:", error, errorInfo);
	}

	handleReset = (): void => {
		this.setState({ hasError: false, error: null });
	};

	render(): ReactNode {
		if (this.state.hasError) {
			return (
				<div
					className="error-boundary"
					role="alert"
					aria-live="assertive"
				>
					<p className="error-boundary__message">
						Something went wrong.
					</p>
					{this.state.error !== null && (
						<p className="error-boundary__detail">
							{this.state.error.message}
						</p>
					)}
					<button
						className="error-boundary__button"
						type="button"
						onClick={this.handleReset}
					>
						Try again
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}
