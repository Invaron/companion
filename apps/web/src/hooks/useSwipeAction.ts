import { useRef, useState } from "react";
import type { TouchEvent } from "react";

type SwipeDirection = "left" | "right" | null;

interface UseSwipeActionOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  disabled?: boolean;
  threshold?: number;
  maxOffset?: number;
}

interface UseSwipeActionResult {
  offsetX: number;
  direction: SwipeDirection;
  onTouchStart: (event: TouchEvent) => void;
  onTouchMove: (event: TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
}

export function useSwipeAction(options: UseSwipeActionOptions): UseSwipeActionResult {
  const {
    onSwipeLeft,
    onSwipeRight,
    disabled = false,
    threshold = 70,
    maxOffset = 110
  } = options;

  const [offsetX, setOffsetX] = useState(0);
  const [direction, setDirection] = useState<SwipeDirection>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isHorizontalSwipeRef = useRef(false);

  const reset = (): void => {
    setOffsetX(0);
    setDirection(null);
    isHorizontalSwipeRef.current = false;
  };

  const onTouchStart = (event: TouchEvent): void => {
    if (disabled || event.touches.length === 0) return;
    startXRef.current = event.touches[0].clientX;
    startYRef.current = event.touches[0].clientY;
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (disabled || event.touches.length === 0) return;

    const deltaX = event.touches[0].clientX - startXRef.current;
    const deltaY = event.touches[0].clientY - startYRef.current;

    if (!isHorizontalSwipeRef.current) {
      if (Math.abs(deltaX) < 8) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
      isHorizontalSwipeRef.current = true;
    }

    event.preventDefault();
    const clamped = Math.max(-maxOffset, Math.min(maxOffset, deltaX));
    setOffsetX(clamped);
    setDirection(clamped < 0 ? "left" : clamped > 0 ? "right" : null);
  };

  const onTouchEnd = (): void => {
    if (disabled) {
      reset();
      return;
    }

    if (Math.abs(offsetX) >= threshold) {
      if (offsetX < 0) {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    }

    reset();
  };

  const onTouchCancel = (): void => {
    reset();
  };

  return {
    offsetX,
    direction,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel
  };
}
