async function canLoadTreeSitterRuntime(): Promise<boolean> {
  const previousElectronRunAsNode = process.env['ELECTRON_RUN_AS_NODE'];

  delete process.env['ELECTRON_RUN_AS_NODE'];

  try {
    await import('tree-sitter');
    return true;
  } catch {
    return false;
  } finally {
    if (previousElectronRunAsNode === undefined) {
      delete process.env['ELECTRON_RUN_AS_NODE'];
    } else {
      process.env['ELECTRON_RUN_AS_NODE'] = previousElectronRunAsNode;
    }
  }
}

export const hasTreeSitterRuntime = await canLoadTreeSitterRuntime();
