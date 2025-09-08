const UAParser = require('ua-parser-js');

const getDeviceDetails = (req) => {
  const parser = new UAParser(req.headers['user-agent']);
  const result = parser.getResult();

  return {
    browser: result.browser.name + ' ' + result.browser.version,
    os: result.os.name + ' ' + result.os.version,
    deviceType: result.device.type || 'desktop',
    deviceVendor: result.device.vendor || 'unknown',
    deviceModel: result.device.model || 'unknown',
    platform: result.platform?.type || 'web'
  };
}; // Function to get device details from request headers

module.exports = { getDeviceDetails };
