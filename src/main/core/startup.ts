export async function tryAutoStartProxy(
  autoStartProxy: boolean,
  startProxy: () => Promise<unknown>,
  onError: (error: unknown) => void = () => {}
): Promise<void> {
  if (!autoStartProxy) {
    return;
  }

  try {
    await startProxy();
  } catch (error) {
    onError(error);
  }
}
