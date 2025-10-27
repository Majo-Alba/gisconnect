import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then(reg => console.log('[SW] registered at scope:', reg.scope))
    .catch(err => console.error('[SW] register failed:', err));
  });
}
  
  ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// import { registerSW } from 'virtual:pwa-register'
// registerSW({ immediate: true })

// import React from 'react'
// import ReactDOM from 'react-dom/client'
// import App from './App.jsx'
// import './index.css' // keep your global CSS import

// /** -------- Viewport fix for mobile URL bars --------
//  * Keeps --vh equal to the real innerHeight so 100vh layouts
//  * don't get pushed when Chrome's URL bar shows/hides.
//  */
// function setVh() {
//   const vh = window.innerHeight * 0.01
//   document.documentElement.style.setProperty('--vh', `${vh}px`)
// }
// // Run ASAP for first paint
// setVh()
// // Update on common changes
// window.addEventListener('resize', setVh, { passive: true })
// window.addEventListener('orientationchange', setVh, { passive: true })
// window.addEventListener('pageshow', setVh, { passive: true })   // bfcache
// window.addEventListener('visibilitychange', () => {
//   if (!document.hidden) setVh()
// }, { passive: true })
// /** ------------------------------------------------- */

// ReactDOM.createRoot(document.getElementById('root')).render(
//   // <React.StrictMode>
//   <App />
//   // </React.StrictMode>
// )







// // this is my main.jsx, can you help me direct edit 
// import { registerSW } from 'virtual:pwa-register'
// registerSW({ immediate: true })

// import React from 'react'
// import ReactDOM from 'react-dom/client'
// import App from './App.jsx'
// import './index.css'

// ReactDOM.createRoot(document.getElementById('root')).render(
//   //<React.StrictMode>
//     <App />
//   //</React.StrictMode>,
// )

