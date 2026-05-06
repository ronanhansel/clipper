const notarize =
  process.env.APPLE_ID &&
  process.env.APPLE_APP_SPECIFIC_PASSWORD &&
  process.env.APPLE_TEAM_ID
    ? {
        teamId: process.env.APPLE_TEAM_ID,
      }
    : false;

module.exports = {
  appId: "app.clipper.editor",
  productName: "Clipper",
  directories: {
    buildResources: "build/electron",
  },
  files: [
    "dist/**",
    "dist-electron/**",
    "build/electron/icon.png",
    "package.json",
  ],
  artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
  mac: {
    icon: "build/electron/icon.icns",
    category: "public.app-category.video",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    notarize,
    target: [
      {
        target: "dmg",
        arch: ["arm64", "x64"],
      },
      {
        target: "zip",
        arch: ["arm64", "x64"],
      },
    ],
  },
  dmg: {
    icon: "build/electron/icon.icns",
  },
  publish: [
    {
      provider: "github",
      owner: "ronanhansel",
      repo: "clipper",
      releaseType: "release",
    },
  ],
  win: {
    icon: "build/electron/icon.ico",
  },
  linux: {
    icon: "build/electron/icon.png",
  },
};
