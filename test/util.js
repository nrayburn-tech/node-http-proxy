/**
 *
 * @param {import('http').Server} servers
 * @returns {Promise<void>}
 */
export async function waitForClosed(...servers) {
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
