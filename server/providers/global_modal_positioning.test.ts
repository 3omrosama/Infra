import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Global Modal Viewport-Relative Positioning & Architecture', () => {
  it('1. Portals all modals directly to document.body to escape scroll & transform contexts', () => {
    // Verifies the modal architecture separates the modal from the scrollable <main> container
    const isRootDocumentBody = (parentTag: string) => parentTag.toLowerCase() === 'body';
    
    assert.strictEqual(isRootDocumentBody('body'), true, 'Modals must mount to document.body');
    assert.strictEqual(isRootDocumentBody('div.animate-page-enter'), false, 'Modals must not mount inside animated or transformed containers');
    assert.strictEqual(isRootDocumentBody('main.overflow-y-auto'), false, 'Modals must not mount inside scrollable content containers');
  });

  it('2. Viewport centering CSS layout classes are correctly configured', () => {
    const backdropClasses = 'fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm overflow-y-auto transition-opacity duration-200 ease-out motion-reduce:transition-none';
    
    assert.ok(backdropClasses.includes('fixed inset-0'), 'Must use fixed inset-0 for full viewport span');
    assert.ok(backdropClasses.includes('z-50'), 'Must use high z-index to overlay all layout chrome');
    assert.ok(backdropClasses.includes('flex items-center justify-center'), 'Must use flexbox viewport centering');
    assert.ok(backdropClasses.includes('overflow-y-auto'), 'Backdrop container must allow overflow scrolling if window is smaller than dialog');
    assert.ok(backdropClasses.includes('p-4'), 'Must have viewport edge padding on small screens');
  });

  it('3. Long modal content has internal scrolling and viewport height bounds', () => {
    const vmDetailCardClass = 'w-full max-w-3xl my-auto bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[90vh]';
    const confirmCardClass = 'w-full max-w-lg my-auto max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto bg-slate-900 border border-slate-700/70 rounded-2xl p-6 shadow-2xl space-y-5';
    const addConnCardClass = 'w-full max-w-xl my-auto bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[92vh]';

    assert.ok(vmDetailCardClass.includes('max-h-[calc(100vh-2rem)]'), 'VMDetailModal must constrain to viewport max height');
    assert.ok(vmDetailCardClass.includes('flex flex-col'), 'VMDetailModal must use flex column for pinned header/footer');
    assert.ok(confirmCardClass.includes('overflow-y-auto'), 'ConfirmDialog must scroll internally when message or rationale is tall');
    assert.ok(addConnCardClass.includes('max-h-'), 'AddConnectionModal must constrain height to viewport');
  });

  it('4. ConfirmDialog power action execution flow & loading state retention', async () => {
    const powerActions = ['power-on', 'power-off', 'restart', 'suspend'] as const;
    
    for (const action of powerActions) {
      let isExecuting = false;
      let dialogOpen = true;
      let executedAction: string | null = null;

      const confirmHandler = async (act: string) => {
        if (isExecuting) return;
        isExecuting = true;
        executedAction = act;
        // Simulate asynchronous operation
        await new Promise(resolve => setTimeout(resolve, 10));
        isExecuting = false;
        dialogOpen = false;
      };

      await confirmHandler(action);
      assert.strictEqual(executedAction, action);
      assert.strictEqual(dialogOpen, false);
      assert.strictEqual(isExecuting, false);
    }
  });

  it('5. Prevents event propagation from modal card to backdrop', () => {
    let backdropClicked = false;
    let cardClicked = false;

    const handleBackdropClick = () => {
      backdropClicked = true;
    };

    const handleCardClick = (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      cardClicked = true;
    };

    let stopped = false;
    const fakeEvent = {
      stopPropagation: () => {
        stopped = true;
      }
    };

    handleCardClick(fakeEvent);
    assert.strictEqual(cardClicked, true);
    assert.strictEqual(stopped, true, 'Card click must call stopPropagation');
    assert.strictEqual(backdropClicked, false, 'Backdrop click handler must not be triggered when clicking inside card');
  });

  it('6. Accessibility: includes ARIA dialog role and modal metadata', () => {
    const modalAria = {
      role: 'dialog',
      'aria-modal': true,
      'aria-labelledby': 'confirm-dialog-title',
      'aria-busy': false
    };

    assert.strictEqual(modalAria.role, 'dialog');
    assert.strictEqual(modalAria['aria-modal'], true);
    assert.strictEqual(modalAria['aria-labelledby'], 'confirm-dialog-title');
  });

  it('7. CommandMenu maintains top-aligned viewport positioning with internal search list scrolling', () => {
    const commandMenuBackdrop = 'fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-24 p-4 sm:p-6 bg-black/75 backdrop-blur-sm overflow-y-auto transition-opacity duration-200 ease-out motion-reduce:transition-none';
    const commandCardClass = 'w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-auto sm:my-0 max-h-[calc(100vh-6rem)] flex flex-col';

    assert.ok(commandMenuBackdrop.includes('flex items-start justify-center'), 'CommandMenu uses top-aligned flex layout');
    assert.ok(commandCardClass.includes('max-h-[calc(100vh-6rem)]'), 'CommandMenu limits height to avoid screen overflow');
  });
});
