module.exports = {
  name: 'Ayni', slug: 'ayni-vecinal', version: '1.0.0', scheme: 'ayni',
  android: { package: 'pe.ayni.vecinal', ...(process.env.GOOGLE_SERVICES_JSON ? {googleServicesFile:process.env.GOOGLE_SERVICES_JSON} : {}) },
  ios: { bundleIdentifier: 'pe.ayni.vecinal', infoPlist: {NSMicrophoneUsageDescription:'Graba una nota cuando decidas adjuntarla a tu reporte.'} },
  plugins: ['expo-notifications',['expo-location',{ locationWhenInUsePermission:'Ayni usa tu ubicación para identificar tu zona vecinal.' }]],
  extra: { origin:process.env.AYNI_ORIGIN || '', eas:{projectId:process.env.EAS_PROJECT_ID || ''} }
};
