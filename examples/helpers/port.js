let port = 8000;
function getPort() {
  return port++;
}

module.exports = {
  getPort,
};
