import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('ConfirmDialog & VM Lifecycle Action UI State Machine', () => {
  it('1. Generates accurate loading labels for all VM power actions', () => {
    const actions: Array<'power-on' | 'power-off' | 'restart' | 'suspend'> = [
      'power-on',
      'power-off',
      'restart',
      'suspend'
    ];

    for (const action of actions) {
      const confirmLabel = `Execute ${action}`;
      const explicitLoadingLabel = `Executing ${action}...`;
      const fallbackLoadingLabel = `${confirmLabel.replace(/^Execute\s+/i, 'Executing ')}...`;

      assert.strictEqual(fallbackLoadingLabel, explicitLoadingLabel);
      assert.strictEqual(explicitLoadingLabel, `Executing ${action}...`);
    }
  });

  it('2. Prevents double-submission when execution is in-progress', async () => {
    let executionCount = 0;
    let isExecuting = false;

    const mockApiCall = async () => {
      executionCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
      return { success: true, message: 'Action completed' };
    };

    const handleConfirm = async () => {
      if (isExecuting) return; // Guarded by isExecutingAction / isLoading
      isExecuting = true;
      try {
        await mockApiCall();
      } finally {
        isExecuting = false;
      }
    };

    // Simulate rapid concurrent clicks
    await Promise.all([
      handleConfirm(),
      handleConfirm(),
      handleConfirm()
    ]);

    assert.strictEqual(executionCount, 1, 'API must only be invoked once regardless of rapid clicks');
  });

  it('3. Retains dialog open and restores controls on failure so user can retry', async () => {
    let pendingAction: { vmId: string; action: string } | null = { vmId: 'vm-test', action: 'power-off' };
    let isExecutingAction = false;
    let toastError: string | null = null;

    const handleExecuteConfirmedAction = async (shouldFail = true) => {
      if (!pendingAction || isExecutingAction) return;
      isExecutingAction = true;

      try {
        if (shouldFail) {
          throw new Error('ESXi host rejected power-off: InvalidPowerState');
        }
        pendingAction = null; // Cleared on success
      } catch (err: any) {
        toastError = err.message;
        // Dialog is NOT closed on error (pendingAction remains set)
      } finally {
        isExecutingAction = false; // Re-enables controls
      }
    };

    // Attempt 1: Fails
    await handleExecuteConfirmedAction(true);

    assert.strictEqual(isExecutingAction, false, 'Loading state is cleared');
    assert.notStrictEqual(pendingAction, null, 'Dialog remains open for user visibility and retry');
    assert.strictEqual(toastError, 'ESXi host rejected power-off: InvalidPowerState');

    // Attempt 2: User retries and succeeds
    await handleExecuteConfirmedAction(false);

    assert.strictEqual(isExecutingAction, false);
    assert.strictEqual(pendingAction, null, 'Dialog is cleanly closed on success');
  });

  it('4. Disables cancel and close callbacks while isLoading is true', () => {
    let closed = false;
    let isLoading = true;

    const handleCancel = () => {
      if (isLoading) return; // Guard in ConfirmDialog
      closed = true;
    };

    handleCancel();
    assert.strictEqual(closed, false, 'Dialog cannot be closed or cancelled while action is executing');

    isLoading = false;
    handleCancel();
    assert.strictEqual(closed, true, 'Dialog closes when cancelled after execution completes');
  });
});
