export async function waitForClosed(
  ...servers: {
    addListener: (event: 'close', listener: () => void) => void;
  }[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const openServers = new Set(servers);
    servers.forEach((server) => {
      server.addListener('close', () => {
        openServers.delete(server);
        if (openServers.size === 0) {
          resolve();
        }
      });
    });

    setTimeout(() => {
      console.log('Open Servers:', openServers);
      reject(
        `All servers have not finished closing. ${openServers.size} are still not closed.`,
      );
    }, 1000 * 5);
  });
}
