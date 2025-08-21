import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from "vite-plugin-pwa"

// NEW SEP09
// import vue from '@vitejs/plugin-vue'
// import vitePluginRequire from "vite-plugin-require";
// END SEP09

// new jul04
// const manifestForPlugin = {
//   manifest: {
//     name:"Orion",
//     short_name:"Orion",
//     icons:[{
//       src:'./src/assets/images/android-chrome-192x192.png',
//       sizes:'192x192',
//       type:'image/png',
//       purpose:'favicon'
//     },
//     {
//       src:'./src/assets/images/android-chrome-512x512.png',
//       sizes:'512x512',
//       type:'image/png',
//       purpose:'favicon'
//     },
//     {
//       src:'./src/assets/images/apple-touch-icon.png',
//       sizes:'180x180',
//       type:'image/png',
//       purpose:'apple touch icon'
//     }]
//   }
// }
// end jul04

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // NEW SEP09
    // vue(),
		// vitePluginRequire(),
    // END SEP09
    react(),
    VitePWA({
      registerType:'autoUpdate',
      manifest: {
        name:'Orion',
        short_name:'Orion',
        description:'ERP Orion',
        theme_color:'#ffffff',
        icons: [{
          src:'/android-chrome-192x192.png',
          sizes:'192x192',
          type:'image/png',
          purpose:'any'
        },
        {
          src:'/android-chrome-512x512.png',
          sizes:'512x512',
          type:'image/png',
          purpose:'any'
        },
        {
          src:'/apple-touch-icon.png',
          sizes:'180x180',
          type:'image/png',
          purpose:'any'
        },
        ]
      }
    })
  ],
  // build: {
  //   rollupOptions: {
  //     external: [
  //       "jsPDF", // ignore react stuff
  //       "jspdf-autotable",
  //     ],
  //   },
  // },
  // optimizeDeps: {
  //   exclude: ['js-big-decimal']
  // }
})
