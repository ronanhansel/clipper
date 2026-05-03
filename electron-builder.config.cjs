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
  mac: {
    icon: "build/electron/icon.icns",
  },
  dmg: {
    icon: "build/electron/icon.icns",
  },
  win: {
    icon: "build/electron/icon.ico",
  },
  linux: {
    icon: "build/electron/icon.png",
  },
};
