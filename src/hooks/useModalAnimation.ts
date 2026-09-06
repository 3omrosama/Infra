import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface UseModalAnimationOptions<T = any> {
  onClose?: () => void;
  exitDurationMs?: number;
  disableEscape?: boolean;
  data?: T;
}

export interface UseModalAnimationResult<T = any> {
  isMounted: boolean;
  isVisible: boolean;
  activeData: T | undefined;
  handleClose: () => void;
  handleBackdropClick: (e: React.MouseEvent) => void;
  getBackdropClass: (extraClasses?: string) => string;
  getCardClass: (extraClasses?: string) => string;
}

/**
 * Reusable modal animation lifecycle hook.
 * Handles smooth cubic-bezier open/close transitions, double rAF for instant entrance,
 * bounded exit delay before unmounting, ESC key dismissal, data caching across exit animations,
 * and rapid open/close race-condition protection.
 */
export function useModalAnimation<T = any>(
  isOpen: boolean,
  options: UseModalAnimationOptions<T> = {}
): UseModalAnimationResult<T> {
  const {
    onClose,
    exitDurationMs = 200,
    disableEscape = false,
    data
  } = options;

  const [isMounted, setIsMounted] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);

  // Preserve active data during exit transition so closing modals don't flicker or crash
  const dataRef = useRef<T | undefined>(data);
  if (data !== undefined && data !== null) {
    dataRef.current = data;
  }

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsMounted(true);
      // Double rAF ensures the initial opacity-0/translate-y-2 CSS applies before triggering transition
      animFrameRef.current = requestAnimationFrame(() => {
        animFrameRef.current = requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
    } else {
      setIsVisible(false);
      // Wait for exit transition duration before unmounting from DOM
      timerRef.current = setTimeout(() => {
        setIsMounted(false);
        timerRef.current = null;
      }, exitDurationMs);
    }

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isOpen, exitDurationMs]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setIsMounted(false);
      timerRef.current = null;
      if (onCloseRef.current) {
        onCloseRef.current();
      }
    }, exitDurationMs);
  }, [exitDurationMs]);

  // Handle Escape key
  useEffect(() => {
    if (disableEscape || !isMounted || !isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMounted, isOpen, disableEscape, handleClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  const getBackdropClass = useCallback((extraClasses = '') => {
    return `fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none ${
      isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
    } ${extraClasses}`.trim();
  }, [isVisible]);

  const getCardClass = useCallback((extraClasses = '') => {
    return `transform transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:transform-none ${
      isVisible
        ? 'opacity-100 translate-y-0 scale-100'
        : 'opacity-0 translate-y-2 scale-[0.98]'
    } ${extraClasses}`.trim();
  }, [isVisible]);

  return {
    isMounted,
    isVisible,
    activeData: dataRef.current,
    handleClose,
    handleBackdropClick,
    getBackdropClass,
    getCardClass
  };
}
