"use client";

import { POPUP_NAV_KEYS } from "@aevryn/ui/lib/popup";
import { type KeyboardEvent, useCallback, useEffect, useRef } from "react";

export function useKeyboardNavGate(open: boolean) {
	const keyboardNavRef = useRef(false);

	useEffect(() => {
		if (!open) return;
		const active = document.activeElement;
		keyboardNavRef.current =
			active instanceof HTMLElement && active.matches(":focus-visible");
	}, [open]);

	const trackKeyboardNav = useCallback((e: KeyboardEvent) => {
		if (POPUP_NAV_KEYS.includes(e.key)) keyboardNavRef.current = true;
	}, []);

	return { keyboardNavRef, trackKeyboardNav };
}
