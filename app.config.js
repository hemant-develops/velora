const appJson = require("./app.json");

const config = appJson.expo;

config.android = {
  ...config.android,
  googleServicesFile:
    process.env.GOOGLE_SERVICES_JSON || "./firebase/google-services.json",
};

module.exports = { expo: config };
