const { readdir } = require('node:fs/promises');
const { join } = require('node:path');

const projectRootDir = join(__dirname, '..'),
  examplesDir = join(projectRootDir, 'examples');

for (const dir of ['balancer', 'http', 'middleware', 'websocket']) {
  readdir(join(examplesDir, dir)).then((files) => {
    const errors = [];
    files.forEach((file) => {
      const example = join(examplesDir, dir, file);
      try {
        console.log(`Starting example ${example}`);
        require(example);
        console.log(`Finished example ${example}`);
      } catch (error) {
        errors.push(error);
        console.warn(`Error running example ${example}.`, error);
      }
    });

    // Using a timeout can be flaky. The alternative is making sure the servers
    // are closed properly in the examples.
    setTimeout(() => {
      if (!errors.length) {
        process.exit(0);
      } else {
        console.error(errors);
        process.exit(1);
      }
    }, 2_000);
  });
}
