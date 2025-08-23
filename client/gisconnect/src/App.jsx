import './App.css'
import {BrowserRouter, Routes, Route} from 'react-router-dom'
import { UserContext } from './contexts/UserContext'
import { useState } from 'react'

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
// import OrderTracker from './components/orderTracker'
import OrderNow from './components/orderNow'
// import OrderDetails from './components/orderDetails'
import NewOrder from './components/newOrder'
import NewQuotes from './components/newQuotes'
import AdminHome from './components/adminHome'
import QuoteDetails from './components/quoteDetails'
import NewOrders from './components/newOrders'
// import PaymentValidation from './components/paymentValidation'
import GeneratedQuotes from './components/generatedQuotes'
import PendingPack from './components/pendingPack'
import PackDetails from './components/packDetails'
import ManageDelivery from './components/manageDelivery'
// import ShippingDetails from './components/shippingDetails'
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

// import ProductDetails from './components/productDetails';

// GISCONNECT - END


function App() {

  const [loggedUser, setLoggedUser] = useState(localStorage.getItem("orion-user"))

  return (
    <>
      <UserContext.Provider value = {{loggedUser,setLoggedUser}}>

        <BrowserRouter>
          <Routes>
            <Route path='*' element={<Notfound/>}/>

            {/* GISCONNECT START */}
            <Route path='/' element={<GeneralLogin/>}/>
            <Route path='/restorePassword' element={<RestorePassword/>}/>
            <Route path="/reset-password/:token" element={<ResetPassword/>} />

            <Route path='/newSignup' element={<Private Component={NewSignupData}/>}/>
            <Route path='/userHome' element={<Private Component={UserHome}/>}/>

            <Route path='/expressQuote' element={<Private Component={ExpressQuote}/>}/>
            <Route path='/userProfile' element={<Private Component={UserProfile}/>}/>
            <Route path='/editAddress' element={<Private Component={EditAddress}/>}/>
            <Route path='/editInvoice' element={<Private Component={EditInvoice}/>}/>
            <Route path='/myOrders' element={<Private Component={MyOrders}/>}/>
            <Route path="/orderDetail/:orderId" element={<Private Component={OrderTrackDetails} />} />

            {/* <Route path='/orderTracker' element={<Private Component={OrderTracker}/>}/> */}
            <Route path='/orderNow' element={<Private Component={OrderNow}/>}/>
            {/* <Route path='/orderDetails' element={<Private Component={OrderDetails}/>}/> */}
            <Route path='/newOrder' element={<Private Component={NewOrder}/>}/>
            <Route path='/catalogue' element={<Private Component={CatalogueMain}/>}/>
            <Route path='/product' element={<Private Component={ProductDetails}/>}/>

            <Route path='/adminHome' element={<Private Component={AdminHome}/>}/>

            <Route path='/newQuotes' element={<Private Component={NewQuotes}/>}/>
            <Route path="/quoteDetails/:id" element={<Private Component={QuoteDetails}/>} />
            <Route path='/newOrders' element={<Private Component={NewOrders}/>}/>
            <Route path="/newOrders/:orderId" element={<Private Component={NewOrderDetails}/>} />

            {/* <Route path='/paymentValidation' element={<Private Component={PaymentValidation}/>}/> */}
            <Route path='/quotes' element={<Private Component={GeneratedQuotes}/>}/>

            <Route path='/toPack' element={<Private Component={PendingPack}/>}/>
            <Route path="/packDetails/:orderId" element={<Private Component ={PackDetails}/>} />

            <Route path='/manageDelivery' element={<Private Component={ManageDelivery}/>}/>
            <Route path="/manageDelivery/:orderId" element={<Private Component={ManageDeliveryDetails} />} />

            {/* <Route path='/shippingDetails' element={<Private Component={ShippingDetails}/>}/> */}

            <Route path='/deliverReady' element={<Private Component={DeliverReady}/>}/>
            <Route path='/deliveryDetails/:orderId' element={<Private Component={DeliveryDetails}/>}/>

            <Route path='/delivered' element={<Private Component={DeliveredOrders}/>}/>
            <Route path='/deliveredSummary/:orderId' element={<Private Component={DeliveredSummary}/>}/>

            {/* GISCONNECT END */}


          </Routes>
        </BrowserRouter>
        
      </UserContext.Provider>
    </>
  )
  
}

export default App
