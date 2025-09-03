import './App.css'
import {BrowserRouter, Routes, Route, useLocation, useNavigate} from 'react-router-dom'
import { UserContext } from './contexts/UserContext'
import { useMemo, useState } from 'react'

import Notfound from './components/NotFound'
import Private from './components/Private'

// GISCONNECT - START
import NewSignupData from './components/newData'
import GeneralLogin from './components/generalLogin'
import UserHome from './components/userHome'
import ExpressQuote from './components/expressQuote'
import UserProfile from './components/userProfile'
import EditAddress from './components/editAddress'
import EditInvoice from './components/editInvoice'
import OrderNow from './components/orderNow'
import NewOrder from './components/newOrder'
import NewQuotes from './components/newQuotes'
import AdminHome from './components/adminHome'
import QuoteDetails from './components/quoteDetails'
import NewOrders from './components/newOrders'
import GeneratedQuotes from './components/generatedQuotes'
import PendingPack from './components/pendingPack'
import PackDetails from './components/packDetails'
import ManageDelivery from './components/manageDelivery'
import DeliverReady from './components/deliverReady'
import DeliveryDetails from './components/deliveryDetails'
import DeliveredOrders from './components/deliveredOrders'
import CatalogueMain from './components/catalogueMain'
import ProductDetails from './components/productDetails'
import MyOrders from './components/myOrders'
import OrderTrackDetails from './components/orderTrackDetails'
import RestorePassword from './components/restorePassword'
import ResetPassword from './components/resetPassword'
import NewOrderDetails from './components/newOrderDetails'
import ManageDeliveryDetails from './components/manageDeliveryDetails'
import DeliveredSummary from './components/deliveredSummary'
// GISCONNECT - END

function AdminRoute({ pathPrefix, Component }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isAdmin = (localStorage.getItem("isAdmin") || "false") === "true";
  const rawScope = localStorage.getItem("adminScope");
  const adminScope = useMemo(() => {
    try { return JSON.parse(rawScope); } catch { return rawScope; }
  }, [rawScope]);

  // Helper: can access?
  const canAccess = () => {
    if (!isAdmin) return false;
    if (adminScope === "ALL") return true;
    if (!Array.isArray(adminScope)) return false;
    const current = location.pathname; // e.g. /packDetails/123
    // Allow if any allowed prefix matches the current path
    return adminScope.some((prefix) => current.startsWith(prefix));
  };

  if (!canAccess()) {
    // If not admin or no scope, send to userHome or a 404
    // You can swap <Notfound/> if preferred
    navigate("/adminHome", { replace: true });
    return null;
  }
  return <Component />;
}

function App() {
  const [loggedUser, setLoggedUser] = useState(localStorage.getItem("orion-user"))

  return (
    <>
      <UserContext.Provider value={{ loggedUser, setLoggedUser }}>
        <BrowserRouter>
          <Routes>
            <Route path='*' element={<Notfound/>}/>

            {/* GISCONNECT START */}
            <Route path='/' element={<GeneralLogin/>}/>
            <Route path='/restorePassword' element={<RestorePassword/>}/>
            <Route path="/reset-password/:token" element={<ResetPassword/>} />
            <Route path='/newSignup' element={<NewSignupData/>}/>

            {/* USER SIDE (protected by your Private wrapper) */}
            <Route path='/userHome' element={<Private Component={UserHome}/>}/>
            <Route path='/expressQuote' element={<Private Component={ExpressQuote}/>}/>
            <Route path='/userProfile' element={<Private Component={UserProfile}/>}/>
            <Route path='/editAddress' element={<Private Component={EditAddress}/>}/>
            <Route path='/editInvoice' element={<Private Component={EditInvoice}/>}/>
            <Route path='/myOrders' element={<Private Component={MyOrders}/>}/>
            <Route path="/orderDetail/:orderId" element={<Private Component={OrderTrackDetails} />} />
            <Route path='/orderNow' element={<Private Component={OrderNow}/>}/>
            <Route path='/newOrder' element={<Private Component={NewOrder}/>}/>
            <Route path='/catalogue' element={<Private Component={CatalogueMain}/>}/>
            <Route path='/product' element={<Private Component={ProductDetails}/>}/>

            {/* ADMIN ENTRY */}
            <Route path='/adminHome' element={<AdminHome/>}/>

            {/* ADMIN ROUTES — now guarded by AdminRoute */}
            <Route path='/quotes' element={<AdminRoute pathPrefix="/quotes" Component={GeneratedQuotes} />}/>
            <Route path='/toPack' element={<AdminRoute pathPrefix="/toPack" Component={PendingPack} />}/>
            <Route path='/packDetails/:orderId' element={<AdminRoute pathPrefix="/packDetails" Component={PackDetails} />}/>
            <Route path='/manageDelivery' element={<AdminRoute pathPrefix="/manageDelivery" Component={ManageDelivery} />}/>
            <Route path='/manageDelivery/:orderId' element={<AdminRoute pathPrefix="/manageDelivery" Component={ManageDeliveryDetails} />}/>
            <Route path='/deliverReady' element={<AdminRoute pathPrefix="/deliverReady" Component={DeliverReady} />}/>
            <Route path='/deliveryDetails/:orderId' element={<AdminRoute pathPrefix="/deliveryDetails" Component={DeliveryDetails} />}/>
            <Route path='/delivered' element={<AdminRoute pathPrefix="/delivered" Component={DeliveredOrders} />}/>
            <Route path='/deliveredSummary/:orderId' element={<AdminRoute pathPrefix="/deliveredSummary" Component={DeliveredSummary} />}/>

            {/* If you still need these non-guarded admin pages, keep them; otherwise remove */}
            {/* <Route path='/newQuotes' element={<NewQuotes/>}/>
            <Route path="/quoteDetails/:id" element={<QuoteDetails/>} />
            <Route path='/newOrders' element={<NewOrders/>}/>
            <Route path="/newOrders/:orderId" element={<NewOrderDetails/>} /> */}

            {/* GISCONNECT END */}
          </Routes>
        </BrowserRouter>
      </UserContext.Provider>
    </>
  )
}

export default App

// import './App.css'
// import {BrowserRouter, Routes, Route} from 'react-router-dom'
// import { UserContext } from './contexts/UserContext'
// import { useState } from 'react'

// import Notfound from './components/NotFound'
// import Private from './components/Private'

// // GISCONNECT - START
// import NewSignupData from './components/newData'
// import GeneralLogin from './components/generalLogin'
// import UserHome from './components/userHome'
// import ExpressQuote from './components/expressQuote'
// import UserProfile from './components/userProfile'
// import EditAddress from './components/editAddress'
// import EditInvoice from './components/editInvoice'
// // import OrderTracker from './components/orderTracker'
// import OrderNow from './components/orderNow'
// // import OrderDetails from './components/orderDetails'
// import NewOrder from './components/newOrder'
// import NewQuotes from './components/newQuotes'
// import AdminHome from './components/adminHome'
// import QuoteDetails from './components/quoteDetails'
// import NewOrders from './components/newOrders'
// // import PaymentValidation from './components/paymentValidation'
// import GeneratedQuotes from './components/generatedQuotes'
// import PendingPack from './components/pendingPack'
// import PackDetails from './components/packDetails'
// import ManageDelivery from './components/manageDelivery'
// // import ShippingDetails from './components/shippingDetails'
// import DeliverReady from './components/deliverReady'
// import DeliveryDetails from './components/deliveryDetails'
// import DeliveredOrders from './components/deliveredOrders'
// import CatalogueMain from './components/catalogueMain'
// import ProductDetails from './components/productDetails'
// import MyOrders from './components/myOrders'
// import OrderTrackDetails from './components/orderTrackDetails'
// import RestorePassword from './components/restorePassword'
// import ResetPassword from './components/resetPassword'
// import NewOrderDetails from './components/newOrderDetails'
// import ManageDeliveryDetails from './components/manageDeliveryDetails'
// import DeliveredSummary from './components/deliveredSummary'

// // import ProductDetails from './components/productDetails';

// // GISCONNECT - END


// function App() {

//   const [loggedUser, setLoggedUser] = useState(localStorage.getItem("orion-user"))

//   return (
//     <>
//       <UserContext.Provider value = {{loggedUser,setLoggedUser}}>

//         <BrowserRouter>
//           <Routes>
//             <Route path='*' element={<Notfound/>}/>

//             {/* GISCONNECT START */}
//             <Route path='/' element={<GeneralLogin/>}/>
//             <Route path='/restorePassword' element={<RestorePassword/>}/>
//             <Route path="/reset-password/:token" element={<ResetPassword/>} />
//             <Route path='/newSignup' element={<NewSignupData/>}/>

//             <Route path='/userHome' element={<Private Component={UserHome}/>}/>

//             <Route path='/expressQuote' element={<Private Component={ExpressQuote}/>}/>
//             <Route path='/userProfile' element={<Private Component={UserProfile}/>}/>
//             <Route path='/editAddress' element={<Private Component={EditAddress}/>}/>
//             <Route path='/editInvoice' element={<Private Component={EditInvoice}/>}/>
//             <Route path='/myOrders' element={<Private Component={MyOrders}/>}/>
//             <Route path="/orderDetail/:orderId" element={<Private Component={OrderTrackDetails} />} />

//             {/* <Route path='/orderTracker' element={<Private Component={OrderTracker}/>}/> */}
//             <Route path='/orderNow' element={<Private Component={OrderNow}/>}/>
//             {/* <Route path='/orderDetails' element={<Private Component={OrderDetails}/>}/> */}
//             <Route path='/newOrder' element={<Private Component={NewOrder}/>}/>
//             <Route path='/catalogue' element={<Private Component={CatalogueMain}/>}/>
//             <Route path='/product' element={<Private Component={ProductDetails}/>}/>

//             <Route path='/adminHome' element={<AdminHome/>}/>
//             {/* <Route path='/newQuotes' element={<Private Component={NewQuotes}/>}/> */}

//             <Route path='/newQuotes' element={<NewQuotes/>}/>
//             <Route path="/quoteDetails/:id" element={<QuoteDetails/>} />
//             <Route path='/newOrders' element={<NewOrders/>}/>
//             <Route path="/newOrders/:orderId" element={<NewOrderDetails/>} />

//             {/* <Route path='/paymentValidation' element={<Private Component={PaymentValidation}/>}/> */}
//             <Route path='/quotes' element={<GeneratedQuotes/>}/>

//             <Route path='/toPack' element={<PendingPack/>}/>
//             <Route path="/packDetails/:orderId" element={<PackDetails/>} />

//             <Route path='/manageDelivery' element={<ManageDelivery/>}/>
//             <Route path="/manageDelivery/:orderId" element={<ManageDeliveryDetails />} />

//             {/* <Route path='/shippingDetails' element={<Private Component={ShippingDetails}/>}/> */}

//             <Route path='/deliverReady' element={<DeliverReady/>}/>
//             <Route path='/deliveryDetails/:orderId' element={<DeliveryDetails/>}/>

//             <Route path='/delivered' element={<DeliveredOrders/>}/>
//             <Route path='/deliveredSummary/:orderId' element={<DeliveredSummary/>}/>

//             {/* GISCONNECT END */}


//           </Routes>
//         </BrowserRouter>
        
//       </UserContext.Provider>
//     </>
//   )
  
// }

// export default App
