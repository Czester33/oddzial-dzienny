"use client";

import { useEffect } from "react";
import {
  findNeighborTextField,
  focusTextField,
  isArrowNavKey,
  isTextFieldElement,
  shouldLeaveTextField,
} from "@/lib/text-field-navigation";

/** Global Arrow key navigation between text fields (inputs, textareas, FormattedEditor). */
export function TextFieldArrowNavigation() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (!isArrowNavKey(e.key)) return;

      const active = document.activeElement;
      if (!isTextFieldElement(active)) return;
      if (!shouldLeaveTextField(active, e.key)) return;

      const next = findNeighborTextField(active, e.key);
      if (!next) return;

      e.preventDefault();
      focusTextField(next, e.key);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
