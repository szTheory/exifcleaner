import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Timer hook for tracking processing duration.
 * Updates 10x/sec for responsive display in the status bar.
 */
export function useElapsedTime(): {
	elapsedSeconds: number;
	startTimer: () => void;
	stopTimer: () => void;
	resetTimer: () => void;
} {
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const startTimeRef = useRef<number | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const startTimer = useCallback((): void => {
		if (intervalRef.current !== null) return;
		startTimeRef.current = Date.now();
		intervalRef.current = setInterval(() => {
			if (startTimeRef.current !== null) {
				setElapsedSeconds(
					Math.round((Date.now() - startTimeRef.current) / 1000),
				);
			}
		}, 100);
	}, []);

	const stopTimer = useCallback((): void => {
		if (intervalRef.current !== null) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
	}, []);

	const resetTimer = useCallback((): void => {
		stopTimer();
		setElapsedSeconds(0);
		startTimeRef.current = null;
	}, [stopTimer]);

	// Cleanup on unmount
	useEffect(() => {
		return () => stopTimer();
	}, [stopTimer]);

	return { elapsedSeconds, startTimer, stopTimer, resetTimer };
}
