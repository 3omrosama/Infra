import React, { ReactNode } from 'react';
import { useModalAnimation } from '../../hooks/useModalAnimation';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  backdropClassName?: string;
  id?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaBusy?: boolean;
  disableEscape?: boolean;
  disableBackdropClick?: boolean;
  position?: 'center' | 'top';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className = '',
  containerClassName = '',
  backdropClassName = '',
  id,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaBusy = false,
  disableEscape = false,
  disableBackdropClick = false,
  position = 'center'
}) => {
  const {
    isMounted,
    isVisible,
    handleClose,
    handleBackdropClick,
    getCardClass
  } = useModalAnimation(isOpen, {
    onClose,
    disableEscape: disableEscape || ariaBusy,
    exitDurationMs: 200
  });

  if (!isMounted) return null;

  const positionClasses = position === 'top' 
    ? 'flex items-start justify-center pt-20 p-4' 
    : 'flex items-center justify-center p-4';

  const onBackdropPress = (e: React.MouseEvent) => {
    if (disableBackdropClick || ariaBusy) return;
    handleBackdropClick(e);
  };

  return (
    <div
      onClick={onBackdropPress}
      className={`fixed inset-0 z-50 ${positionClasses} bg-black/75 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      } ${backdropClassName} ${containerClassName}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-busy={ariaBusy}
    >
      <div
        id={id}
        className={getCardClass(className)}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};
